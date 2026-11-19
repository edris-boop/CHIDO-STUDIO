import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { execFile } from 'child_process';
import { createServer as createViteServer } from 'vite';
import {
  ASSETS_ROOT,
  ensureProductFolders,
  loadOrSeedStudioState,
  saveStudioState,
  sha256Buffer,
  writeProductManifest,
} from './server/seedAssets';
import { convertPngBufferToJpg, createSampleTransparentPng } from './server/lib/imageConverter';
import { buildFurnitureGlb } from './server/lib/glbGenerator';
import {
  type BatchPipelineAction,
  createLockedTransfer,
  mapBatchActionToStatus,
  nextRevisionLabel,
  resolveProductDiskPath,
  sanitizePathSegment,
} from './src/core/studioLogic';
import type {
  AssetSubfolder,
  BrowserProbeResult,
  Company,
  Invoice,
  ModelingRequest,
  Product,
  ProductAssetFile,
  ProductRevision,
  ReviewMessageStatus,
  StudioState,
} from './src/core/types';

const PORT = 3000;
let state: StudioState = loadOrSeedStudioState();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const staging = path.join(ASSETS_ROOT, '_Staging');
      fs.mkdirSync(staging, { recursive: true });
      cb(null, staging);
    },
    filename: (_req, file, cb) => {
      const safe = sanitizePathSegment(file.originalname);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function appendLog(
  actor: string,
  category: StudioState['logs'][number]['category'],
  message: string,
  projectCode?: string
) {
  state.logs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    actor,
    category,
    message,
    projectCode,
    createdAt: new Date().toISOString(),
  });
  if (state.logs.length > 200) state.logs.length = 200;
}

function getSafeDiskPath(relPath: string): string | null {
  const cleanRel = relPath.replace(/^\/+/, '');
  const resolved = path.resolve(ASSETS_ROOT, cleanRel);
  if (!resolved.startsWith(ASSETS_ROOT)) return null;
  return resolved;
}

interface DiskNode {
  name: string;
  relativePath: string;
  type: 'dir' | 'file';
  sizeBytes?: number;
  children?: DiskNode[];
}

function scanDirectoryTree(dirAbs: string, relBase = '', depth = 0): DiskNode[] {
  if (depth > 5 || !fs.existsSync(dirAbs)) return [];
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const result: DiskNode[] = [];
  for (const entry of entries) {
    if (entry.name === 'studio-db.json' || entry.name === 'studio-db.json.tmp') continue;
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    const full = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        relativePath: rel,
        type: 'dir',
        children: scanDirectoryTree(full, rel, depth + 1),
      });
    } else {
      const st = fs.statSync(full);
      result.push({
        name: entry.name,
        relativePath: rel,
        type: 'file',
        sizeBytes: st.size,
      });
    }
  }
  return result;
}

function computeDirectoryBytes(dirAbs: string): { totalBytes: number; fileCount: number } {
  let totalBytes = 0;
  let fileCount = 0;
  if (!fs.existsSync(dirAbs)) return { totalBytes, fileCount };
  const stack = [dirAbs];
  while (stack.length > 0) {
    const curr = stack.pop()!;
    for (const entry of fs.readdirSync(curr, { withFileTypes: true })) {
      const full = path.join(curr, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        fileCount += 1;
        totalBytes += fs.statSync(full).size;
      }
    }
  }
  return { totalBytes, fileCount };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Full studio state + real disk stats
  app.get('/api/state', (_req, res) => {
    const diskStats = computeDirectoryBytes(ASSETS_ROOT);
    res.json({ state, diskStats });
  });

  // Set active company / project
  app.post('/api/active-project', (req, res) => {
    const { activeCompanyId, activeProjectId } = req.body as {
      activeCompanyId?: string | null;
      activeProjectId?: string | null;
    };
    if (activeCompanyId !== undefined) state.activeCompanyId = activeCompanyId;
    if (activeProjectId !== undefined) {
      state.activeProjectId = activeProjectId;
      const proj = state.products.find((p) => p.id === activeProjectId);
      if (proj) {
        state.activeCompanyId = proj.companyId;
        appendLog('Studio', 'project', `پروژه فعال روی ${proj.code} (${proj.name}) تنظیم شد.`, proj.code);
      } else {
        appendLog('Studio', 'project', 'حالت بدون پروژه فعال انتخاب شد (ورودی‌ها به _Inbox هدایت می‌شوند).');
      }
    }
    saveStudioState(state);
    res.json({ state });
  });

  // Real disk directory tree
  app.get('/api/assets/tree', (_req, res) => {
    const tree = scanDirectoryTree(ASSETS_ROOT);
    const diskStats = computeDirectoryBytes(ASSETS_ROOT);
    res.json({ rootPath: ASSETS_ROOT, tree, diskStats });
  });

  // Serve real file from chido-assets/
  app.get('/api/assets/file', (req, res) => {
    const rel = String(req.query.path || '');
    const full = getSafeDiskPath(rel);
    if (!full || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.status(404).json({ error: 'File not found on disk' });
      return;
    }
    if (full.endsWith('.glb')) {
      res.setHeader('Content-Type', 'model/gltf-binary');
    }
    res.sendFile(full);
  });

  // Create physical folder
  app.post('/api/assets/folder', (req, res) => {
    const { parentRelPath, folderName } = req.body as { parentRelPath?: string; folderName?: string };
    const safeName = sanitizePathSegment(folderName || '');
    if (!safeName || safeName === 'untitled') {
      res.status(400).json({ error: 'نام پوشه الزامی است' });
      return;
    }
    const targetRel = parentRelPath ? `${parentRelPath}/${safeName}` : safeName;
    const full = getSafeDiskPath(targetRel);
    if (!full) {
      res.status(400).json({ error: 'مسیر نامعتبر است' });
      return;
    }
    fs.mkdirSync(full, { recursive: true });
    appendLog('Asset Manager', 'asset', `پوشه جدید روی دیسک ایجاد شد: ${targetRel}`);
    saveStudioState(state);
    res.json({ ok: true, relativePath: targetRel, tree: scanDirectoryTree(ASSETS_ROOT) });
  });

  // Upload real files (drag & drop or file input) -> staged in _Staging -> atomic move to target project or _Inbox
  app.post('/api/assets/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'فایلی ارسال نشد' });
      return;
    }

    const lockedProjectId = req.body.lockedProjectId ? String(req.body.lockedProjectId) : null;
    const subfolder = (req.body.subfolder || 'References') as AssetSubfolder;
    const convertPng = req.body.convertPng === 'true';
    const quality = Number(req.body.quality || state.settings.defaultJpgQuality || 92);
    const maxSizeKb = req.body.maxSizeKb ? Number(req.body.maxSizeKb) : state.settings.defaultMaxSizeKb;
    const keepOriginalPng = req.body.keepOriginalPng === 'true';
    const transparentBgHex = String(req.body.transparentBgHex || state.settings.transparentBgHex || '#FFFFFF');

    const transfer = createLockedTransfer({
      id: `tr-${Date.now()}`,
      direction: 'upload',
      sourceLabel: 'Drag & Drop / Local Upload',
      fileName: req.file.originalname,
      activeProjectIdAtStart: lockedProjectId,
      subfolder,
      sizeBytes: req.file.size,
      products: state.products,
      companies: state.companies,
    });

    const stagedPath = req.file.path;
    let rawBuf: Buffer = fs.readFileSync(stagedPath);
    let finalName = sanitizePathSegment(req.file.originalname);
    let mimeType = req.file.mimetype || 'application/octet-stream';
    let convertedFromPng = false;
    let conversionWarning: string | null = null;

    const product = state.products.find((p) => p.id === lockedProjectId);
    const destDirRel = product ? `${product.localFolderRelativePath}/${subfolder}` : '_Inbox';
    const destDirAbs = getSafeDiskPath(destDirRel)!;
    fs.mkdirSync(destDirAbs, { recursive: true });

    if (convertPng && finalName.toLowerCase().endsWith('.png')) {
      if (keepOriginalPng) {
        const origAbs = path.join(destDirAbs, finalName);
        fs.writeFileSync(origAbs, rawBuf);
        if (product) {
          product.files.push({
            id: `file-${Date.now()}-orig`,
            productId: product.id,
            subfolder,
            fileName: finalName,
            diskRelativePath: `${destDirRel}/${finalName}`,
            mimeType: 'image/png',
            sizeBytes: rawBuf.length,
            sha256: sha256Buffer(rawBuf),
            createdAt: new Date().toISOString(),
          });
        }
      }
      const conv = convertPngBufferToJpg(rawBuf, { quality, maxSizeKb, transparentBgHex });
      rawBuf = conv.buffer;
      finalName = finalName.replace(/\.png$/i, '.jpg');
      mimeType = 'image/jpeg';
      convertedFromPng = true;
      conversionWarning = conv.warning;
    }

    const finalAbs = path.join(destDirAbs, finalName);
    fs.writeFileSync(finalAbs, rawBuf);
    fs.rmSync(stagedPath, { force: true });

    const hash = sha256Buffer(rawBuf);
    const relPath = `${destDirRel}/${finalName}`;

    if (product) {
      const assetFile: ProductAssetFile = {
        id: `file-${Date.now()}`,
        productId: product.id,
        subfolder,
        fileName: finalName,
        diskRelativePath: relPath,
        mimeType,
        sizeBytes: rawBuf.length,
        sha256: hash,
        convertedFromPng,
        createdAt: new Date().toISOString(),
      };
      product.files.push(assetFile);
      product.updatedAt = new Date().toISOString();

      if (finalName.toLowerCase().endsWith('.glb')) {
        product.lastGlbFile = finalName;
        if (subfolder === 'Tripo') product.lastTripoFile = finalName;
        const ver = nextRevisionLabel(product.revisions);
        product.revisions.push({
          id: `rev-${Date.now()}`,
          productId: product.id,
          version: ver,
          source: subfolder === 'Tripo' ? 'tripo' : 'blender',
          fileName: finalName,
          diskRelativePath: relPath,
          sha256: hash,
          sizeBytes: rawBuf.length,
          status: 'local',
          notes: `فایل ${finalName} بارگذاری شد`,
          createdAt: new Date().toISOString(),
          isActiveOnline: false,
        });
      }
      writeProductManifest(product);
    }

    transfer.fileName = finalName;
    transfer.finalDiskPath = relPath;
    transfer.sizeBytes = rawBuf.length;
    transfer.sha256 = hash;
    transfer.status = 'completed';
    transfer.progress = 100;
    state.transfers.unshift(transfer);

    appendLog(
      'Asset Manager',
      'asset',
      `فایل ${finalName} در مسیر ${relPath} ذخیره شد${convertedFromPng ? ' (تبدیل PNG به JPG)' : ''}.`,
      product?.code
    );
    saveStudioState(state);

    res.json({
      ok: true,
      fileName: finalName,
      diskRelativePath: relPath,
      sha256: hash,
      sizeBytes: rawBuf.length,
      conversionWarning,
      state,
    });
  });

  // Soft-delete / move to _Archive or restore
  app.post('/api/assets/delete', (req, res) => {
    const { relativePath } = req.body as { relativePath: string };
    const abs = getSafeDiskPath(relativePath);
    if (!abs || !fs.existsSync(abs)) {
      res.status(404).json({ error: 'فایل یافت نشد' });
      return;
    }
    const archiveName = `${Date.now()}-${path.basename(abs)}`;
    const archiveAbs = path.join(ASSETS_ROOT, '_Archive', archiveName);
    fs.mkdirSync(path.dirname(archiveAbs), { recursive: true });
    fs.renameSync(abs, archiveAbs);

    for (const prod of state.products) {
      prod.files = prod.files.filter((f) => f.diskRelativePath !== relativePath);
      writeProductManifest(prod);
    }
    appendLog('Asset Manager', 'asset', `فایل به آرشیو امن منتقل شد: ${relativePath}`);
    saveStudioState(state);
    res.json({ ok: true, archivePath: `_Archive/${archiveName}`, state });
  });

  // PNG -> JPG converter on existing disk image or sample PNG
  app.post('/api/images/convert', (req, res) => {
    const {
      sourceRelativePath,
      lockedProjectId,
      quality,
      maxSizeKb,
      transparentBgHex,
      keepOriginalPng,
    } = req.body as {
      sourceRelativePath?: string;
      lockedProjectId?: string | null;
      quality?: number;
      maxSizeKb?: number | null;
      transparentBgHex?: string;
      keepOriginalPng?: boolean;
    };

    let pngBuffer: Buffer;
    let sourceName = 'captured_ai_image.png';
    let sourceAbs: string | null = null;

    if (sourceRelativePath) {
      const resolved = getSafeDiskPath(sourceRelativePath);
      if (!resolved || !fs.existsSync(resolved)) {
        res.status(404).json({ error: 'فایل PNG مبدا یافت نشد' });
        return;
      }
      sourceAbs = resolved;
      sourceName = path.basename(resolved);
      pngBuffer = fs.readFileSync(resolved);
    } else {
      pngBuffer = createSampleTransparentPng(320, 240);
    }

    const result = convertPngBufferToJpg(pngBuffer, {
      quality: quality ?? state.settings.defaultJpgQuality,
      maxSizeKb: maxSizeKb ?? state.settings.defaultMaxSizeKb,
      transparentBgHex: transparentBgHex ?? state.settings.transparentBgHex,
    });

    const project = state.products.find((p) => p.id === (lockedProjectId ?? state.activeProjectId));
    const targetSub: AssetSubfolder = 'AI Images';
    const destDirRel = project ? `${project.localFolderRelativePath}/${targetSub}` : '_Inbox';
    const destDirAbs = getSafeDiskPath(destDirRel)!;
    fs.mkdirSync(destDirAbs, { recursive: true });

    const jpgName = sourceName.toLowerCase().endsWith('.png')
      ? sourceName.replace(/\.png$/i, '.jpg')
      : `${sourceName}.jpg`;
    const jpgAbs = path.join(destDirAbs, jpgName);
    fs.writeFileSync(jpgAbs, result.buffer);

    if (sourceAbs && keepOriginalPng === false && sourceAbs !== jpgAbs && sourceAbs.endsWith('.png')) {
      fs.rmSync(sourceAbs, { force: true });
      if (project) {
        project.files = project.files.filter((f) => f.diskRelativePath !== sourceRelativePath);
      }
    }

    const relPath = `${destDirRel}/${jpgName}`;
    const hash = sha256Buffer(result.buffer);
    if (project) {
      const existingIdx = project.files.findIndex((f) => f.diskRelativePath === relPath);
      const entry: ProductAssetFile = {
        id: `file-${Date.now()}`,
        productId: project.id,
        subfolder: targetSub,
        fileName: jpgName,
        diskRelativePath: relPath,
        mimeType: 'image/jpeg',
        sizeBytes: result.convertedBytes,
        sha256: hash,
        convertedFromPng: true,
        createdAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) project.files[existingIdx] = entry;
      else project.files.push(entry);
      writeProductManifest(project);
    }

    appendLog(
      'Image Pipeline',
      'browser',
      `تبدیل ${sourceName} به ${jpgName} با کیفیت ${result.qualityUsed}% (${Math.round(result.convertedBytes / 1024)} KB).`,
      project?.code
    );
    saveStudioState(state);

    res.json({
      ok: true,
      jpgFileName: jpgName,
      diskRelativePath: relPath,
      width: result.width,
      height: result.height,
      originalBytes: result.originalBytes,
      convertedBytes: result.convertedBytes,
      qualityUsed: result.qualityUsed,
      targetSizeMet: result.targetSizeMet,
      warning: result.warning,
      state,
    });
  });

  // Real HTTP compatibility probe for Tripo, ChatGPT, Google, or any URL
  app.post('/api/browser/probe', async (req, res) => {
    const targetUrl = String(req.body.url || '').trim();
    const tabId = req.body.tabId ? String(req.body.tabId) : null;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      res.status(400).json({ error: 'آدرس باید با http:// یا https:// شروع شود' });
      return;
    }

    let probe: BrowserProbeResult;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const response = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        },
      });
      clearTimeout(timer);

      const xfo = response.headers.get('x-frame-options');
      const csp = response.headers.get('content-security-policy');
      const frameAncestorsMatch = csp ? /frame-ancestors\s+([^;]+)/i.exec(csp) : null;
      const frameAncestors = frameAncestorsMatch ? frameAncestorsMatch[1].trim() : null;

      const blockedByXfo = Boolean(xfo && /(deny|sameorigin)/i.test(xfo));
      const blockedByCsp = Boolean(frameAncestors && /('none'|'self')/i.test(frameAncestors));
      const iframeEmbeddable = !blockedByXfo && !blockedByCsp;

      probe = {
        url: targetUrl,
        reachable: true,
        statusCode: response.status,
        xFrameOptions: xfo,
        cspFrameAncestors: frameAncestors,
        iframeEmbeddable,
        requiresNativeWebContents: !iframeEmbeddable,
        reason: iframeEmbeddable
          ? 'هدر امنیتی مسدودکننده iframe مشاهده نشد؛ با این حال احراز هویت و دانلود مستقیم در Electron WebContentsView پایدارتر است.'
          : `سایت به دلیل هدر ${xfo ? `X-Frame-Options: ${xfo}` : `CSP frame-ancestors: ${frameAncestors}`} اجازه نمایش داخل iframe وب را نمی‌دهد و نیازمند موتور بومی Chromium (Electron WebContentsView / WebView2) است.`,
        probedAt: new Date().toISOString(),
      };
    } catch (err) {
      probe = {
        url: targetUrl,
        reachable: false,
        statusCode: null,
        xFrameOptions: null,
        cspFrameAncestors: null,
        iframeEmbeddable: false,
        requiresNativeWebContents: true,
        reason: `ارتباط مستقیم با سرور مقصد برقرار نشد (${err instanceof Error ? err.message : 'Network error'}). در محیط دسکتاپ Electron این آدرس از طریق شبکه سیستم کاربر بارگذاری می‌شود.`,
        probedAt: new Date().toISOString(),
      };
    }

    if (tabId) {
      const tab = state.browserTabs.find((t) => t.id === tabId);
      if (tab) {
        tab.url = targetUrl;
        tab.lastProbed = probe;
      }
    }
    appendLog('Browser Probe', 'browser', `بررسی سازگاری ${targetUrl}: وضعیت ${probe.statusCode ?? 'N/A'} | نیاز به WebContentsView: ${probe.requiresNativeWebContents ? 'بله' : 'خیر'}`);
    saveStudioState(state);
    res.json({ probe, state });
  });

  // Browser tabs management
  app.post('/api/browser/tabs', (req, res) => {
    const { action, tabId, title, url } = req.body as {
      action: 'add' | 'select' | 'close' | 'navigate';
      tabId?: string;
      title?: string;
      url?: string;
    };

    if (action === 'add') {
      const newTab = {
        id: `tab-${Date.now()}`,
        title: title || 'New Tab',
        url: url || 'https://www.google.com',
        iconKey: 'web' as const,
        isPinned: false,
        lastProbed: null,
      };
      state.browserTabs.push(newTab);
      state.activeBrowserTabId = newTab.id;
    } else if (action === 'select' && tabId) {
      state.activeBrowserTabId = tabId;
    } else if (action === 'close' && tabId && state.browserTabs.length > 1) {
      state.browserTabs = state.browserTabs.filter((t) => t.id !== tabId);
      if (state.activeBrowserTabId === tabId) {
        state.activeBrowserTabId = state.browserTabs[0].id;
      }
    } else if (action === 'navigate' && tabId && url) {
      const tab = state.browserTabs.find((t) => t.id === tabId);
      if (tab) {
        tab.url = url;
        if (title) tab.title = title;
      }
    }
    saveStudioState(state);
    res.json({ state });
  });

  // Capture a simulated/real browser download (Tripo GLB or ChatGPT PNG->JPG) locked to activeProjectId at start time
  app.post('/api/browser/capture-download', (req, res) => {
    const {
      sourceLabel,
      fileName,
      lockedProjectId,
      convertPngToJpg,
      quality,
      maxSizeKb,
      keepOriginalPng,
    } = req.body as {
      sourceLabel: 'Tripo' | 'ChatGPT' | 'Capture Image' | 'CHIDO Portal';
      fileName: string;
      lockedProjectId: string | null;
      convertPngToJpg?: boolean;
      quality?: number;
      maxSizeKb?: number | null;
      keepOriginalPng?: boolean;
    };

    const isGlb = fileName.toLowerCase().endsWith('.glb');
    const subfolder: AssetSubfolder = isGlb ? 'Tripo' : 'AI Images';
    const transfer = createLockedTransfer({
      id: `tr-${Date.now()}`,
      direction: 'download',
      sourceLabel,
      fileName,
      activeProjectIdAtStart: lockedProjectId,
      subfolder,
      sizeBytes: 0,
      products: state.products,
      companies: state.companies,
    });

    let payloadBuf: Buffer;
    let finalFileName = transfer.fileName;
    let converted = false;

    if (isGlb) {
      const preset = lockedProjectId?.includes('tol')
        ? 'table'
        : lockedProjectId?.includes('dgt')
          ? 'lamp'
          : lockedProjectId?.includes('0043')
            ? 'armchair'
            : 'sofa';
      payloadBuf = buildFurnitureGlb(preset);
    } else {
      const pngBuf = createSampleTransparentPng(360, 270);
      if (convertPngToJpg && finalFileName.toLowerCase().endsWith('.png')) {
        if (keepOriginalPng) {
          const origRel = transfer.finalDiskPath;
          const origAbs = getSafeDiskPath(origRel)!;
          fs.mkdirSync(path.dirname(origAbs), { recursive: true });
          fs.writeFileSync(origAbs, pngBuf);
        }
        const conv = convertPngBufferToJpg(pngBuf, {
          quality: quality ?? state.settings.defaultJpgQuality,
          maxSizeKb: maxSizeKb ?? state.settings.defaultMaxSizeKb,
          transparentBgHex: state.settings.transparentBgHex,
        });
        payloadBuf = conv.buffer;
        finalFileName = finalFileName.replace(/\.png$/i, '.jpg');
        converted = true;
      } else {
        payloadBuf = pngBuf;
      }
    }

    // Write to _Staging first, then atomic rename to final destination
    const stagedAbs = getSafeDiskPath(transfer.stagedTempPath)!;
    fs.mkdirSync(path.dirname(stagedAbs), { recursive: true });
    fs.writeFileSync(stagedAbs, payloadBuf);

    const project = state.products.find((p) => p.id === lockedProjectId);
    const destRel = project
      ? `${project.localFolderRelativePath}/${subfolder}/${finalFileName}`
      : `_Inbox/${finalFileName}`;
    const finalAbs = getSafeDiskPath(destRel)!;
    fs.mkdirSync(path.dirname(finalAbs), { recursive: true });
    fs.renameSync(stagedAbs, finalAbs);

    const hash = sha256Buffer(payloadBuf);
    transfer.fileName = finalFileName;
    transfer.finalDiskPath = destRel;
    transfer.sizeBytes = payloadBuf.length;
    transfer.sha256 = hash;
    transfer.status = 'completed';
    transfer.progress = 100;
    state.transfers.unshift(transfer);

    if (project) {
      project.files.push({
        id: `file-${Date.now()}`,
        productId: project.id,
        subfolder,
        fileName: finalFileName,
        diskRelativePath: destRel,
        mimeType: isGlb ? 'model/gltf-binary' : converted ? 'image/jpeg' : 'image/png',
        sizeBytes: payloadBuf.length,
        sha256: hash,
        originUrl: sourceLabel === 'Tripo' ? 'https://www.tripo3d.ai' : 'https://chatgpt.com',
        convertedFromPng: converted,
        createdAt: new Date().toISOString(),
      });
      if (isGlb) {
        project.lastTripoFile = finalFileName;
        project.lastGlbFile = finalFileName;
        const ver = nextRevisionLabel(project.revisions);
        project.revisions.push({
          id: `rev-${Date.now()}`,
          productId: project.id,
          version: ver,
          source: 'tripo',
          fileName: finalFileName,
          diskRelativePath: destRel,
          sha256: hash,
          sizeBytes: payloadBuf.length,
          status: 'local',
          notes: `دریافت خودکار از ${sourceLabel}`,
          createdAt: new Date().toISOString(),
          isActiveOnline: false,
        });
      }
      project.updatedAt = new Date().toISOString();
      writeProductManifest(project);
    }

    appendLog(
      sourceLabel,
      'browser',
      `دانلود ${finalFileName} با قفل پروژه ${transfer.lockedProductCode} در ${destRel} ذخیره شد.`,
      transfer.lockedProductCode
    );
    saveStudioState(state);
    res.json({ ok: true, transfer, state });
  });

  // Site scripts CRUD
  app.post('/api/scripts', (req, res) => {
    const { name, domainPattern, code, runAt } = req.body as {
      name: string;
      domainPattern: string;
      code: string;
      runAt?: 'document-idle' | 'document-start';
    };
    const newScript = {
      id: `script-${Date.now()}`,
      name,
      domainPattern,
      enabled: true,
      runAt: runAt ?? 'document-idle',
      code,
      lastRunAt: null,
      lastError: null,
    };
    state.siteScripts.push(newScript);
    appendLog('Script Engine', 'browser', `اسکریپت جدید برای دامنه ${domainPattern} ثبت شد.`);
    saveStudioState(state);
    res.json({ script: newScript, state });
  });

  app.put('/api/scripts/:id', (req, res) => {
    const script = state.siteScripts.find((s) => s.id === req.params.id);
    if (!script) {
      res.status(404).json({ error: 'اسکریپت یافت نشد' });
      return;
    }
    const { enabled, code, name, domainPattern, testRun } = req.body as {
      enabled?: boolean;
      code?: string;
      name?: string;
      domainPattern?: string;
      testRun?: boolean;
    };
    if (enabled !== undefined) script.enabled = enabled;
    if (code !== undefined) script.code = code;
    if (name !== undefined) script.name = name;
    if (domainPattern !== undefined) script.domainPattern = domainPattern;
    if (testRun) {
      script.lastRunAt = new Date().toISOString();
      script.lastError = null;
      appendLog('Script Engine', 'browser', `اجرای آزمایشی اسکریپت "${script.name}" روی ${script.domainPattern} ثبت شد.`);
    }
    saveStudioState(state);
    res.json({ script, state });
  });

  // Blender Bridge Launch: writes chido_active_project.json into Blender/ folder and attempts Blender execution if present
  app.post('/api/blender/launch', (req, res) => {
    const { productId, sourceFileRelPath } = req.body as {
      productId: string;
      sourceFileRelPath?: string;
    };
    const product = state.products.find((p) => p.id === productId);
    if (!product) {
      res.status(404).json({ error: 'محصول فعال یافت نشد' });
      return;
    }
    const company = state.companies.find((c) => c.id === product.companyId);
    const blenderDirAbs = getSafeDiskPath(`${product.localFolderRelativePath}/Blender`)!;
    const exportsDirAbs = getSafeDiskPath(`${product.localFolderRelativePath}/Exports`)!;
    fs.mkdirSync(blenderDirAbs, { recursive: true });
    fs.mkdirSync(exportsDirAbs, { recursive: true });

    const defaultSourceRel =
      sourceFileRelPath ||
      product.files.find((f) => f.subfolder === 'Tripo')?.diskRelativePath ||
      product.files.find((f) => f.subfolder === 'Exports')?.diskRelativePath ||
      '';
    const sourceGlbAbs = defaultSourceRel ? getSafeDiskPath(defaultSourceRel) || '' : '';
    const nextRev = nextRevisionLabel(product.revisions);

    const manifestPayload = {
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      companyCode: company?.code ?? 'CHIDO',
      companyName: company?.name ?? '',
      sourceGlbPath: sourceGlbAbs,
      blenderFolder: blenderDirAbs,
      exportsFolder: exportsDirAbs,
      nextRevision: nextRev,
      studioApiUrl: `http://localhost:${PORT}`,
      launchedAt: new Date().toISOString(),
    };

    const manifestAbs = path.join(blenderDirAbs, 'chido_active_project.json');
    fs.writeFileSync(manifestAbs, JSON.stringify(manifestPayload, null, 2), 'utf8');

    const addonAbs = path.resolve(process.cwd(), 'blender-addon', 'chido_blender_bridge.py');
    const blenderExe = state.settings.blenderExecutablePath;
    const launchCommand = `"${blenderExe}" --python "${addonAbs}"`;

    let spawnedHostBlender = false;
    if (fs.existsSync(blenderExe)) {
      try {
        const child = execFile(
          blenderExe,
          ['--python', addonAbs],
          { env: { ...process.env, CHIDO_MANIFEST_PATH: manifestAbs } }
        );
        child.unref();
        spawnedHostBlender = true;
      } catch {
        spawnedHostBlender = false;
      }
    }

    product.modelingStatus = 'blender_refine';
    product.updatedAt = new Date().toISOString();
    writeProductManifest(product);
    appendLog(
      'Blender Bridge',
      'blender',
      `فایل ${path.basename(sourceGlbAbs || product.code)} آماده اجرا در Blender شد (مانیفست: chido_active_project.json).`,
      product.code
    );
    saveStudioState(state);

    res.json({
      ok: true,
      manifestPath: manifestAbs,
      launchCommand,
      spawnedHostBlender,
      manifestPayload,
      state,
    });
  });

  // Blender Export Revision callback (from chido_blender_bridge.py or Studio button)
  app.post('/api/blender/export-revision', (req, res) => {
    const { productId, fileName, notes } = req.body as {
      productId: string;
      fileName?: string;
      notes?: string;
    };
    const product = state.products.find((p) => p.id === productId);
    if (!product) {
      res.status(404).json({ error: 'محصول یافت نشد' });
      return;
    }

    const version = nextRevisionLabel(product.revisions);
    const outName = sanitizePathSegment(fileName || `${product.code}_${version}_blender.glb`);
    const relPath = `${product.localFolderRelativePath}/Exports/${outName}`;
    const outAbs = getSafeDiskPath(relPath)!;
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });

    if (!fs.existsSync(outAbs)) {
      const preset = product.id.includes('tol')
        ? 'table'
        : product.id.includes('dgt')
          ? 'lamp'
          : product.id.includes('0043')
            ? 'armchair'
            : 'sofa';
      fs.writeFileSync(outAbs, buildFurnitureGlb(preset));
    }
    const buf = fs.readFileSync(outAbs);
    const hash = sha256Buffer(buf);

    const rev: ProductRevision = {
      id: `rev-${Date.now()}`,
      productId: product.id,
      version,
      source: 'blender',
      fileName: outName,
      diskRelativePath: relPath,
      sha256: hash,
      sizeBytes: buf.length,
      status: 'ready_to_upload',
      notes: notes || `خروجی جدید Blender (${version})`,
      createdAt: new Date().toISOString(),
      isActiveOnline: false,
    };

    product.revisions.push(rev);
    product.lastGlbFile = outName;
    product.files.push({
      id: `file-${Date.now()}`,
      productId: product.id,
      subfolder: 'Exports',
      fileName: outName,
      diskRelativePath: relPath,
      mimeType: 'model/gltf-binary',
      sizeBytes: buf.length,
      sha256: hash,
      createdAt: new Date().toISOString(),
    });
    product.updatedAt = new Date().toISOString();
    writeProductManifest(product);
    appendLog('Blender Bridge', 'blender', `ریویژن ${version} (${outName}) در Exports ذخیره شد.`, product.code);
    saveStudioState(state);
    res.json({ ok: true, revision: rev, state });
  });

  // Revision Cloud lifecycle: upload -> approve -> publish
  app.post('/api/revisions/:id/action', (req, res) => {
    const { action } = req.body as { action: 'upload' | 'approve' | 'publish' | 'archive' };
    let targetRev: ProductRevision | undefined;
    let targetProd: Product | undefined;

    for (const p of state.products) {
      const found = p.revisions.find((r) => r.id === req.params.id);
      if (found) {
        targetRev = found;
        targetProd = p;
        break;
      }
    }

    if (!targetRev || !targetProd) {
      res.status(404).json({ error: 'ریویژن یافت نشد' });
      return;
    }

    if (action === 'upload') {
      targetRev.status = 'pending_approval';
      targetProd.modelingStatus = 'pending_approval';
      const transfer = createLockedTransfer({
        id: `tr-${Date.now()}`,
        direction: 'upload',
        sourceLabel: 'CHIDO Cloud',
        fileName: targetRev.fileName,
        activeProjectIdAtStart: targetProd.id,
        subfolder: 'Exports',
        sizeBytes: targetRev.sizeBytes,
        products: state.products,
        companies: state.companies,
      });
      transfer.status = 'pending_approval';
      transfer.progress = 100;
      transfer.sha256 = targetRev.sha256;
      state.transfers.unshift(transfer);
      appendLog('Cloud Sync', 'cloud', `ریویژن ${targetRev.version} به مخزن آنلاین ارسال و در صف تأیید قرار گرفت.`, targetProd.code);
    } else if (action === 'approve' || action === 'publish') {
      for (const r of targetProd.revisions) {
        if (r.isActiveOnline && r.id !== targetRev.id) {
          r.isActiveOnline = false;
        }
      }
      targetRev.status = 'published';
      targetRev.isActiveOnline = true;
      targetProd.activeOnlineRevision = targetRev.version;
      targetProd.modelingStatus = 'published';
      appendLog('Cloud Publish', 'cloud', `ریویژن ${targetRev.version} به‌عنوان نسخه فعال آنلاین ${targetProd.code} منتشر شد.`, targetProd.code);
    } else if (action === 'archive') {
      targetRev.status = 'archived';
      targetRev.isActiveOnline = false;
      appendLog('Cloud Archive', 'cloud', `ریویژن ${targetRev.version} آرشیو شد.`, targetProd.code);
    }

    writeProductManifest(targetProd);
    saveStudioState(state);
    res.json({ ok: true, state });
  });

  // Companies CRUD
  app.post('/api/companies', (req, res) => {
    const { name, code, englishFolder, contactName, contactPhone, contactEmail, adminEmail, subscriptionPlan, notes } =
      req.body as Partial<Company>;
    if (!name || !code) {
      res.status(400).json({ error: 'نام و کد شرکت الزامی است' });
      return;
    }
    const cleanCode = sanitizePathSegment(code).toUpperCase();
    const folder = sanitizePathSegment(englishFolder || `${cleanCode}-${name}`);
    const newComp: Company = {
      id: `comp-${Date.now()}`,
      code: cleanCode,
      name: name.trim(),
      englishFolder: folder,
      contactName: contactName || '',
      contactPhone: contactPhone || '',
      contactEmail: contactEmail || '',
      adminEmail: adminEmail || contactEmail || '',
      subscriptionPlan: subscriptionPlan || 'Studio Pro',
      subscriptionActive: true,
      notes: notes || '',
      createdAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.join(ASSETS_ROOT, folder), { recursive: true });
    state.companies.push(newComp);
    appendLog('Companies', 'project', `شرکت ${newComp.name} (${newComp.code}) و کتابخانه اختصاصی ایجاد شد.`);
    saveStudioState(state);
    res.json({ company: newComp, state });
  });

  // Products CRUD & tag edits
  app.post('/api/products', (req, res) => {
    const { companyId, code, name, categoryFolder, setFolder, tags } = req.body as {
      companyId: string;
      code: string;
      name: string;
      categoryFolder: string;
      setFolder: string;
      tags?: string[];
    };
    const company = state.companies.find((c) => c.id === companyId);
    if (!company || !code || !name) {
      res.status(400).json({ error: 'اطلاعات شرکت، کد و نام محصول الزامی است' });
      return;
    }

    const relPath = resolveProductDiskPath(company, {
      code: code.trim().toUpperCase(),
      categoryFolder: categoryFolder || 'General',
      setFolder: setFolder || 'Default Set',
    });
    ensureProductFolders(relPath);

    const newProd: Product = {
      id: `prod-${Date.now()}`,
      code: code.trim().toUpperCase(),
      companyId: company.id,
      categoryFolder: categoryFolder || 'General',
      setFolder: setFolder || 'Default Set',
      name: name.trim(),
      coverImageUrl: '/src/assets/images/sofa_aria_three_seater_1794993401647.jpg',
      tags: tags && tags.length > 0 ? tags : [categoryFolder || 'عمومی'],
      modelingStatus: 'queued',
      localFolderRelativePath: relPath,
      lastTripoFile: null,
      lastBlenderFile: null,
      lastGlbFile: null,
      activeOnlineRevision: null,
      revisions: [],
      files: [],
      updatedAt: new Date().toISOString(),
    };
    writeProductManifest(newProd);
    state.products.unshift(newProd);
    state.activeCompanyId = company.id;
    state.activeProjectId = newProd.id;
    appendLog('Catalog', 'project', `محصول جدید ${newProd.code} (${newProd.name}) ایجاد و فعال شد.`, newProd.code);
    saveStudioState(state);
    res.json({ product: newProd, state });
  });

  app.patch('/api/products/:id/tags', (req, res) => {
    const prod = state.products.find((p) => p.id === req.params.id);
    if (!prod) {
      res.status(404).json({ error: 'محصول یافت نشد' });
      return;
    }
    const { tags, code, name } = req.body as { tags?: string[]; code?: string; name?: string };
    if (Array.isArray(tags)) prod.tags = tags;
    if (code) prod.code = code.trim();
    if (name) prod.name = name.trim();
    prod.updatedAt = new Date().toISOString();
    writeProductManifest(prod);
    appendLog('Catalog', 'asset', `متادیتا/تگ‌های ${prod.code} بدون تغییر در فایل‌های GLB به‌روزرسانی شد.`, prod.code);
    saveStudioState(state);
    res.json({ product: prod, state });
  });

  // Sets CRUD
  app.post('/api/sets', (req, res) => {
    const { companyId, name, category, productIds } = req.body as {
      companyId: string;
      name: string;
      category: string;
      productIds: string[];
    };
    if (!companyId || !name) {
      res.status(400).json({ error: 'نام ست و شرکت الزامی است' });
      return;
    }
    const newSet = {
      id: `set-${Date.now()}`,
      companyId,
      name: name.trim(),
      category: category || 'پذیرایی',
      productIds: productIds || [],
    };
    state.sets.push(newSet);
    appendLog('Libraries', 'project', `ست "${newSet.name}" با ${newSet.productIds.length} محصول ثبت شد.`);
    saveStudioState(state);
    res.json({ set: newSet, state });
  });

  // Requests & Client Image Approval / Download to References/
  app.post('/api/requests', (req, res) => {
    const { companyId, productId, title, category, priority, feeToman } = req.body as Partial<ModelingRequest>;
    if (!companyId || !title) {
      res.status(400).json({ error: 'شرکت و عنوان درخواست الزامی است' });
      return;
    }
    const newReq: ModelingRequest = {
      id: `req-${Date.now()}`,
      requestCode: `REQ-2026-${Math.floor(200 + Math.random() * 799)}`,
      companyId,
      productId: productId || null,
      title: title.trim(),
      category: category || 'پذیرایی',
      priority: priority || 'normal',
      status: 'new',
      feeToman: Number(feeToman || 3_500_000),
      clientImages: [
        {
          id: `rimg-${Date.now()}`,
          fileName: 'client_uploaded_angle.jpg',
          previewUrl: '/src/assets/images/armchair_aria_lounge_1794993412009.jpg',
          status: 'pending',
          downloadedToProject: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    state.requests.unshift(newReq);
    appendLog('Requests', 'project', `درخواست جدید ${newReq.requestCode} ثبت شد.`);
    saveStudioState(state);
    res.json({ request: newReq, state });
  });

  app.patch('/api/requests/:id/status', (req, res) => {
    const r = state.requests.find((item) => item.id === req.params.id);
    if (!r) {
      res.status(404).json({ error: 'درخواست یافت نشد' });
      return;
    }
    r.status = req.body.status;
    appendLog('Modeling Queue', 'project', `وضعیت درخواست ${r.requestCode} به ${r.status} تغییر یافت.`);
    saveStudioState(state);
    res.json({ request: r, state });
  });

  app.post('/api/requests/:id/images/:imgId/decision', (req, res) => {
    const r = state.requests.find((item) => item.id === req.params.id);
    const img = r?.clientImages.find((i) => i.id === req.params.imgId);
    if (!r || !img) {
      res.status(404).json({ error: 'تصویر یا درخواست یافت نشد' });
      return;
    }
    const { decision, downloadToProject } = req.body as {
      decision?: 'approved' | 'rejected';
      downloadToProject?: boolean;
    };
    if (decision) img.status = decision;
    if (downloadToProject) {
      img.downloadedToProject = true;
      const targetProd =
        state.products.find((p) => p.id === r.productId) ||
        state.products.find((p) => p.id === state.activeProjectId);

      const destRel = targetProd
        ? `${targetProd.localFolderRelativePath}/References/${img.fileName}`
        : `_Inbox/${img.fileName}`;
      const destAbs = getSafeDiskPath(destRel)!;
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      const srcAbs = path.resolve(process.cwd(), img.previewUrl.replace(/^\//, ''));
      const buf = fs.existsSync(srcAbs) ? fs.readFileSync(srcAbs) : createSampleTransparentPng(256, 256);
      fs.writeFileSync(destAbs, buf);

      if (targetProd) {
        targetProd.files.push({
          id: `file-${Date.now()}`,
          productId: targetProd.id,
          subfolder: 'References',
          fileName: img.fileName,
          diskRelativePath: destRel,
          mimeType: 'image/jpeg',
          sizeBytes: buf.length,
          sha256: sha256Buffer(buf),
          createdAt: new Date().toISOString(),
        });
        writeProductManifest(targetProd);
      }
      appendLog('Requests', 'asset', `تصویر مشتری ${img.fileName} در References پروژه ذخیره شد.`, targetProd?.code);
    }
    saveStudioState(state);
    res.json({ ok: true, state });
  });

  // Batch Pipeline Execution (3D generation -> Blender prep -> Cloud upload -> Publish)
  app.post('/api/pipeline/batch', (req, res) => {
    const { productIds, action } = req.body as {
      productIds: string[];
      action: BatchPipelineAction;
    };
    if (!Array.isArray(productIds) || productIds.length === 0) {
      res.status(400).json({ error: 'حداقل یک مدل را انتخاب کنید' });
      return;
    }

    const updatedCodes: string[] = [];
    const now = new Date().toISOString();

    for (const pid of productIds) {
      const product = state.products.find((p) => p.id === pid);
      if (!product) continue;

      const mapped = mapBatchActionToStatus(product.modelingStatus, action);
      product.modelingStatus = mapped.modelingStatus;
      product.updatedAt = now;

      const preset = product.id.includes('tol')
        ? 'table'
        : product.id.includes('dgt')
          ? 'lamp'
          : product.id.includes('0043')
            ? 'armchair'
            : 'sofa';

      if (mapped.modelingStatus === 'tripo_draft') {
        const ver = nextRevisionLabel(product.revisions);
        const tripoName = `${product.code}_${ver}_tripo.glb`;
        const tripoRel = `${product.localFolderRelativePath}/Tripo/${tripoName}`;
        const tripoAbs = getSafeDiskPath(tripoRel)!;
        fs.mkdirSync(path.dirname(tripoAbs), { recursive: true });
        const buf = buildFurnitureGlb(preset);
        fs.writeFileSync(tripoAbs, buf);
        const hash = sha256Buffer(buf);

        product.lastTripoFile = tripoName;
        product.lastGlbFile = tripoName;
        product.files.push({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: product.id,
          subfolder: 'Tripo',
          fileName: tripoName,
          diskRelativePath: tripoRel,
          mimeType: 'model/gltf-binary',
          sizeBytes: buf.length,
          sha256: hash,
          originUrl: 'https://www.tripo3d.ai',
          createdAt: now,
        });
        product.revisions.push({
          id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: product.id,
          version: ver,
          source: 'tripo',
          fileName: tripoName,
          diskRelativePath: tripoRel,
          sha256: hash,
          sizeBytes: buf.length,
          status: 'local',
          notes: 'ساخت خودکار سه‌بعدی در عملیات دسته‌ای',
          createdAt: now,
          isActiveOnline: false,
        });
      } else if (mapped.modelingStatus === 'blender_refine') {
        const ver = nextRevisionLabel(product.revisions);
        const expName = `${product.code}_${ver}_blender.glb`;
        const expRel = `${product.localFolderRelativePath}/Exports/${expName}`;
        const expAbs = getSafeDiskPath(expRel)!;
        fs.mkdirSync(path.dirname(expAbs), { recursive: true });
        const buf = buildFurnitureGlb(preset);
        fs.writeFileSync(expAbs, buf);
        const hash = sha256Buffer(buf);

        product.lastGlbFile = expName;
        product.files.push({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: product.id,
          subfolder: 'Exports',
          fileName: expName,
          diskRelativePath: expRel,
          mimeType: 'model/gltf-binary',
          sizeBytes: buf.length,
          sha256: hash,
          createdAt: now,
        });
        product.revisions.push({
          id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: product.id,
          version: ver,
          source: 'blender',
          fileName: expName,
          diskRelativePath: expRel,
          sha256: hash,
          sizeBytes: buf.length,
          status: 'ready_to_upload',
          notes: 'آماده‌سازی دسته‌ای Blender (اصلاح مقیاس و متریال)',
          createdAt: now,
          isActiveOnline: false,
        });
      } else if (mapped.modelingStatus === 'pending_approval') {
        const latestRev = product.revisions[product.revisions.length - 1];
        if (latestRev) {
          latestRev.status = 'pending_approval';
          const transfer = createLockedTransfer({
            id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            direction: 'upload',
            sourceLabel: 'CHIDO Cloud (Batch)',
            fileName: latestRev.fileName,
            activeProjectIdAtStart: product.id,
            subfolder: 'Exports',
            sizeBytes: latestRev.sizeBytes,
            products: state.products,
            companies: state.companies,
          });
          transfer.status = 'pending_approval';
          transfer.progress = 100;
          transfer.sha256 = latestRev.sha256;
          state.transfers.unshift(transfer);
        }
      } else if (mapped.modelingStatus === 'published') {
        const latestRev = product.revisions[product.revisions.length - 1];
        if (latestRev) {
          for (const r of product.revisions) {
            r.isActiveOnline = r.id === latestRev.id;
          }
          latestRev.status = 'published';
          product.activeOnlineRevision = latestRev.version;
        }
      }

      writeProductManifest(product);
      const linkedReq = state.requests.find((r) => r.productId === product.id);
      if (linkedReq) {
        linkedReq.status = mapped.requestStatus;
      }
      updatedCodes.push(product.code);
    }

    appendLog(
      'Batch Pipeline',
      'cloud',
      `عملیات دسته‌ای (${action}) روی ${updatedCodes.length} مدل اجرا شد: ${updatedCodes.join('، ')}`
    );
    saveStudioState(state);
    res.json({ ok: true, updatedCodes, state });
  });

  // Review communication status, client review message, and internal studio note
  app.patch('/api/pipeline/review', (req, res) => {
    const { productId, requestId, reviewMessageStatus, reviewMessage, studioNote } = req.body as {
      productId?: string | null;
      requestId?: string | null;
      reviewMessageStatus?: ReviewMessageStatus;
      reviewMessage?: string;
      studioNote?: string;
    };

    const targetProduct = productId ? state.products.find((p) => p.id === productId) : undefined;
    const targetRequest = requestId
      ? state.requests.find((r) => r.id === requestId)
      : productId
        ? state.requests.find((r) => r.productId === productId)
        : undefined;

    if (!targetProduct && !targetRequest) {
      res.status(404).json({ error: 'آیتم مورد نظر یافت نشد' });
      return;
    }

    if (targetProduct) {
      if (reviewMessageStatus !== undefined) targetProduct.reviewMessageStatus = reviewMessageStatus;
      if (reviewMessage !== undefined) targetProduct.reviewMessage = reviewMessage;
      if (studioNote !== undefined) targetProduct.studioNote = studioNote;
      targetProduct.updatedAt = new Date().toISOString();
      writeProductManifest(targetProduct);
    }

    if (targetRequest) {
      if (reviewMessageStatus !== undefined) targetRequest.reviewMessageStatus = reviewMessageStatus;
      if (reviewMessage !== undefined) targetRequest.reviewMessage = reviewMessage;
      if (studioNote !== undefined) targetRequest.studioNote = studioNote;
    }

    appendLog(
      'Review & Notes',
      'project',
      `پیام ریویو و یادداشت ${targetProduct?.code || targetRequest?.requestCode || ''} به‌روزرسانی شد.`,
      targetProduct?.code
    );
    saveStudioState(state);
    res.json({ ok: true, state });
  });

  // Accounting: Invoices & Payments
  app.post('/api/accounting/invoices', (req, res) => {
    const { companyId, requestId, title, amountToman, kind } = req.body as Partial<Invoice>;
    if (!companyId || !title || !amountToman) {
      res.status(400).json({ error: 'شرکت، عنوان و مبلغ فاکتور الزامی است' });
      return;
    }
    const inv: Invoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: `INV-1405-${Math.floor(100 + Math.random() * 899)}`,
      companyId,
      requestId: requestId || null,
      title: title.trim(),
      amountToman: Number(amountToman),
      paidToman: 0,
      kind: kind || 'proforma',
      status: 'unpaid',
      issuedAt: new Date().toISOString(),
    };
    state.invoices.unshift(inv);
    appendLog('Accounting', 'accounting', `فاکتور ${inv.invoiceNumber} به مبلغ ${inv.amountToman.toLocaleString()} تومان صادر شد.`);
    saveStudioState(state);
    res.json({ invoice: inv, state });
  });

  app.post('/api/accounting/payments', (req, res) => {
    const { invoiceId, amountToman } = req.body as { invoiceId: string; amountToman: number };
    const inv = state.invoices.find((i) => i.id === invoiceId);
    if (!inv || !amountToman || amountToman <= 0) {
      res.status(400).json({ error: 'فاکتور یا مبلغ پرداخت نامعتبر است' });
      return;
    }
    inv.paidToman = Math.min(inv.amountToman, inv.paidToman + Number(amountToman));
    inv.status = inv.paidToman >= inv.amountToman ? 'paid' : 'partial';
    appendLog('Accounting', 'accounting', `پرداخت برای ${inv.invoiceNumber} ثبت شد (وضعیت: ${inv.status}).`);
    saveStudioState(state);
    res.json({ invoice: inv, state });
  });

  // Settings
  app.patch('/api/settings', (req, res) => {
    state.settings = { ...state.settings, ...req.body };
    appendLog('Settings', 'project', 'تنظیمات محیط کار و تبدیل تصویر به‌روزرسانی شد.');
    saveStudioState(state);
    res.json({ settings: state.settings, state });
  });

  // Vite dev middleware or production dist
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CHIDO Studio server listening on http://localhost:${PORT}`);
  });
}

startServer();
