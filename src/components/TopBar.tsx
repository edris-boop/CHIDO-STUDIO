import { useEffect, useRef, useState } from 'react';
import { Box, Palette, PanelLeft, Settings } from 'lucide-react';
import type { Company, Product, StudioNavSection, StudioState, StudioTheme } from '../core/types';

interface TopBarProps {
  state: StudioState;
  activeCompany: Company | null;
  activeProject: Product | null;
  activeSection: StudioNavSection;
  pipelineAttentionCount: number;
  theme: StudioTheme;
  onThemeChange: (theme: StudioTheme) => void;
  onSelectSection: (section: StudioNavSection) => void;
  onSelectProject: (projectId: string | null) => void;
  onLaunchBlender: () => void;
  isInspectorOpen: boolean;
  onToggleInspector: () => void;
}

const PRIMARY_TABS: Array<{ id: StudioNavSection; label: string }> = [
  { id: 'studio', label: 'استودیو کار' },
  { id: 'pipeline', label: 'خط تولید' },
  { id: 'library', label: 'کتابخانه و دیسک' },
  { id: 'accounting', label: 'مالی' },
];

const THEME_OPTIONS: Array<{ id: StudioTheme; label: string; swatch: string }> = [
  { id: 'light', label: 'روشن استودیویی', swatch: '#eef2f7' },
  { id: 'pastel', label: 'پاستلی شیک', swatch: '#dfd5ee' },
  { id: 'charcoal', label: 'زغال‌سنگی (نیمه‌دارک)', swatch: '#232730' },
];

export function TopBar({
  state,
  activeCompany,
  activeProject,
  activeSection,
  pipelineAttentionCount,
  theme,
  onThemeChange,
  onSelectSection,
  onSelectProject,
  onLaunchBlender,
  isInspectorOpen,
  onToggleInspector,
}: TopBarProps) {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, [themeMenuOpen]);

  return (
    <header className="h-16 shrink-0 bg-[var(--surface-card)] border-b border-[var(--border-hairline)] px-6 flex items-center justify-between gap-6">
      {/* Zone 1: Brand + Locked Project Selector */}
      <div className="flex items-center gap-4 min-w-0">
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection('studio');
          }}
          className="font-display text-lg font-bold tracking-tight text-[var(--ink-primary)] whitespace-nowrap shrink-0"
        >
          CHIDO Studio
        </a>

        <span className="h-5 w-px bg-[var(--border-hairline)] shrink-0" aria-hidden="true" />

        <div className="flex items-center gap-2.5 min-w-0">
          <label htmlFor="top-project-select" className="sr-only">
            پروژه فعال
          </label>
          <select
            id="top-project-select"
            data-testid="active-project-select"
            value={state.activeProjectId ?? ''}
            onChange={(e) => onSelectProject(e.target.value || null)}
            className="h-10 max-w-[300px] rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:border-[var(--border-strong)] px-3 text-sm font-semibold text-[var(--ink-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">بدون پروژه (_Inbox)</option>
            {state.companies.map((comp) => {
              const items = state.products.filter((p) => p.companyId === comp.id);
              if (items.length === 0) return null;
              return (
                <optgroup key={comp.id} label={`${comp.code} · ${comp.name}`}>
                  {items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>

          {activeProject && activeCompany && (
            <span className="hidden 2xl:inline text-sm text-[var(--ink-muted)] whitespace-nowrap truncate max-w-[180px]">
              {activeCompany.name}
            </span>
          )}
        </div>
      </div>

      {/* Zone 2: 4 Clean Navigation Tabs */}
      <nav aria-label="ناوبری اصلی استودیو" className="flex items-center gap-2 h-full">
        {PRIMARY_TABS.map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectSection(tab.id)}
              className={`relative h-full px-4 text-sm font-semibold whitespace-nowrap shrink-0 flex items-center gap-2 transition-colors ${
                isActive
                  ? 'text-[var(--accent-ink)]'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <span>{tab.label}</span>
              {tab.id === 'pipeline' && pipelineAttentionCount > 0 && (
                <span className="font-mono-tabular text-xs text-[var(--ink-muted)]">
                  ({pipelineAttentionCount})
                </span>
              )}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 inset-x-2 h-[3px] bg-[var(--accent-primary)] rounded-t-full"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Drawer Toggle, Theme Picker, Settings & Primary Blender Action */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleInspector}
          aria-label="جزئیات پروژه فعال"
          aria-expanded={isInspectorOpen}
          className={`h-10 px-3 rounded-lg border text-sm font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
            isInspectorOpen
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <PanelLeft className="w-4 h-4" />
          <span className="hidden sm:inline">جزئیات</span>
        </button>

        {/* 3-Theme Switcher Popover */}
        <div className="relative" ref={themeMenuRef}>
          <button
            type="button"
            onClick={() => setThemeMenuOpen((v) => !v)}
            aria-label="تغییر تم رنگ محیط"
            aria-expanded={themeMenuOpen}
            className={`h-10 px-3 rounded-lg border text-sm font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              themeMenuOpen
                ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span className="hidden lg:inline">
              {theme === 'charcoal' ? 'زغال‌سنگی' : theme === 'pastel' ? 'پاستلی' : 'روشن'}
            </span>
          </button>

          {themeMenuOpen && (
            <div
              role="menu"
              aria-label="انتخاب تم رنگی"
              className="absolute left-0 top-12 z-50 w-56 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] shadow-xl p-1.5 space-y-1"
            >
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === opt.id}
                  onClick={() => {
                    onThemeChange(opt.id);
                    setThemeMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between gap-2 transition-colors ${
                    theme === opt.id
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)] font-semibold'
                      : 'text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className="w-5 h-5 rounded-full border border-[var(--border-strong)] shrink-0"
                    style={{ backgroundColor: opt.swatch }}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSelectSection('system')}
          aria-label="تنظیمات و گزارش‌ها"
          className={`h-10 w-10 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
            activeSection === 'system'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-[var(--ink-secondary)]'
          }`}
        >
          <Settings className="w-4.5 h-4.5" />
        </button>

        <button
          type="button"
          onClick={onLaunchBlender}
          disabled={!activeProject}
          className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] disabled:opacity-45 text-white text-sm font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
        >
          <Box className="w-4 h-4" />
          <span>Open in Blender</span>
        </button>
      </div>
    </header>
  );
}
