import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  Company,
  Product,
  ProductAssetFile,
  ProductRevision,
  StudioState,
} from '../src/core/types';
import { buildFurnitureGlb } from './lib/glbGenerator';
import { convertPngBufferToJpg, createSampleTransparentPng } from './lib/imageConverter';

export const ASSETS_ROOT = path.resolve(process.cwd(), 'chido-assets');
export const DB_PATH = path.join(ASSETS_ROOT, 'studio-db.json');

export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function ensureProductFolders(productRelPath: string) {
  const fullBase = path.join(ASSETS_ROOT, productRelPath);
  const subs = ['References', 'AI Images', 'Tripo', 'Blender', 'Exports'] as const;
  for (const sub of subs) {
    fs.mkdirSync(path.join(fullBase, sub), { recursive: true });
  }
  return fullBase;
}

export function writeProductManifest(product: Product) {
  const fullBase = ensureProductFolders(product.localFolderRelativePath);
  const manifestPath = path.join(fullBase, 'asset.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        internalId: product.id,
        code: product.code,
        companyId: product.companyId,
        name: product.name,
        categoryFolder: product.categoryFolder,
        setFolder: product.setFolder,
        tags: product.tags,
        modelingStatus: product.modelingStatus,
        activeOnlineRevision: product.activeOnlineRevision,
        revisions: product.revisions,
        files: product.files,
        updatedAt: product.updatedAt,
      },
      null,
      2
    ),
    'utf8'
  );
}

function copyGeneratedAssetIfExists(srcRel: string, destAbs: string): number {
  const srcAbs = path.resolve(process.cwd(), srcRel.replace(/^\//, ''));
  if (fs.existsSync(srcAbs)) {
    fs.copyFileSync(srcAbs, destAbs);
    return fs.statSync(destAbs).size;
  }
  const fallback = createSampleTransparentPng(256, 256);
  fs.writeFileSync(destAbs, fallback);
  return fallback.length;
}

export function loadOrSeedStudioState(): StudioState {
  fs.mkdirSync(ASSETS_ROOT, { recursive: true });
  fs.mkdirSync(path.join(ASSETS_ROOT, '_Inbox'), { recursive: true });
  fs.mkdirSync(path.join(ASSETS_ROOT, '_Staging'), { recursive: true });
  fs.mkdirSync(path.join(ASSETS_ROOT, '_Archive'), { recursive: true });
  fs.mkdirSync(path.join(ASSETS_ROOT, 'GENERAL'), { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw) as StudioState;
      if (parsed && Array.isArray(parsed.companies) && Array.isArray(parsed.products)) {
        reconcileTrackedAssetsOnDisk(parsed);
        return parsed;
      }
    } catch {
      // Fall through to re-seed cleanly if corrupted
    }
  }

  const now = new Date().toISOString();

  const companies: Company[] = [
    {
      id: 'comp-dan',
      code: 'DAN',
      name: 'مبلمان دانشور',
      englishFolder: 'DAN-Danshvar',
      contactName: 'مهندس رضا دانشور',
      contactPhone: '021-88451290',
      contactEmail: 'studio@danshvar.ir',
      adminEmail: 'reza@danshvar.ir',
      subscriptionPlan: 'Enterprise',
      subscriptionActive: true,
      notes: 'کتابخانه اختصاصی کالکشن آریا و پذیرایی مدرن',
      createdAt: '2026-09-12T08:00:00Z',
    },
    {
      id: 'comp-tol',
      code: 'TOL',
      name: 'تولیکا',
      englishFolder: 'TOL-Tolica',
      contactName: 'سارا رادمنش',
      contactPhone: '021-22670914',
      contactEmail: 'catalog@tolica.ir',
      adminEmail: 'sara@tolica.ir',
      subscriptionPlan: 'Studio Pro',
      subscriptionActive: true,
      notes: 'میزهای ناهارخوری چوب گردو و سرویس خواب',
      createdAt: '2026-10-01T10:30:00Z',
    },
    {
      id: 'comp-dgt',
      code: 'DGT',
      name: 'نورپردازی دقت',
      englishFolder: 'DGT-Deghat',
      contactName: 'امیرحسین مرادی',
      contactPhone: '021-66904411',
      contactEmail: '3d@deghatlight.ir',
      adminEmail: 'amir@deghatlight.ir',
      subscriptionPlan: 'Studio Pro',
      subscriptionActive: true,
      notes: 'چراغ‌های ایستاده برنجی و مرمر',
      createdAt: '2026-10-18T12:15:00Z',
    },
    {
      id: 'comp-general',
      code: 'GENERAL',
      name: 'کتابخانه عمومی چیدو',
      englishFolder: 'GENERAL',
      contactName: 'تیم محتوای چیدو',
      contactPhone: '021-91003400',
      contactEmail: 'library@chido.ir',
      adminEmail: 'core@chido.ir',
      subscriptionPlan: 'Internal',
      subscriptionActive: true,
      notes: 'اقلام دکوراتیو عمومی قابل استفاده در همه نمایشگاه‌ها',
      createdAt: '2026-08-01T00:00:00Z',
    },
  ];

  const productConfigs: Array<{
    id: string;
    code: string;
    companyId: string;
    categoryFolder: string;
    setFolder: string;
    name: string;
    coverImageUrl: string;
    tags: string[];
    modelingStatus: Product['modelingStatus'];
    preset: 'sofa' | 'armchair' | 'table' | 'lamp';
    activeOnlineRevision: string | null;
  }> = [
    {
      id: 'prod-dan-0042',
      code: 'DAN-0042',
      companyId: 'comp-dan',
      categoryFolder: 'Living Room',
      setFolder: 'Aria Set',
      name: 'مبل سه‌نفره آریا',
      coverImageUrl: '/src/assets/images/sofa_aria_three_seater_1794993401647.jpg',
      tags: ['پذیرایی', 'راحتی', 'مدرن', 'سه‌نفره', 'کالکشن آریا'],
      modelingStatus: 'blender_refine',
      preset: 'sofa',
      activeOnlineRevision: 'R02',
    },
    {
      id: 'prod-dan-0043',
      code: 'DAN-0043',
      companyId: 'comp-dan',
      categoryFolder: 'Living Room',
      setFolder: 'Aria Set',
      name: 'مبل تک‌نفره آریا',
      coverImageUrl: '/src/assets/images/armchair_aria_lounge_1794993412009.jpg',
      tags: ['پذیرایی', 'تک‌نفره', 'چوب گردو', 'کالکشن آریا'],
      modelingStatus: 'pending_approval',
      preset: 'armchair',
      activeOnlineRevision: 'R01',
    },
    {
      id: 'prod-tol-0108',
      code: 'TOL-0108',
      companyId: 'comp-tol',
      categoryFolder: 'Dining',
      setFolder: 'Fluted Series',
      name: 'میز ناهارخوری گردو شیاردار',
      coverImageUrl: '/src/assets/images/dining_table_tolica_walnut_1794993402446.jpg',
      tags: ['ناهارخوری', 'چوب گردو', 'هشت‌نفره'],
      modelingStatus: 'tripo_draft',
      preset: 'table',
      activeOnlineRevision: null,
    },
    {
      id: 'prod-dgt-0019',
      code: 'DGT-0019',
      companyId: 'comp-dgt',
      categoryFolder: 'Lighting',
      setFolder: 'Brass Line',
      name: 'آباژور ایستاده برنج و مرمر',
      coverImageUrl: '/src/assets/images/floor_lamp_deghat_brass_1794993403222.jpg',
      tags: ['نورپردازی', 'برنج', 'مدرن'],
      modelingStatus: 'published',
      preset: 'lamp',
      activeOnlineRevision: 'R02',
    },
  ];

  const products: Product[] = productConfigs.map((cfg) => {
    const company = companies.find((c) => c.id === cfg.companyId)!;
    const relBase = `${company.englishFolder}/${cfg.categoryFolder}/${cfg.setFolder}/${cfg.code}`;
    const absBase = ensureProductFolders(relBase);

    const files: ProductAssetFile[] = [];
    const revisions: ProductRevision[] = [];

    // 1. Copy studio cover image into References/ and AI Images/
    const refFileName = `${cfg.code}_reference.jpg`;
    const refAbs = path.join(absBase, 'References', refFileName);
    copyGeneratedAssetIfExists(cfg.coverImageUrl, refAbs);
    const refBuf = fs.readFileSync(refAbs);
    files.push({
      id: `file-${cfg.id}-ref1`,
      productId: cfg.id,
      subfolder: 'References',
      fileName: refFileName,
      diskRelativePath: `${relBase}/References/${refFileName}`,
      mimeType: 'image/jpeg',
      sizeBytes: refBuf.length,
      sha256: sha256Buffer(refBuf),
      createdAt: now,
    });

    // 2. Also create a real transparent PNG sample in AI Images/ so PNG->JPG conversion can be tested immediately
    const aiPngName = `${cfg.code}_chatgpt_cutout.png`;
    const aiPngAbs = path.join(absBase, 'AI Images', aiPngName);
    const pngBuf = createSampleTransparentPng(192, 192);
    fs.writeFileSync(aiPngAbs, pngBuf);
    files.push({
      id: `file-${cfg.id}-ai1`,
      productId: cfg.id,
      subfolder: 'AI Images',
      fileName: aiPngName,
      diskRelativePath: `${relBase}/AI Images/${aiPngName}`,
      mimeType: 'image/png',
      sizeBytes: pngBuf.length,
      sha256: sha256Buffer(pngBuf),
      originUrl: 'https://chatgpt.com',
      createdAt: now,
    });

    // 3. Write real Tripo GLB into Tripo/
    const tripoGlbName = `${cfg.code}_tripo_raw.glb`;
    const tripoGlbAbs = path.join(absBase, 'Tripo', tripoGlbName);
    const glbBuf = buildFurnitureGlb(cfg.preset);
    fs.writeFileSync(tripoGlbAbs, glbBuf);
    const tripoHash = sha256Buffer(glbBuf);
    files.push({
      id: `file-${cfg.id}-tripo1`,
      productId: cfg.id,
      subfolder: 'Tripo',
      fileName: tripoGlbName,
      diskRelativePath: `${relBase}/Tripo/${tripoGlbName}`,
      mimeType: 'model/gltf-binary',
      sizeBytes: glbBuf.length,
      sha256: tripoHash,
      originUrl: 'https://www.tripo3d.ai',
      createdAt: now,
    });

    revisions.push({
      id: `rev-${cfg.id}-r01`,
      productId: cfg.id,
      version: 'R01',
      source: 'tripo',
      fileName: tripoGlbName,
      diskRelativePath: `${relBase}/Tripo/${tripoGlbName}`,
      sha256: tripoHash,
      sizeBytes: glbBuf.length,
      status: cfg.activeOnlineRevision === 'R01' ? 'published' : 'local',
      notes: 'خروجی اولیه دریافت‌شده از Tripo',
      createdAt: '2026-11-15T11:20:00Z',
      isActiveOnline: cfg.activeOnlineRevision === 'R01',
    });

    // 4. Write refined Blender Export GLB into Exports/
    const exportGlbName = `${cfg.code}_R02_final.glb`;
    const exportGlbAbs = path.join(absBase, 'Exports', exportGlbName);
    fs.writeFileSync(exportGlbAbs, glbBuf);
    files.push({
      id: `file-${cfg.id}-exp2`,
      productId: cfg.id,
      subfolder: 'Exports',
      fileName: exportGlbName,
      diskRelativePath: `${relBase}/Exports/${exportGlbName}`,
      mimeType: 'model/gltf-binary',
      sizeBytes: glbBuf.length,
      sha256: tripoHash,
      createdAt: now,
    });

    // 5. Write Blender scene descriptor in Blender/
    const blendName = `${cfg.code}_scene.blend.json`;
    const blendAbs = path.join(absBase, 'Blender', blendName);
    const blendMeta = Buffer.from(
      JSON.stringify({ productCode: cfg.code, meshPreset: cfg.preset, scaleMeters: 1.0, uvReady: true }, null, 2)
    );
    fs.writeFileSync(blendAbs, blendMeta);
    files.push({
      id: `file-${cfg.id}-blend1`,
      productId: cfg.id,
      subfolder: 'Blender',
      fileName: blendName,
      diskRelativePath: `${relBase}/Blender/${blendName}`,
      mimeType: 'application/json',
      sizeBytes: blendMeta.length,
      sha256: sha256Buffer(blendMeta),
      createdAt: now,
    });

    if (cfg.activeOnlineRevision === 'R02' || cfg.id === 'prod-dan-0042') {
      revisions.push({
        id: `rev-${cfg.id}-r02`,
        productId: cfg.id,
        version: 'R02',
        source: 'blender',
        fileName: exportGlbName,
        diskRelativePath: `${relBase}/Exports/${exportGlbName}`,
        sha256: tripoHash,
        sizeBytes: glbBuf.length,
        status: cfg.activeOnlineRevision === 'R02' ? 'published' : 'pending_approval',
        notes: 'اصلاح ابعاد، AO و متریال چوب در Blender',
        createdAt: '2026-11-17T16:40:00Z',
        isActiveOnline: cfg.activeOnlineRevision === 'R02',
      });
    }

    if (cfg.id === 'prod-dan-0042') {
      revisions.push({
        id: `rev-${cfg.id}-r03`,
        productId: cfg.id,
        version: 'R03',
        source: 'blender',
        fileName: exportGlbName,
        diskRelativePath: `${relBase}/Exports/${exportGlbName}`,
        sha256: tripoHash,
        sizeBytes: glbBuf.length,
        status: 'pending_approval',
        notes: 'کاهش حجم تکسچر پارچه بوکله و تنظیم سایه کف',
        createdAt: '2026-11-18T00:50:00Z',
        isActiveOnline: false,
      });
    }

    const reviewDefaults: Record<
      string,
      {
        reviewMessageStatus: Product['reviewMessageStatus'];
        reviewMessage: string;
        studioNote: string;
      }
    > = {
      'prod-dan-0042': {
        reviewMessageStatus: 'message_received',
        reviewMessage: 'کلاینت پیام داده: پایه‌های چوب گردو کمی تیره‌تر شود و بافت بوکله برجسته‌تر بماند.',
        studioNote: 'ریویژن R03 در حال اصلاح متریال کف و نورگیر داخل Blender است.',
      },
      'prod-dan-0043': {
        reviewMessageStatus: 'revision_needed',
        reviewMessage: 'نیاز به بررسی زاویه نشیمن و ضخامت دسته پیش از انتشار نهایی.',
        studioNote: 'پس از تأیید مهندس دانشور هم‌زمان با مبل سه‌نفره منتشر شود.',
      },
      'prod-tol-0108': {
        reviewMessageStatus: 'no_message',
        reviewMessage: '',
        studioNote: 'آماده ورود به Blender برای تنظیم ابعاد واقعی میز ۲۲۰ سانتی.',
      },
      'prod-dgt-0019': {
        reviewMessageStatus: 'message_received',
        reviewMessage: 'تأیید نهایی کلاینت ثبت شد؛ کیفیت برنج و مرمر مورد تأیید است.',
        studioNote: 'در کتابخانه آنلاین دقت با کد R02 منتشر شد.',
      },
    };
    const revMeta = reviewDefaults[cfg.id] ?? {
      reviewMessageStatus: 'no_message' as const,
      reviewMessage: '',
      studioNote: '',
    };

    const product: Product = {
      id: cfg.id,
      code: cfg.code,
      companyId: cfg.companyId,
      categoryFolder: cfg.categoryFolder,
      setFolder: cfg.setFolder,
      name: cfg.name,
      coverImageUrl: cfg.coverImageUrl,
      tags: cfg.tags,
      modelingStatus: cfg.modelingStatus,
      localFolderRelativePath: relBase,
      lastTripoFile: tripoGlbName,
      lastBlenderFile: blendName,
      lastGlbFile: exportGlbName,
      activeOnlineRevision: cfg.activeOnlineRevision,
      revisions,
      files,
      reviewMessageStatus: revMeta.reviewMessageStatus,
      reviewMessage: revMeta.reviewMessage,
      studioNote: revMeta.studioNote,
      updatedAt: now,
    };

    writeProductManifest(product);
    return product;
  });

  const initialState: StudioState = {
    activeCompanyId: 'comp-dan',
    activeProjectId: 'prod-dan-0042',
    companies,
    sets: [
      {
        id: 'set-aria',
        companyId: 'comp-dan',
        name: 'ست مبل ۳-۱-۱ آریا',
        category: 'پذیرایی',
        productIds: ['prod-dan-0042', 'prod-dan-0043'],
      },
      {
        id: 'set-fluted',
        companyId: 'comp-tol',
        name: 'ست ناهارخوری گردو شیاردار',
        category: 'ناهارخوری',
        productIds: ['prod-tol-0108'],
      },
    ],
    products,
    requests: [
      {
        id: 'req-101',
        requestCode: 'REQ-2026-101',
        companyId: 'comp-dan',
        productId: 'prod-dan-0042',
        title: 'مدلسازی مبل سه‌نفره آریا با پارچه بوکله کرم',
        category: 'پذیرایی',
        priority: 'urgent',
        status: 'in_modeling',
        feeToman: 4_500_000,
        clientImages: [
          {
            id: 'rimg-1',
            fileName: 'aria_front_studio.jpg',
            previewUrl: '/src/assets/images/sofa_aria_three_seater_1794993401647.jpg',
            status: 'approved',
            downloadedToProject: true,
          },
          {
            id: 'rimg-2',
            fileName: 'aria_lounge_angle.jpg',
            previewUrl: '/src/assets/images/armchair_aria_lounge_1794993412009.jpg',
            status: 'pending',
            downloadedToProject: false,
          },
        ],
        createdAt: '2026-11-16T09:15:00Z',
      },
      {
        id: 'req-102',
        requestCode: 'REQ-2026-102',
        companyId: 'comp-tol',
        productId: 'prod-tol-0108',
        title: 'میز ناهارخوری گردو ۸ نفره سری Fluted',
        category: 'ناهارخوری',
        priority: 'normal',
        status: 'in_review',
        feeToman: 5_200_000,
        clientImages: [
          {
            id: 'rimg-3',
            fileName: 'tolica_walnut_main.jpg',
            previewUrl: '/src/assets/images/dining_table_tolica_walnut_1794993402446.jpg',
            status: 'pending',
            downloadedToProject: false,
          },
        ],
        createdAt: '2026-11-17T14:20:00Z',
      },
      {
        id: 'req-103',
        requestCode: 'REQ-2026-103',
        companyId: 'comp-dgt',
        productId: 'prod-dgt-0019',
        title: 'آباژور ایستاده برنج و سنگ مرمر',
        category: 'نورپردازی',
        priority: 'low',
        status: 'completed',
        feeToman: 2_800_000,
        clientImages: [
          {
            id: 'rimg-4',
            fileName: 'deghat_lamp.jpg',
            previewUrl: '/src/assets/images/floor_lamp_deghat_brass_1794993403222.jpg',
            status: 'approved',
            downloadedToProject: true,
          },
        ],
        createdAt: '2026-11-12T11:00:00Z',
      },
    ],
    transfers: [
      {
        id: 'tr-init-1',
        direction: 'download',
        sourceLabel: 'Tripo',
        fileName: 'DAN-0042_tripo_raw.glb',
        lockedProjectId: 'prod-dan-0042',
        lockedCompanyCode: 'DAN',
        lockedProductCode: 'DAN-0042',
        targetSubfolder: 'Tripo',
        status: 'completed',
        progress: 100,
        sizeBytes: products[0].files.find((f) => f.subfolder === 'Tripo')?.sizeBytes ?? 14200,
        stagedTempPath: '_Staging/tr-init-1.part',
        finalDiskPath: 'DAN-Danshvar/Living Room/Aria Set/DAN-0042/Tripo/DAN-0042_tripo_raw.glb',
        sha256: products[0].files.find((f) => f.subfolder === 'Tripo')?.sha256,
        createdAt: '2026-11-15T11:20:00Z',
      },
      {
        id: 'tr-init-2',
        direction: 'upload',
        sourceLabel: 'CHIDO Cloud',
        fileName: 'DAN-0042_R02_final.glb',
        lockedProjectId: 'prod-dan-0042',
        lockedCompanyCode: 'DAN',
        lockedProductCode: 'DAN-0042',
        targetSubfolder: 'Exports',
        status: 'published',
        progress: 100,
        sizeBytes: products[0].files.find((f) => f.subfolder === 'Exports')?.sizeBytes ?? 14200,
        stagedTempPath: '_Staging/tr-init-2.part',
        finalDiskPath: 'DAN-Danshvar/Living Room/Aria Set/DAN-0042/Exports/DAN-0042_R02_final.glb',
        createdAt: '2026-11-17T16:45:00Z',
      },
    ],
    browserTabs: [
      {
        id: 'tab-chido',
        title: 'CHIDO Portal',
        url: 'https://chido.ir/admin',
        iconKey: 'chido',
        isPinned: true,
        lastProbed: null,
      },
      {
        id: 'tab-tripo',
        title: 'Tripo 3D',
        url: 'https://www.tripo3d.ai/app',
        iconKey: 'tripo',
        isPinned: true,
        lastProbed: null,
      },
      {
        id: 'tab-chatgpt',
        title: 'ChatGPT',
        url: 'https://chatgpt.com',
        iconKey: 'chatgpt',
        isPinned: true,
        lastProbed: null,
      },
      {
        id: 'tab-google',
        title: 'Google',
        url: 'https://www.google.com',
        iconKey: 'google',
        isPinned: false,
        lastProbed: null,
      },
    ],
    activeBrowserTabId: 'tab-tripo',
    siteScripts: [
      {
        id: 'script-tripo-helper',
        name: 'Tripo Download & Mesh Inspector Helper',
        domainPattern: 'tripo3d.ai',
        enabled: true,
        runAt: 'document-idle',
        code: `// Runs inside Electron WebContentsView on tripo3d.ai\nwindow.addEventListener('click', (e) => {\n  const btn = e.target.closest('button');\n  if (btn && /download|export/i.test(btn.textContent || '')) {\n    console.log('[CHIDO Bridge] Detected Tripo download trigger');\n  }\n});`,
        lastRunAt: '2026-11-17T16:10:00Z',
        lastError: null,
      },
      {
        id: 'script-chatgpt-image-hook',
        name: 'ChatGPT High-Res Image Hook',
        domainPattern: 'chatgpt.com',
        enabled: true,
        runAt: 'document-idle',
        code: `// Detects generated image containers for 1-click capture to Active Project\nconsole.log('[CHIDO Bridge] ChatGPT image capture listener attached');`,
        lastRunAt: null,
        lastError: null,
      },
    ],
    invoices: [
      {
        id: 'inv-1',
        invoiceNumber: 'INV-1405-081',
        companyId: 'comp-dan',
        requestId: 'req-101',
        title: 'پیش‌فاکتور مدلسازی ست آریا (سه‌نفره و تک‌نفره)',
        amountToman: 8_500_000,
        paidToman: 5_000_000,
        kind: 'proforma',
        status: 'partial',
        issuedAt: '2026-11-14T10:00:00Z',
      },
      {
        id: 'inv-2',
        invoiceNumber: 'INV-1405-082',
        companyId: 'comp-tol',
        requestId: 'req-102',
        title: 'هزینه مدلسازی میز ناهارخوری گردو شیاردار',
        amountToman: 5_200_000,
        paidToman: 0,
        kind: 'proforma',
        status: 'unpaid',
        issuedAt: '2026-11-17T14:30:00Z',
      },
      {
        id: 'inv-3',
        invoiceNumber: 'INV-1405-076',
        companyId: 'comp-dgt',
        requestId: 'req-103',
        title: 'تسویه کامل آباژور ایستاده برنج و مرمر',
        amountToman: 2_800_000,
        paidToman: 2_800_000,
        kind: 'final',
        status: 'paid',
        issuedAt: '2026-11-12T12:00:00Z',
      },
    ],
    logs: [
      {
        id: 'log-1',
        actor: 'ادریس (Studio Admin)',
        category: 'project',
        message: 'پروژه فعال روی DAN-0042 (مبل سه‌نفره آریا) قفل شد.',
        projectCode: 'DAN-0042',
        createdAt: '2026-11-18T00:45:00Z',
      },
      {
        id: 'log-2',
        actor: 'Blender Bridge',
        category: 'blender',
        message: 'ریویژن R03 از خروجی Blender در مسیر Exports ثبت شد.',
        projectCode: 'DAN-0042',
        createdAt: '2026-11-18T00:50:00Z',
      },
      {
        id: 'log-3',
        actor: 'Transfer Manager',
        category: 'cloud',
        message: 'نسخه R02 برای محصول DGT-0019 در کتابخانه دقت منتشر شد.',
        projectCode: 'DGT-0019',
        createdAt: '2026-11-16T18:05:00Z',
      },
    ],
    settings: {
      storageRootPath: ASSETS_ROOT,
      blenderExecutablePath: 'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
      chidoBackendUrl: 'https://api.chido.ir/v1',
      defaultJpgQuality: 92,
      defaultMaxSizeKb: 450,
      keepOriginalPng: false,
      transparentBgHex: '#FFFFFF',
      autoConvertPngToJpg: true,
      autoOpenDevToolsShortcut: 'F12',
      theme: 'light',
    },
  };

  saveStudioState(initialState);
  return initialState;
}

function reconcileTrackedAssetsOnDisk(state: StudioState) {
  let repaired = false;
  for (const comp of state.companies) {
    if (comp.englishFolder) {
      fs.mkdirSync(path.join(ASSETS_ROOT, comp.englishFolder), { recursive: true });
    }
  }

  for (const product of state.products) {
    ensureProductFolders(product.localFolderRelativePath);
    const preset: 'sofa' | 'armchair' | 'table' | 'lamp' = product.id.includes('tol')
      ? 'table'
      : product.id.includes('dgt')
        ? 'lamp'
        : product.id.includes('0043')
          ? 'armchair'
          : 'sofa';

    for (const file of product.files) {
      const abs = path.resolve(ASSETS_ROOT, file.diskRelativePath);
      if (!abs.startsWith(ASSETS_ROOT)) continue;
      if (fs.existsSync(abs)) continue;

      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const lower = file.fileName.toLowerCase();
      if (lower.endsWith('.glb')) {
        const buf = buildFurnitureGlb(preset);
        fs.writeFileSync(abs, buf);
        file.sizeBytes = buf.length;
        file.sha256 = sha256Buffer(buf);
        repaired = true;
      } else if (lower.endsWith('.png')) {
        const buf = createSampleTransparentPng(192, 192);
        fs.writeFileSync(abs, buf);
        file.sizeBytes = buf.length;
        file.sha256 = sha256Buffer(buf);
        repaired = true;
      } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        if (file.subfolder === 'References' && product.coverImageUrl) {
          copyGeneratedAssetIfExists(product.coverImageUrl, abs);
          const buf = fs.readFileSync(abs);
          file.sizeBytes = buf.length;
          file.sha256 = sha256Buffer(buf);
        } else {
          const conv = convertPngBufferToJpg(createSampleTransparentPng(256, 256), {
            quality: 90,
            maxSizeKb: 450,
            transparentBgHex: '#FFFFFF',
          });
          fs.writeFileSync(abs, conv.buffer);
          file.sizeBytes = conv.convertedBytes;
          file.sha256 = sha256Buffer(conv.buffer);
        }
        repaired = true;
      } else if (lower.endsWith('.json')) {
        const buf = Buffer.from(
          JSON.stringify({ productCode: product.code, meshPreset: preset, scaleMeters: 1.0, uvReady: true }, null, 2)
        );
        fs.writeFileSync(abs, buf);
        file.sizeBytes = buf.length;
        file.sha256 = sha256Buffer(buf);
        repaired = true;
      }
    }

    for (const rev of product.revisions) {
      const abs = path.resolve(ASSETS_ROOT, rev.diskRelativePath);
      if (!abs.startsWith(ASSETS_ROOT) || fs.existsSync(abs)) continue;
      if (rev.fileName.toLowerCase().endsWith('.glb')) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        const buf = buildFurnitureGlb(preset);
        fs.writeFileSync(abs, buf);
        rev.sizeBytes = buf.length;
        rev.sha256 = sha256Buffer(buf);
        repaired = true;
      }
    }

    writeProductManifest(product);
  }

  if (!state.settings.theme) {
    state.settings.theme = 'light';
    repaired = true;
  }

  const defaultNotes: Record<string, { status: Product['reviewMessageStatus']; msg: string; note: string }> = {
    'prod-dan-0042': {
      status: 'message_received',
      msg: 'کلاینت پیام داده: پایه‌های چوب گردو کمی تیره‌تر شود و بافت بوکله برجسته‌تر بماند.',
      note: 'ریویژن R03 در حال اصلاح متریال کف و نورگیر داخل Blender است.',
    },
    'prod-dan-0043': {
      status: 'revision_needed',
      msg: 'نیاز به بررسی زاویه نشیمن و ضخامت دسته پیش از انتشار نهایی.',
      note: 'پس از تأیید مهندس دانشور هم‌زمان با مبل سه‌نفره منتشر شود.',
    },
    'prod-tol-0108': {
      status: 'no_message',
      msg: '',
      note: 'آماده ورود به Blender برای تنظیم ابعاد واقعی میز ۲۲۰ سانتی.',
    },
    'prod-dgt-0019': {
      status: 'message_received',
      msg: 'تأیید نهایی کلاینت ثبت شد؛ کیفیت برنج و مرمر مورد تأیید است.',
      note: 'در کتابخانه آنلاین دقت با کد R02 منتشر شد.',
    },
  };

  for (const prod of state.products) {
    if (!prod.reviewMessageStatus) {
      const def = defaultNotes[prod.id];
      prod.reviewMessageStatus = def?.status ?? 'no_message';
      prod.reviewMessage = prod.reviewMessage ?? def?.msg ?? '';
      prod.studioNote = prod.studioNote ?? def?.note ?? '';
      repaired = true;
    }
  }

  for (const req of state.requests) {
    if (!req.reviewMessageStatus) {
      const linked = req.productId ? state.products.find((p) => p.id === req.productId) : null;
      req.reviewMessageStatus = linked?.reviewMessageStatus ?? (req.status === 'completed' ? 'message_received' : 'no_message');
      req.reviewMessage = req.reviewMessage ?? linked?.reviewMessage ?? '';
      req.studioNote = req.studioNote ?? linked?.studioNote ?? '';
      repaired = true;
    }
  }

  if (repaired) {
    saveStudioState(state);
  }
}

export function saveStudioState(state: StudioState) {
  fs.mkdirSync(ASSETS_ROOT, { recursive: true });
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}
