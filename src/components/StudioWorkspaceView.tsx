import { useEffect, useState } from 'react';
import {
  Box,
  Camera,
  Cloud,
  Code2,
  Cuboid,
  Download,
  ExternalLink,
  FileCode2,
  FileImage,
  FolderOpen,
  Globe,
  Grid,
  HardDrive,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { studioApi } from '../api/client';
import { formatBytes } from '../core/studioLogic';
import type {
  AssetSubfolder,
  BrowserProbeResult,
  Company,
  Product,
  ProductAssetFile,
  StudioState,
} from '../core/types';
import { GlbViewport, type GlbModelStats } from './GlbViewport';
import type { ContextMenuItem } from './StudioContextMenu';

export type StudioSubMode = 'preview3d' | 'browser' | 'files';

interface StudioWorkspaceViewProps {
  state: StudioState;
  activeCompany: Company | null;
  activeProject: Product | null;
  subMode: StudioSubMode;
  selectedGlbPath: string;
  onSubModeChange: (mode: StudioSubMode) => void;
  onSelectGlbPath: (path: string) => void;
  onStateChange: (state: StudioState) => void;
  onLaunchBlender: () => void;
  onOpenContextMenu: (e: React.MouseEvent, title: string, items: ContextMenuItem[]) => void;
  onNotify: (msg: string) => void;
}

const SUBFOLDERS: AssetSubfolder[] = ['References', 'AI Images', 'Tripo', 'Blender', 'Exports'];

export function StudioWorkspaceView({
  state,
  activeCompany,
  activeProject,
  subMode,
  selectedGlbPath,
  onSubModeChange,
  onSelectGlbPath,
  onStateChange,
  onLaunchBlender,
  onOpenContextMenu,
  onNotify,
}: StudioWorkspaceViewProps) {
  // 3D Preview controls
  const [previewSurface, setPreviewSurface] = useState<'local' | 'cloud'>('local');
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [lightingPreset, setLightingPreset] = useState<'studio' | 'warm' | 'clay'>('studio');
  const [resetSignal, setResetSignal] = useState(0);
  const [stats, setStats] = useState<GlbModelStats | null>(null);

  // Browser state
  const activeTab =
    state.browserTabs.find((t) => t.id === state.activeBrowserTabId) ?? state.browserTabs[0];
  const [addressInput, setAddressInput] = useState(activeTab?.url ?? 'https://www.tripo3d.ai/app');
  const [probing, setProbing] = useState(false);
  const [showAddTab, setShowAddTab] = useState(false);
  const [newTabUrl, setNewTabUrl] = useState('');
  const [browserToolDrawer, setBrowserToolDrawer] = useState<'none' | 'converter' | 'devtools'>('none');

  // PNG -> JPG converter settings
  const [jpgQuality, setJpgQuality] = useState(state.settings.defaultJpgQuality);
  const [maxSizeKb, setMaxSizeKb] = useState<string>(
    state.settings.defaultMaxSizeKb ? String(state.settings.defaultMaxSizeKb) : ''
  );
  const [keepOriginalPng, setKeepOriginalPng] = useState(state.settings.keepOriginalPng);
  const [transparentBgHex, setTransparentBgHex] = useState(state.settings.transparentBgHex);
  const [conversionInfo, setConversionInfo] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // F12 DevTools scripts
  const matchingScripts = state.siteScripts.filter((s) =>
    (activeTab?.url || '').includes(s.domainPattern)
  );
  const [selectedScriptId, setSelectedScriptId] = useState<string>(
    matchingScripts[0]?.id ?? state.siteScripts[0]?.id ?? ''
  );
  const selectedScript = state.siteScripts.find((s) => s.id === selectedScriptId);
  const [scriptDraft, setScriptDraft] = useState<string>(selectedScript?.code ?? '');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    '[CHIDO Chromium] Persistent session "persist:chido-browser" ready.',
  ]);

  // Project files uploader
  const [uploadSubfolder, setUploadSubfolder] = useState<AssetSubfolder>('References');
  const [autoConvertPng, setAutoConvertPng] = useState(state.settings.autoConvertPngToJpg);
  const [isDragging, setIsDragging] = useState(false);

  const glbCandidates = activeProject?.revisions.length
    ? activeProject.revisions.map((r) => r.diskRelativePath)
    : activeProject?.files
        .filter((f) => f.fileName.toLowerCase().endsWith('.glb'))
        .map((f) => f.diskRelativePath) ?? [];
  const effectiveGlbPath =
    selectedGlbPath && glbCandidates.includes(selectedGlbPath)
      ? selectedGlbPath
      : glbCandidates[glbCandidates.length - 1] ?? '';

  useEffect(() => {
    if (effectiveGlbPath && selectedGlbPath !== effectiveGlbPath) {
      onSelectGlbPath(effectiveGlbPath);
    }
  }, [activeProject?.id, effectiveGlbPath]);

  const appendConsole = (line: string) => {
    setConsoleLogs((prev) => [`[${new Date().toLocaleTimeString('en-GB')}] ${line}`, ...prev.slice(0, 24)]);
  };

  const handleProbe = async (urlToProbe = addressInput) => {
    setProbing(true);
    try {
      const res = await studioApi.probeBrowserUrl(urlToProbe, activeTab?.id);
      onStateChange(res.state);
      appendConsole(
        `Probe ${res.probe.url} -> HTTP ${res.probe.statusCode ?? 'err'} | XFO=${res.probe.xFrameOptions ?? 'none'}`
      );
      onNotify(`سازگاری ${urlToProbe} بررسی شد`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'خطا در بررسی آدرس');
    } finally {
      setProbing(false);
    }
  };

  const handleCaptureDownload = async (
    sourceLabel: 'Tripo' | 'ChatGPT' | 'Capture Image',
    fileName: string,
    convertPngToJpg: boolean
  ) => {
    setBusyAction(true);
    try {
      const res = await studioApi.captureDownload({
        sourceLabel,
        fileName,
        lockedProjectId: activeProject?.id ?? null,
        convertPngToJpg,
        quality: jpgQuality,
        maxSizeKb: maxSizeKb ? Number(maxSizeKb) : null,
        keepOriginalPng,
      });
      onStateChange(res.state);
      appendConsole(`[will-download] Locked=${res.transfer.lockedProductCode} -> ${res.transfer.finalDiskPath}`);
      onNotify(`فایل ${res.transfer.fileName} در ${res.transfer.lockedProductCode} ذخیره شد`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'خطا در ثبت دانلود');
    } finally {
      setBusyAction(false);
    }
  };

  const handleConvertPng = async (sourceRelativePath?: string) => {
    setBusyAction(true);
    try {
      const res = await studioApi.convertPngToJpg({
        sourceRelativePath,
        lockedProjectId: activeProject?.id ?? null,
        quality: jpgQuality,
        maxSizeKb: maxSizeKb ? Number(maxSizeKb) : null,
        transparentBgHex,
        keepOriginalPng,
      });
      onStateChange(res.state);
      const summary = `${res.jpgFileName} · ${res.width}×${res.height} · ${res.qualityUsed}% · ${formatBytes(res.convertedBytes)}${res.warning ? ` (${res.warning})` : ''}`;
      setConversionInfo(summary);
      onNotify(`تبدیل انجام شد: ${res.jpgFileName}`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'خطا در تبدیل تصویر');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      const form = new FormData();
      form.append('file', file);
      if (activeProject?.id) form.append('lockedProjectId', activeProject.id);
      form.append('subfolder', uploadSubfolder);
      form.append('convertPng', String(autoConvertPng));
      form.append('quality', String(state.settings.defaultJpgQuality));
      const res = await studioApi.uploadFile(form);
      onStateChange(res.state);
      onNotify(`فایل ${res.fileName} ثبت شد`);
    }
  };

  const handleBrowserContextMenu = (e: React.MouseEvent, contextTitle?: string) => {
    const targetCode = activeProject?.code || 'INBOX';
    const stamp = Date.now().toString().slice(-4);
    onOpenContextMenu(e, contextTitle || `مرورگر چیدو · ${activeTab?.title || 'Tab'}`, [
      {
        id: 'save-chatgpt-jpg',
        label: `ذخیره تصویر ChatGPT در ${targetCode} (تبدیل به JPG)`,
        hint: `${jpgQuality}%`,
        icon: <FileImage className="w-4 h-4 text-[var(--tone-emerald-ink)]" />,
        onSelect: () => handleCaptureDownload('ChatGPT', `${targetCode}_chatgpt_${stamp}.png`, true),
      },
      {
        id: 'save-chatgpt-png',
        label: 'ذخیره تصویر خام PNG بدون تبدیل',
        hint: 'PNG',
        icon: <Download className="w-4 h-4 text-[var(--accent-ink)]" />,
        onSelect: () => handleCaptureDownload('ChatGPT', `${targetCode}_cutout_${stamp}.png`, false),
      },
      {
        id: 'send-to-tripo',
        label: 'ارسال تصویر به تب Tripo برای ساخت سه‌بعدی',
        icon: <Cuboid className="w-4 h-4 text-[var(--tone-violet-ink)]" />,
        onSelect: async () => {
          const tripoTab = state.browserTabs.find((t) => t.iconKey === 'tripo');
          if (tripoTab) {
            setAddressInput(tripoTab.url);
            const res = await studioApi.manageBrowserTabs({ action: 'select', tabId: tripoTab.id });
            onStateChange(res.state);
          }
          appendConsole(`[Context Menu] تصویر برای ساخت مدل 3D به Tripo ارسال شد (${targetCode}).`);
          onNotify('تصویر آماده ساخت مدل سه‌بعدی در Tripo شد');
        },
      },
      {
        id: 'download-tripo-glb',
        label: `دانلود مدل GLB در پوشه ${targetCode}/Tripo`,
        hint: 'GLB',
        dividerAbove: true,
        icon: <Box className="w-4 h-4 text-[var(--tone-amber-ink)]" />,
        onSelect: () => handleCaptureDownload('Tripo', `${targetCode}_tripo_${stamp}.glb`, false),
      },
      {
        id: 'open-f12',
        label: 'باز کردن کنسول اسکریپت‌ها (F12)',
        hint: 'F12',
        dividerAbove: true,
        icon: <Terminal className="w-4 h-4 text-[var(--ink-muted)]" />,
        onSelect: () => setBrowserToolDrawer('devtools'),
      },
    ]);
  };

  const handleFileContextMenu = (e: React.MouseEvent, file: ProductAssetFile) => {
    const isGlb = file.fileName.toLowerCase().endsWith('.glb');
    const isPng = file.fileName.toLowerCase().endsWith('.png');
    const items: ContextMenuItem[] = [];

    if (isGlb) {
      items.push({
        id: 'preview-3d',
        label: 'نمایش سه‌بعدی در استودیو',
        hint: '3D',
        icon: <Cuboid className="w-4 h-4 text-[var(--accent-ink)]" />,
        onSelect: () => {
          onSelectGlbPath(file.diskRelativePath);
          onSubModeChange('preview3d');
        },
      });
      items.push({
        id: 'open-blender',
        label: 'باز کردن مدل در Blender',
        icon: <Box className="w-4 h-4 text-[var(--tone-violet-ink)]" />,
        onSelect: onLaunchBlender,
      });
    }
    if (isPng) {
      items.push({
        id: 'convert-png-jpg',
        label: 'تبدیل PNG به JPG و ذخیره در AI Images',
        hint: 'JPG',
        icon: <FileImage className="w-4 h-4 text-[var(--tone-emerald-ink)]" />,
        onSelect: () => handleConvertPng(file.diskRelativePath),
      });
    }
    items.push({
      id: 'copy-rel-path',
      label: 'کپی مسیر نسبی فایل',
      dividerAbove: items.length > 0,
      icon: <FolderOpen className="w-4 h-4 text-[var(--ink-muted)]" />,
      onSelect: () => {
        navigator.clipboard?.writeText(file.diskRelativePath).catch(() => {});
        onNotify('مسیر فایل کپی شد');
      },
    });
    items.push({
      id: 'archive-file',
      label: 'انتقال امن به _Archive',
      danger: true,
      dividerAbove: true,
      icon: <Trash2 className="w-4 h-4" />,
      onSelect: async () => {
        const res = await studioApi.deleteAsset(file.diskRelativePath);
        onStateChange(res.state);
        onNotify(`به آرشیو (${res.archivePath}) منتقل شد`);
      },
    });

    onOpenContextMenu(e, file.fileName, items);
  };

  const glbUrl = effectiveGlbPath ? `/api/assets/file?path=${encodeURIComponent(effectiveGlbPath)}` : '';
  const probe: BrowserProbeResult | null | undefined = activeTab?.lastProbed;
  const projectPngFiles =
    activeProject?.files.filter((f) => f.fileName.toLowerCase().endsWith('.png')) ?? [];

  return (
    <div className="h-full flex flex-col max-w-[1440px] w-full mx-auto px-6 py-4 gap-4">
      {/* Focused Sub-Workspace Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-bold text-[var(--ink-primary)] truncate">
            {activeProject ? (
              <>
                <span className="font-mono-tabular text-[var(--accent-ink)]">{activeProject.code}</span>
                <span className="mx-2 text-[var(--ink-muted)] font-normal">/</span>
                <span>{activeProject.name}</span>
              </>
            ) : (
              'صندوق ورودی عمومی (_Inbox)'
            )}
          </h1>
          {activeProject && activeCompany && (
            <span className="hidden md:inline text-sm text-[var(--ink-muted)] whitespace-nowrap">
              {activeCompany.name} · {activeProject.setFolder}
            </span>
          )}
        </div>

        {/* Clean 3-mode Workspace Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[var(--surface-subtle)] border border-[var(--border-hairline)] rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => onSubModeChange('preview3d')}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-colors ${
              subMode === 'preview3d'
                ? 'bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-sm'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Cuboid className="w-4 h-4 text-[var(--accent-ink)]" />
            <span>پیشنمایش سه‌بعدی</span>
          </button>
          <button
            type="button"
            onClick={() => onSubModeChange('browser')}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-colors ${
              subMode === 'browser'
                ? 'bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-sm'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Globe className="w-4 h-4 text-[var(--tone-violet-ink)]" />
            <span>مرورگر داخلی</span>
          </button>
          <button
            type="button"
            onClick={() => onSubModeChange('files')}
            className={`px-3.5 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-colors ${
              subMode === 'files'
                ? 'bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-sm'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-[var(--tone-amber-ink)]" />
            <span>فایل‌های پروژه</span>
          </button>
        </div>
      </div>

      {/* MODE 1: Spacious Full-Width 3D Viewport + Minimal Revision Strip */}
      {subMode === 'preview3d' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {!activeProject ? (
            <div className="flex-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-card)] flex items-center justify-center p-8 text-base text-[var(--ink-muted)]">
              یک محصول را از نوار بالا انتخاب کنید تا مدل سه‌بعدی GLB آن نمایش داده شود.
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-[420px] relative">
                {glbUrl ? (
                  <GlbViewport
                    glbUrl={glbUrl}
                    mode={previewSurface}
                    wireframe={wireframe}
                    showGrid={showGrid}
                    lightingPreset={lightingPreset}
                    onStatsLoaded={setStats}
                    resetSignal={resetSignal}
                  />
                ) : (
                  <div className="w-full h-full rounded-xl bg-slate-900 text-slate-300 flex items-center justify-center text-sm">
                    فایل GLB برای این محصول ثبت نشده است.
                  </div>
                )}
              </div>

              {/* Single-row Clean Viewport + Revision Strip */}
              <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 p-1 bg-[var(--surface-subtle)] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPreviewSurface('local')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${
                        previewSurface === 'local'
                          ? 'bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-sm'
                          : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>هارد</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewSurface('cloud')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${
                        previewSurface === 'cloud'
                          ? 'bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-sm'
                          : 'text-[var(--ink-muted)]'
                      }`}
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>آنلاین</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setWireframe((v) => !v)}
                    className={`h-9 px-3 rounded-lg border font-medium ${
                      wireframe
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                        : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]'
                    }`}
                  >
                    Wireframe
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowGrid((v) => !v)}
                    className={`h-9 px-3 rounded-lg border font-medium flex items-center gap-1.5 ${
                      showGrid
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                        : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]'
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                    <span>گرید</span>
                  </button>

                  <select
                    aria-label="حالت نورپردازی پیشنمایش"
                    value={lightingPreset}
                    onChange={(e) => setLightingPreset(e.target.value as 'studio' | 'warm' | 'clay')}
                    className="h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                  >
                    <option value="studio">نور استودیو</option>
                    <option value="warm">نور گرم</option>
                    <option value="clay">Clay (مش خام)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setResetSignal((n) => n + 1)}
                    className="h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-[var(--ink-primary)] flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>ریست دوربین</span>
                  </button>
                </div>

                {/* Revisions + Mesh Info */}
                <div className="flex flex-wrap items-center gap-3">
                  {stats && (
                    <div className="font-mono-tabular text-xs text-[var(--ink-muted)] flex items-center gap-3">
                      <span>{stats.meshCount} مش</span>
                      <span>{stats.triangleCount} مثلث</span>
                      <span dir="ltr">
                        {stats.dimensionsMeters[0]}×{stats.dimensionsMeters[1]}×{stats.dimensionsMeters[2]}m
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <label htmlFor="rev-select" className="text-[var(--ink-muted)]">
                      ریویژن:
                    </label>
                    <select
                      id="rev-select"
                      value={effectiveGlbPath}
                      onChange={(e) => onSelectGlbPath(e.target.value)}
                      className="h-9 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-mono-tabular text-sm font-semibold text-[var(--ink-primary)]"
                    >
                      {activeProject.revisions.map((r) => (
                        <option key={r.id} value={r.diskRelativePath}>
                          {r.version} · {r.fileName} {r.isActiveOnline ? '(آنلاین)' : ''}
                        </option>
                      ))}
                    </select>

                    {(() => {
                      const activeRev = activeProject.revisions.find(
                        (r) => r.diskRelativePath === effectiveGlbPath
                      );
                      if (!activeRev) return null;
                      if (activeRev.status === 'local' || activeRev.status === 'ready_to_upload') {
                        return (
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await studioApi.revisionAction(activeRev.id, 'upload');
                              onStateChange(res.state);
                              onNotify(`${activeRev.version} به مخزن آنلاین ارسال شد`);
                            }}
                            className="h-9 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-medium flex items-center gap-1.5"
                          >
                            <UploadCloud className="w-4 h-4" />
                            <span>آپلود به چیدو</span>
                          </button>
                        );
                      }
                      if (activeRev.status === 'pending_approval') {
                        return (
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await studioApi.revisionAction(activeRev.id, 'publish');
                              onStateChange(res.state);
                              onNotify(`${activeRev.version} منتشر شد`);
                            }}
                            className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
                          >
                            تأیید و انتشار
                          </button>
                        );
                      }
                      return null;
                    })()}

                    <button
                      type="button"
                      onClick={async () => {
                        const res = await studioApi.exportBlenderRevision(activeProject.id);
                        onStateChange(res.state);
                        onNotify('ریویژن جدید از خروجی Blender ثبت شد');
                      }}
                      className="h-9 px-3 rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] text-sm font-medium text-[var(--ink-primary)]"
                    >
                      + خروجی Blender
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* MODE 2: Clean Full-Width Internal Browser with Right-Click Context Menu */}
      {subMode === 'browser' && (
        <div className="flex-1 min-h-0 flex flex-col bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl overflow-hidden">
          {/* Tab Strip */}
          <div className="bg-[var(--surface-subtle)] border-b border-[var(--border-hairline)] px-3 pt-2 flex items-center gap-1 overflow-x-auto">
            {state.browserTabs.map((tab) => {
              const active = tab.id === activeTab?.id;
              return (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-sm border-t border-x shrink-0 ${
                    active
                      ? 'bg-[var(--surface-card)] border-[var(--border-hairline)] text-[var(--ink-primary)] font-semibold'
                      : 'bg-[var(--surface-elevated)]/60 border-transparent text-[var(--ink-secondary)] hover:bg-[var(--surface-elevated)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      setAddressInput(tab.url);
                      const res = await studioApi.manageBrowserTabs({ action: 'select', tabId: tab.id });
                      onStateChange(res.state);
                    }}
                    className="flex items-center gap-2 whitespace-nowrap"
                  >
                    <Globe className="w-4 h-4 text-[var(--accent-ink)]" />
                    <span>{tab.title}</span>
                  </button>
                  {!tab.isPinned && state.browserTabs.length > 1 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await studioApi.manageBrowserTabs({ action: 'close', tabId: tab.id });
                        onStateChange(res.state);
                      }}
                      aria-label={`بستن تب ${tab.title}`}
                      className="p-0.5 rounded hover:bg-[var(--surface-subtle)] text-[var(--ink-muted)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setShowAddTab((v) => !v)}
              aria-label="تب جدید مرورگر"
              className="p-2 rounded-md hover:bg-[var(--surface-elevated)] text-[var(--ink-secondary)] shrink-0"
            >
              <Plus className="w-4.5 h-4.5" />
            </button>
          </div>

          {showAddTab && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newTabUrl.trim()) return;
                const cleaned = newTabUrl.trim().startsWith('http')
                  ? newTabUrl.trim()
                  : `https://${newTabUrl.trim()}`;
                const title = cleaned.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || 'Tab';
                const res = await studioApi.manageBrowserTabs({ action: 'add', title, url: cleaned });
                setAddressInput(cleaned);
                setNewTabUrl('');
                setShowAddTab(false);
                onStateChange(res.state);
              }}
              className="bg-[var(--surface-subtle)] border-b border-[var(--border-hairline)] px-4 py-2.5 flex items-center gap-2.5"
            >
              <label htmlFor="new-tab-url" className="text-sm text-[var(--ink-secondary)]">
                آدرس جدید:
              </label>
              <input
                id="new-tab-url"
                type="text"
                dir="ltr"
                value={newTabUrl}
                onChange={(e) => setNewTabUrl(e.target.value)}
                placeholder="https://www.tripo3d.ai"
                className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] text-sm font-mono-tabular text-[var(--ink-primary)]"
              />
              <button
                type="submit"
                className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-semibold"
              >
                باز کردن
              </button>
            </form>
          )}

          {/* Clean Address & Tool Bar */}
          <div className="p-3.5 border-b border-[var(--border-hairline)] flex flex-wrap items-center gap-2.5">
            <label htmlFor="browser-address-bar" className="sr-only">
              آدرس وب‌سایت
            </label>
            <input
              id="browser-address-bar"
              type="text"
              dir="ltr"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              className="flex-1 min-w-[240px] h-10 px-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-sm font-mono-tabular text-[var(--ink-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />

            <button
              type="button"
              onClick={() => handleProbe(addressInput)}
              disabled={probing}
              className="h-10 px-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-sm font-medium text-[var(--ink-primary)] flex items-center gap-1.5 whitespace-nowrap"
            >
              <RefreshCw className={`w-4 h-4 ${probing ? 'animate-spin' : ''}`} />
              <span>{probing ? 'در حال بررسی...' : 'تست سازگاری'}</span>
            </button>

            <a
              href={addressInput}
              target="_blank"
              rel="noreferrer"
              className="h-10 px-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-sm font-medium text-[var(--ink-primary)] flex items-center gap-1.5 whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              <span>تب خارجی</span>
            </a>

            <button
              type="button"
              onClick={() =>
                setBrowserToolDrawer((v) => (v === 'converter' ? 'none' : 'converter'))
              }
              className={`h-10 px-3.5 rounded-lg border text-sm font-medium flex items-center gap-1.5 whitespace-nowrap ${
                browserToolDrawer === 'converter'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                  : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>مبدل PNG→JPG</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setBrowserToolDrawer((v) => (v === 'devtools' ? 'none' : 'devtools'))
              }
              className={`h-10 px-3.5 rounded-lg border text-sm font-medium flex items-center gap-1.5 whitespace-nowrap ${
                browserToolDrawer === 'devtools'
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                  : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span dir="ltr">F12 &amp; Scripts</span>
            </button>
          </div>

          {/* Main Browser Surface + Optional On-Demand Tool Drawer */}
          <div className="flex-1 min-h-[420px] flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[var(--border-hairline)]">
            <div
              data-testid="browser-surface"
              onContextMenu={(e) => handleBrowserContextMenu(e)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData('application/x-chido-asset');
                if (raw) {
                  const parsed = JSON.parse(raw) as { fileName: string };
                  appendConsole(`[Drag & Drop] تصویر مرجع ${parsed.fileName} دریافت شد.`);
                  onNotify(`تصویر ${parsed.fileName} به مرورگر ارسال شد`);
                }
              }}
              className="flex-1 p-6 flex flex-col justify-between gap-5 bg-[var(--surface-subtle)]/55"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 font-bold text-[var(--ink-primary)]">
                    {probe ? (
                      probe.iframeEmbeddable ? (
                        <ShieldCheck className="w-4.5 h-4.5 text-[var(--tone-emerald-ink)]" />
                      ) : (
                        <ShieldAlert className="w-4.5 h-4.5 text-[var(--tone-amber-ink)]" />
                      )
                    ) : (
                      <Globe className="w-4.5 h-4.5 text-[var(--accent-ink)]" />
                    )}
                    <span>{activeTab?.title}</span>
                  </div>
                  {probe && (
                    <span className="font-mono-tabular text-xs text-[var(--ink-muted)]" dir="ltr">
                      HTTP {probe.statusCode ?? 'N/A'} · XFO: {probe.xFrameOptions ?? 'None'}
                    </span>
                  )}
                </div>

                <p className="text-sm text-[var(--ink-secondary)] leading-relaxed max-w-3xl">
                  {probe
                    ? probe.reason
                    : 'در محیط دسکتاپ Electron این تب با موتور Chromium واقعی (WebContentsView) و نشست ماندگار باز می‌شود. روی پیشنمایش تصویر زیر یا صفحه کلیک راست کنید تا مستقیماً در پروژه قفل‌شده ذخیره و تبدیل شود.'}
                </p>

                {/* Interactive Right-Click Target Card for ChatGPT / Tripo Preview */}
                {activeProject && (
                  <div
                    data-testid="browser-right-click-card"
                    onContextMenu={(e) =>
                      handleBrowserContextMenu(e, `تصویر خروجی · ${activeProject.code}`)
                    }
                    className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-card)] p-4 flex flex-col sm:flex-row items-center gap-4 max-w-2xl cursor-context-menu hover:border-[var(--accent-primary)] transition-colors"
                  >
                    <div className="w-32 h-24 rounded-lg overflow-hidden border border-[var(--border-hairline)] bg-[var(--surface-subtle)] shrink-0">
                      <img
                        src={activeProject.coverImageUrl}
                        alt={`خروجی ${activeProject.name}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink-primary)]">
                        <MousePointerClick className="w-4 h-4 text-[var(--accent-ink)] shrink-0" />
                        <span>خروجی تصویر / مدل ({activeProject.code})</span>
                      </div>
                      <p className="text-sm text-[var(--ink-secondary)]">
                        روی این تصویر <strong>راست‌کلیک</strong> کنید تا منوی ذخیره مستقیم در پوشه{' '}
                        <span className="font-mono-tabular" dir="ltr">
                          {activeProject.code}/AI Images
                        </span>{' '}
                        با تبدیل PNG→JPG یا ارسال به Tripo باز شود.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Clean 3-button Capture Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    handleCaptureDownload(
                      'Tripo',
                      `${activeProject?.code || 'INBOX'}_tripo_${Date.now().toString().slice(-4)}.glb`,
                      false
                    )
                  }
                  className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-card)] hover:border-[var(--accent-primary)] text-right transition-colors space-y-1"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink-primary)]">
                    <Download className="w-4 h-4 text-[var(--accent-ink)]" />
                    <span>دانلود مدل GLB از Tripo</span>
                  </div>
                  <div className="text-xs text-[var(--ink-muted)]">
                    ذخیره مستقیم در پوشه {activeProject ? `${activeProject.code}/Tripo` : '_Inbox'}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    handleCaptureDownload(
                      'ChatGPT',
                      `${activeProject?.code || 'INBOX'}_chatgpt_${Date.now().toString().slice(-4)}.png`,
                      true
                    )
                  }
                  className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-card)] hover:border-[var(--accent-primary)] text-right transition-colors space-y-1"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink-primary)]">
                    <FileImage className="w-4 h-4 text-[var(--tone-emerald-ink)]" />
                    <span>ذخیره تصویر ChatGPT (JPG)</span>
                  </div>
                  <div className="text-xs text-[var(--ink-muted)]">
                    تبدیل خودکار با کیفیت {jpgQuality}% در AI Images
                  </div>
                </button>

                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    handleCaptureDownload(
                      'Capture Image',
                      `${activeProject?.code || 'INBOX'}_capture_${Date.now().toString().slice(-4)}.png`,
                      true
                    )
                  }
                  className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-card)] hover:border-[var(--accent-primary)] text-right transition-colors space-y-1"
                >
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink-primary)]">
                    <Camera className="w-4 h-4 text-[var(--tone-violet-ink)]" />
                    <span>Capture Image (ناحیه صفحه)</span>
                  </div>
                  <div className="text-xs text-[var(--ink-muted)]">
                    ثبت برش صفحه در پروژه قفل‌شده
                  </div>
                </button>
              </div>
            </div>

            {/* On-Demand Side Tool Panel: Only mounted when user toggles Converter or F12 */}
            {browserToolDrawer === 'converter' && (
              <div className="w-full lg:w-96 p-5 space-y-4 bg-[var(--surface-card)] text-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-[var(--ink-primary)]">تبدیل PNG به JPG</h3>
                  <button
                    type="button"
                    onClick={() => setBrowserToolDrawer('none')}
                    aria-label="بستن مبدل تصویر"
                    className="p-1 rounded hover:bg-[var(--surface-subtle)] text-[var(--ink-muted)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="jpg-quality-range" className="font-medium text-[var(--ink-secondary)]">
                      کیفیت JPG
                    </label>
                    <span className="font-mono-tabular font-semibold">{jpgQuality}%</span>
                  </div>
                  <input
                    id="jpg-quality-range"
                    type="range"
                    min={40}
                    max={100}
                    value={jpgQuality}
                    onChange={(e) => setJpgQuality(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="jpg-max-kb" className="block font-medium text-[var(--ink-secondary)] mb-1">
                      سقف حجم (KB)
                    </label>
                    <input
                      id="jpg-max-kb"
                      type="number"
                      dir="ltr"
                      value={maxSizeKb}
                      onChange={(e) => setMaxSizeKb(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-mono-tabular text-[var(--ink-primary)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="jpg-bg-hex" className="block font-medium text-[var(--ink-secondary)] mb-1">
                      پس‌زمینه شفافیت
                    </label>
                    <input
                      id="jpg-bg-hex"
                      type="text"
                      dir="ltr"
                      value={transparentBgHex}
                      onChange={(e) => setTransparentBgHex(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-mono-tabular text-[var(--ink-primary)]"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[var(--ink-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keepOriginalPng}
                    onChange={(e) => setKeepOriginalPng(e.target.checked)}
                  />
                  <span>نگهداری فایل PNG اصلی</span>
                </label>

                {projectPngFiles.map((png) => (
                  <div
                    key={png.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)]"
                  >
                    <span className="font-mono-tabular text-xs truncate" dir="ltr">
                      {png.fileName}
                    </span>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => handleConvertPng(png.diskRelativePath)}
                      className="px-3 py-1 rounded bg-[var(--accent-primary)] text-white text-xs font-medium shrink-0"
                    >
                      تبدیل
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  disabled={busyAction}
                  onClick={() => handleConvertPng()}
                  className="w-full h-10 rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] font-semibold text-[var(--ink-primary)]"
                >
                  آزمایش تبدیل PNG شفاف به JPG
                </button>

                {conversionInfo && (
                  <div className="p-3 rounded-lg bg-[var(--tone-emerald-bg)] text-xs text-[var(--tone-emerald-ink)] font-medium">
                    {conversionInfo}
                  </div>
                )}
              </div>
            )}

            {browserToolDrawer === 'devtools' && (
              <div className="w-full lg:w-[400px] p-5 space-y-3 bg-slate-900 text-slate-100 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    <Code2 className="w-4.5 h-4.5 text-blue-400" />
                    <span>اسکریپت‌های سایت و کنسول</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBrowserToolDrawer('none')}
                    aria-label="بستن پنل اسکریپت"
                    className="p-1 rounded hover:bg-slate-800 text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {state.siteScripts.map((script) => (
                    <div
                      key={script.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                        script.id === selectedScriptId
                          ? 'border-blue-500 bg-slate-800'
                          : 'border-slate-700 bg-slate-800/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedScriptId(script.id);
                          setScriptDraft(script.code);
                        }}
                        className="text-right flex-1 min-w-0 truncate"
                      >
                        {script.name}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await studioApi.updateScript(script.id, {
                            enabled: !script.enabled,
                          });
                          onStateChange(res.state);
                        }}
                        className={`px-2.5 py-0.5 rounded text-xs ${
                          script.enabled ? 'bg-emerald-600/25 text-emerald-300' : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {script.enabled ? 'فعال' : 'خاموش'}
                      </button>
                    </div>
                  ))}
                </div>

                <textarea
                  aria-label="ویرایشگر کد اسکریپت"
                  dir="ltr"
                  rows={5}
                  value={scriptDraft}
                  onChange={(e) => setScriptDraft(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs font-mono-tabular text-emerald-300"
                />

                <button
                  type="button"
                  disabled={!selectedScript}
                  onClick={async () => {
                    if (!selectedScript) return;
                    const res = await studioApi.updateScript(selectedScript.id, {
                      code: scriptDraft,
                      testRun: true,
                    });
                    onStateChange(res.state);
                    appendConsole(`Executed "${selectedScript.name}"`);
                    onNotify('اسکریپت ذخیره و آزمایش شد');
                  }}
                  className="h-9 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                >
                  ذخیره و اجرای آزمایشی
                </button>

                <div
                  dir="ltr"
                  className="max-h-32 overflow-y-auto bg-slate-950 rounded-lg p-2.5 text-xs font-mono-tabular text-slate-300 space-y-1"
                >
                  {consoleLogs.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODE 3: Clean Active Project Files & Uploader with Right-Click */}
      {subMode === 'files' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleUploadFiles(e.dataTransfer.files);
            }}
            className={`rounded-xl border-2 border-dashed p-5 flex flex-wrap items-center justify-between gap-4 transition-colors ${
              isDragging
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                : 'border-[var(--border-strong)] bg-[var(--surface-card)]'
            }`}
          >
            <div>
              <div className="text-base font-bold text-[var(--ink-primary)] flex items-center gap-2">
                <Upload className="w-4.5 h-4.5 text-[var(--accent-ink)]" />
                <span>
                  آپلود مستقیم در {activeProject ? `${activeProject.code}` : '_Inbox'}
                </span>
              </div>
              <p className="text-sm text-[var(--ink-muted)] mt-0.5">
                {activeProject ? activeProject.localFolderRelativePath : './chido-assets/_Inbox'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="زیرپوشه مقصد"
                value={uploadSubfolder}
                onChange={(e) => setUploadSubfolder(e.target.value as AssetSubfolder)}
                className="h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-sm text-[var(--ink-primary)]"
              >
                {SUBFOLDERS.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2 text-sm text-[var(--ink-secondary)] cursor-pointer px-2">
                <input
                  type="checkbox"
                  checked={autoConvertPng}
                  onChange={(e) => setAutoConvertPng(e.target.checked)}
                />
                <span>PNG→JPG</span>
              </label>

              <label className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer">
                <span>انتخاب فایل</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleUploadFiles(e.target.files)}
                />
              </label>
            </div>
          </div>

          {activeProject ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {activeProject.files.map((file) => {
                const isImage = file.mimeType.startsWith('image/');
                const isGlb = file.fileName.toLowerCase().endsWith('.glb');
                const fileUrl = `/api/assets/file?path=${encodeURIComponent(file.diskRelativePath)}`;

                return (
                  <div
                    key={file.id}
                    onContextMenu={(e) => handleFileContextMenu(e, file)}
                    className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-card)] hover:border-[var(--border-strong)] flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] overflow-hidden flex items-center justify-center shrink-0">
                        {isImage ? (
                          <img
                            src={fileUrl}
                            alt={file.fileName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : isGlb ? (
                          <Cuboid className="w-5.5 h-5.5 text-[var(--accent-ink)]" />
                        ) : (
                          <FileCode2 className="w-5.5 h-5.5 text-[var(--ink-muted)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--ink-primary)] truncate" dir="ltr">
                          {file.fileName}
                        </div>
                        <div className="text-xs text-[var(--ink-muted)] flex items-center gap-1.5">
                          <span className="truncate">{file.subfolder}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular whitespace-nowrap" dir="ltr">
                            {formatBytes(file.sizeBytes)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isGlb && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectGlbPath(file.diskRelativePath);
                            onSubModeChange('preview3d');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-semibold"
                        >
                          3D
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await studioApi.deleteAsset(file.diskRelativePath);
                          onStateChange(res.state);
                          onNotify(`به آرشیو (${res.archivePath}) منتقل شد`);
                        }}
                        aria-label={`انتقال ${file.fileName} به آرشیو`}
                        className="p-2 rounded-lg hover:bg-[var(--tone-rose-bg)] text-[var(--ink-muted)] hover:text-[var(--tone-rose-ink)]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-card)] p-8 text-center text-sm text-[var(--ink-muted)]">
              برای مشاهده پوشه‌های تمام شرکت‌ها و `_Inbox` به تب «کتابخانه و دیسک» بروید.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
