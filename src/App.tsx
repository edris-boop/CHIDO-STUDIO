import { useEffect, useState } from 'react';
import { Box, CheckCircle2, X } from 'lucide-react';
import { studioApi, type DiskStats } from './api/client';
import { AccountingWorkspaceView } from './components/AccountingWorkspaceView';
import { ActiveProjectDrawer } from './components/ActiveProjectDrawer';
import { LibraryDiskView } from './components/LibraryDiskView';
import { PipelineWorkspaceView } from './components/PipelineWorkspaceView';
import { StudioContextMenu, type ContextMenuItem, type ContextMenuState } from './components/StudioContextMenu';
import { StudioWorkspaceView, type StudioSubMode } from './components/StudioWorkspaceView';
import { SystemHubView } from './components/SystemHubView';
import { TopBar } from './components/TopBar';
import type { StudioNavSection, StudioState, StudioTheme } from './core/types';

const THEME_STORAGE_KEY = 'chido-studio-theme';

export default function App() {
  const [state, setState] = useState<StudioState | null>(null);
  const [diskStats, setDiskStats] = useState<DiskStats>({ totalBytes: 0, fileCount: 0 });
  const [activeSection, setActiveSection] = useState<StudioNavSection>('studio');
  const [studioSubMode, setStudioSubMode] = useState<StudioSubMode>('preview3d');
  const [selectedGlbPath, setSelectedGlbPath] = useState<string>('');
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<StudioTheme>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    if (saved === 'light' || saved === 'pastel' || saved === 'charcoal') return saved;
    return 'light';
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [blenderDialog, setBlenderDialog] = useState<{
    productCode: string;
    manifestPath: string;
    launchCommand: string;
    spawnedHostBlender: boolean;
  } | null>(null);

  const notify = (msg: string) => setToast(msg);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    studioApi.getState().then((res) => {
      setState(res.state);
      setDiskStats(res.diskStats);
      const savedLocal = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (!savedLocal && res.state.settings.theme) {
        setTheme(res.state.settings.theme);
      }
    });
  }, []);

  const handleStateUpdate = (nextState: StudioState) => {
    setState(nextState);
    studioApi.getDiskTree().then((r) => setDiskStats(r.diskStats)).catch(() => {});
  };

  const handleThemeChange = async (nextTheme: StudioTheme) => {
    setTheme(nextTheme);
    if (state) {
      const res = await studioApi.updateSettings({ theme: nextTheme });
      handleStateUpdate(res.state);
    }
  };

  const openContextMenu = (e: React.MouseEvent, title: string, items: ContextMenuItem[]) => {
    if (e.shiftKey) return; // Allow Shift+Right-Click for native browser DevTools inspect
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, title, items });
  };

  const handleSelectProject = async (projectId: string | null) => {
    if (!state) return;
    const prod = state.products.find((p) => p.id === projectId);
    const res = await studioApi.setActiveProject(
      prod ? prod.companyId : state.activeCompanyId,
      projectId
    );
    handleStateUpdate(res.state);
    notify(
      prod
        ? `پروژه فعال روی ${prod.code} قفل شد`
        : 'پروژه فعال برداشته شد؛ ورودی‌ها به _Inbox می‌روند'
    );
  };

  const handleLaunchBlender = async (productId?: string) => {
    if (!state) return;
    const targetId = productId || state.activeProjectId;
    if (!targetId) return;
    const res = await studioApi.launchBlender(targetId);
    handleStateUpdate(res.state);
    const prod = res.state.products.find((p) => p.id === targetId);
    setBlenderDialog({
      productCode: prod?.code || '',
      manifestPath: res.manifestPath,
      launchCommand: res.launchCommand,
      spawnedHostBlender: res.spawnedHostBlender,
    });
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-[var(--surface-canvas)] text-[var(--ink-secondary)] flex items-center justify-center text-base">
        در حال راه‌اندازی CHIDO Studio...
      </div>
    );
  }

  const activeProject = state.products.find((p) => p.id === state.activeProjectId) ?? null;
  const activeCompany =
    state.companies.find((c) => c.id === (activeProject?.companyId ?? state.activeCompanyId)) ??
    null;

  const pipelineAttentionCount =
    state.requests.filter((r) => r.status !== 'completed').length +
    state.products.reduce(
      (sum, p) => sum + p.revisions.filter((r) => r.status === 'pending_approval').length,
      0
    );

  return (
    <div className="h-screen flex flex-col bg-[var(--surface-canvas)] text-[var(--ink-primary)] overflow-hidden">
      <TopBar
        state={state}
        activeCompany={activeCompany}
        activeProject={activeProject}
        activeSection={activeSection}
        pipelineAttentionCount={pipelineAttentionCount}
        theme={theme}
        onThemeChange={handleThemeChange}
        onSelectSection={setActiveSection}
        onSelectProject={handleSelectProject}
        onLaunchBlender={() => handleLaunchBlender()}
        isInspectorOpen={isInspectorOpen}
        onToggleInspector={() => setIsInspectorOpen((v) => !v)}
      />

      <main className="flex-1 overflow-y-auto min-h-0">
        {activeSection === 'studio' && (
          <StudioWorkspaceView
            state={state}
            activeCompany={activeCompany}
            activeProject={activeProject}
            subMode={studioSubMode}
            selectedGlbPath={selectedGlbPath}
            onSubModeChange={setStudioSubMode}
            onSelectGlbPath={setSelectedGlbPath}
            onStateChange={handleStateUpdate}
            onLaunchBlender={() => handleLaunchBlender()}
            onOpenContextMenu={openContextMenu}
            onNotify={notify}
          />
        )}

        {activeSection === 'pipeline' && (
          <PipelineWorkspaceView
            state={state}
            onStateChange={handleStateUpdate}
            onSelectAndOpenStudio={(pid, subMode = 'preview3d', glbPath) => {
              handleSelectProject(pid);
              setStudioSubMode(subMode);
              if (glbPath) setSelectedGlbPath(glbPath);
              setActiveSection('studio');
            }}
            onLaunchBlender={(pid) => handleLaunchBlender(pid)}
            onOpenContextMenu={openContextMenu}
            onNotify={notify}
          />
        )}

        {activeSection === 'library' && (
          <LibraryDiskView
            state={state}
            onStateChange={handleStateUpdate}
            onOpenInStudio={(pid, subMode) => {
              handleSelectProject(pid);
              setStudioSubMode(subMode);
              setActiveSection('studio');
            }}
            onLaunchBlender={(pid) => handleLaunchBlender(pid)}
            onOpenContextMenu={openContextMenu}
            onNotify={notify}
          />
        )}

        {activeSection === 'accounting' && (
          <AccountingWorkspaceView
            state={state}
            onStateChange={handleStateUpdate}
            onNotify={notify}
          />
        )}

        {activeSection === 'system' && (
          <SystemHubView
            state={state}
            diskStats={diskStats}
            theme={theme}
            onThemeChange={handleThemeChange}
            onStateChange={handleStateUpdate}
            onNotify={notify}
          />
        )}
      </main>

      {/* Slide-over Project Details Drawer (closed by default) */}
      <ActiveProjectDrawer
        open={isInspectorOpen}
        product={activeProject}
        company={activeCompany}
        onClose={() => setIsInspectorOpen(false)}
        onOpenContextMenu={openContextMenu}
        onConvertAssetPng={async (diskRelativePath) => {
          const res = await studioApi.convertPngToJpg({
            sourceRelativePath: diskRelativePath,
            lockedProjectId: activeProject?.id ?? null,
            quality: state.settings.defaultJpgQuality,
            maxSizeKb: state.settings.defaultMaxSizeKb,
            keepOriginalPng: state.settings.keepOriginalPng,
          });
          handleStateUpdate(res.state);
          notify(`تبدیل به JPG انجام شد: ${res.jpgFileName}`);
        }}
        onUploadLatestToCloud={async (revId) => {
          const res = await studioApi.revisionAction(revId, 'upload');
          handleStateUpdate(res.state);
          notify('آخرین ریویژن برای تأیید به مخزن آنلاین ارسال شد');
        }}
      />

      {/* Global CHIDO Custom Right-Click Context Menu */}
      <StudioContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />

      {/* Centered Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2.5 max-w-lg border border-slate-700"
        >
          <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Blender Bridge Launch Modal */}
      {blenderDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="وضعیت اجرای Blender Bridge"
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
        >
          <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-bold text-[var(--ink-primary)]">
                <Box className="w-5 h-5 text-[var(--accent-ink)]" />
                <span>اتصال Blender برای پروژه {blenderDialog.productCode}</span>
              </div>
              <button
                type="button"
                onClick={() => setBlenderDialog(null)}
                aria-label="بستن پنجره Blender"
                className="p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--ink-muted)]"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="text-sm text-[var(--ink-secondary)] leading-relaxed space-y-2.5">
              <p>
                مانیفست پروژه فعال برای افزونه{' '}
                <span className="font-mono-tabular font-semibold text-[var(--ink-primary)]" dir="ltr">
                  chido_blender_bridge.py
                </span>{' '}
                آماده شد:
              </p>
              <div
                className="p-3 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-hairline)] font-mono-tabular text-xs break-all text-[var(--ink-primary)]"
                dir="ltr"
              >
                {blenderDialog.manifestPath}
              </div>
              <div
                className="p-3 rounded-lg bg-slate-950 text-emerald-300 font-mono-tabular text-xs break-all"
                dir="ltr"
              >
                {blenderDialog.launchCommand}
              </div>
              <p className="text-xs text-[var(--ink-muted)]">
                {blenderDialog.spawnedHostBlender
                  ? 'نرم‌افزار Blender روی سیستم عامل با موفقیت فراخوانی شد.'
                  : 'در محیط سرور لینوکس مانیفست ذخیره شد؛ می‌توانید خروجی ریویژن بعدی را ثبت کنید.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (activeProject) {
                    const res = await studioApi.exportBlenderRevision(activeProject.id);
                    handleStateUpdate(res.state);
                    notify('خروجی Blender به‌عنوان ریویژن جدید ثبت شد');
                  }
                  setBlenderDialog(null);
                }}
                className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold"
              >
                ثبت خروجی آزمایشی Blender
              </button>
              <button
                type="button"
                onClick={() => setBlenderDialog(null)}
                className="h-10 px-4 rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] text-sm font-medium text-[var(--ink-primary)]"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
