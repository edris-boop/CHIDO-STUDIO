import { useState } from 'react';
import { CheckCircle2, Palette, Save } from 'lucide-react';
import { studioApi, type DiskStats } from '../api/client';
import { formatBytes } from '../core/studioLogic';
import type { StudioState, StudioTheme } from '../core/types';

interface SystemHubViewProps {
  state: StudioState;
  diskStats: DiskStats;
  theme: StudioTheme;
  onThemeChange: (theme: StudioTheme) => void;
  onStateChange: (state: StudioState) => void;
  onNotify: (msg: string) => void;
}

type SystemTab = 'settings' | 'transfers' | 'architecture';

const ARCH_COMPARISON = [
  {
    criterion: 'اجرای واقعی Tripo، ChatGPT و Google بدون محدودیت iframe',
    electron: 'کامل (WebContentsView + Persistent Session)',
    webview2: 'کامل (Edge WebView2، فقط ویندوز)',
    webOnly: 'محدود (مسدود شدن با X-Frame-Options / CSP)',
  },
  {
    criterion: 'رهگیری دانلود (will-download) و قفل روی پروژه فعال',
    electron: 'بومی و قطعی در Main Process',
    webview2: 'نیازمند C#/.NET Host Bridge',
    webOnly: 'غیرممکن برای دامنه‌های ثالث بدون Extension',
  },
  {
    criterion: 'تزریق خودکار اسکریپت (Tripo/ChatGPT) و کلید F12 DevTools',
    electron: 'بومی (executeJavaScript + toggleDevTools)',
    webview2: 'موجود (ExecuteScriptAsync)',
    webOnly: 'غیرممکن روی تب‌های دیگر',
  },
  {
    criterion: 'مدیریت فایل واقعی هارد، تبدیل PNG->JPG و اجرای Blender CLI',
    electron: 'دسترسی مستقیم Node.js + Local Express API',
    webview2: 'نیازمند .NET Backend یا Sidecar',
    webOnly: 'نیازمند Local Agent جداگانه',
  },
];

const THEME_CARDS: Array<{ id: StudioTheme; title: string; subtitle: string; bg: string; card: string; accent: string }> = [
  {
    id: 'light',
    title: 'روشن استودیویی',
    subtitle: 'پس‌زمینه خنثی و کارت‌های خوانا برای نور روز',
    bg: '#eef2f7',
    card: '#ffffff',
    accent: '#2563eb',
  },
  {
    id: 'pastel',
    title: 'پاستلی شیک',
    subtitle: 'تناژ یاسی و مه‌آلود نرم با کنتراست ملایم',
    bg: '#f2edf7',
    card: '#fdfcff',
    accent: '#6351d4',
  },
  {
    id: 'charcoal',
    title: 'زغال‌سنگی (نیمه‌دارک)',
    subtitle: 'گرافیت گرم و کم‌خستگی برای کار طولانی با Blender و 3D',
    bg: '#1a1d24',
    card: '#232730',
    accent: '#3b82f6',
  },
];

export function SystemHubView({
  state,
  diskStats,
  theme,
  onThemeChange,
  onStateChange,
  onNotify,
}: SystemHubViewProps) {
  const [tab, setTab] = useState<SystemTab>('settings');
  const [settingsDraft, setSettingsDraft] = useState(state.settings);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="text-2xl font-bold text-[var(--ink-primary)]">تنظیمات و گزارش‌های سیستم</h1>
          <div className="flex items-center gap-1 p-1 bg-[var(--surface-subtle)] border border-[var(--border-hairline)] rounded-xl">
            {(
              [
                ['settings', 'تم و تنظیمات مسیر'],
                ['transfers', `انتقال‌ها و لاگ (${state.transfers.length})`],
                ['architecture', 'معماری و اجرای بومی'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                  tab === id
                    ? 'bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-sm'
                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-sm text-[var(--ink-muted)] font-mono-tabular" dir="ltr">
          {formatBytes(diskStats.totalBytes)} · {diskStats.fileCount} files
        </div>
      </div>

      {tab === 'settings' && (
        <div className="space-y-5">
          {/* Theme Picker Section */}
          <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-base font-bold text-[var(--ink-primary)]">
              <Palette className="w-5 h-5 text-[var(--accent-ink)]" />
              <span>تم رنگی محیط کاری</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {THEME_CARDS.map((card) => {
                const active = theme === card.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => onThemeChange(card.id)}
                    className={`p-4 rounded-xl border text-right transition-all space-y-2.5 ${
                      active
                        ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]/25 bg-[var(--accent-soft)]/30'
                        : 'border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-[var(--ink-primary)]">{card.title}</span>
                      <div className="flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full border border-slate-400/40" style={{ backgroundColor: card.bg }} />
                        <span className="w-4 h-4 rounded-full border border-slate-400/40" style={{ backgroundColor: card.card }} />
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: card.accent }} />
                      </div>
                    </div>
                    <p className="text-sm text-[var(--ink-secondary)]">{card.subtitle}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await studioApi.updateSettings(settingsDraft);
              onStateChange(res.state);
              onNotify('تنظیمات استودیو ذخیره شد');
            }}
            className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4 text-sm"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="set-root" className="block font-medium text-[var(--ink-secondary)] mb-1.5">
                  مسیر ذخیره فایل‌های محلی (Storage Root)
                </label>
                <input
                  id="set-root"
                  type="text"
                  dir="ltr"
                  value={settingsDraft.storageRootPath}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, storageRootPath: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="set-blender" className="block font-medium text-[var(--ink-secondary)] mb-1.5">
                  مسیر اجرایی Blender
                </label>
                <input
                  id="set-blender"
                  type="text"
                  dir="ltr"
                  value={settingsDraft.blenderExecutablePath}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, blenderExecutablePath: e.target.value })
                  }
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="set-quality" className="block font-medium text-[var(--ink-secondary)] mb-1.5">
                  کیفیت پیش‌فرض JPG (پیش‌فرض ۹۲)
                </label>
                <input
                  id="set-quality"
                  type="number"
                  min={40}
                  max={100}
                  dir="ltr"
                  value={settingsDraft.defaultJpgQuality}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, defaultJpgQuality: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono-tabular"
                />
              </div>
              <div>
                <label htmlFor="set-maxkb" className="block font-medium text-[var(--ink-secondary)] mb-1.5">
                  سقف حجم تصویر خروجی (KB)
                </label>
                <input
                  id="set-maxkb"
                  type="number"
                  dir="ltr"
                  value={settingsDraft.defaultMaxSizeKb ?? ''}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      defaultMaxSizeKb: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono-tabular"
                />
              </div>
            </div>

            <button
              type="submit"
              className="h-10 px-5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white font-semibold flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>ذخیره تنظیمات</span>
            </button>
          </form>
        </div>
      )}

      {tab === 'transfers' && (
        <div className="space-y-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[var(--ink-muted)]">
                  <th className="py-3 px-4 font-semibold">نوع</th>
                  <th className="py-3 px-4 font-semibold">مبدا</th>
                  <th className="py-3 px-4 font-semibold">فایل</th>
                  <th className="py-3 px-4 font-semibold">پروژه قفل‌شده</th>
                  <th className="py-3 px-4 font-semibold">حجم</th>
                  <th className="py-3 px-4 font-semibold">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {state.transfers.map((tr) => (
                  <tr key={tr.id}>
                    <td className="py-3 px-4 text-[var(--ink-secondary)]">{tr.direction === 'download' ? 'دانلود' : 'آپلود'}</td>
                    <td className="py-3 px-4 text-[var(--ink-secondary)]">{tr.sourceLabel}</td>
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-[var(--ink-primary)]" dir="ltr">
                      {tr.fileName}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-[var(--accent-ink)]">{tr.lockedProductCode}</td>
                    <td className="py-3 px-4 font-mono-tabular text-[var(--ink-muted)]" dir="ltr">
                      {formatBytes(tr.sizeBytes)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 text-[var(--tone-emerald-ink)] font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{tr.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-5 divide-y divide-[var(--border-hairline)] text-sm">
            {state.logs.slice(0, 14).map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <span className="font-semibold text-[var(--ink-primary)]">{log.actor}</span>
                  <span className="text-[var(--ink-muted)] mx-2">·</span>
                  <span className="text-[var(--ink-secondary)]">{log.message}</span>
                </div>
                <span className="text-xs font-mono-tabular text-[var(--ink-muted)] shrink-0" dir="ltr">
                  {new Date(log.createdAt).toLocaleString('en-GB')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'architecture' && (
        <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-6 space-y-4 text-sm">
          <p className="text-[var(--ink-secondary)] leading-relaxed">
            <strong>معماری اجرایی واقعی:</strong>{' '}
            <span className="font-mono-tabular font-semibold text-[var(--ink-primary)]" dir="ltr">
              Electron Desktop Shell (WebContentsView) + Local Node/Express Agent + Blender Python Addon
            </span>
            . فایل‌های{' '}
            <span className="font-mono-tabular text-[var(--ink-primary)]" dir="ltr">
              desktop-electron/main.js
            </span>{' '}
            و{' '}
            <span className="font-mono-tabular text-[var(--ink-primary)]" dir="ltr">
              blender-addon/chido_blender_bridge.py
            </span>{' '}
            برای اجرای واقعی روی ویندوز آماده‌اند و به همین سرور محلی متصل می‌شوند.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-t border-[var(--border-hairline)]">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[var(--ink-muted)]">
                  <th className="py-2.5 font-semibold">معیار فنی</th>
                  <th className="py-2.5 font-semibold text-[var(--accent-ink)]">Electron + Local Agent</th>
                  <th className="py-2.5 font-semibold">WebView2 (.NET)</th>
                  <th className="py-2.5 font-semibold">وب‌اپ خالص</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {ARCH_COMPARISON.map((row) => (
                  <tr key={row.criterion}>
                    <td className="py-3 font-medium text-[var(--ink-primary)]">{row.criterion}</td>
                    <td className="py-3 text-[var(--ink-primary)] font-medium">{row.electron}</td>
                    <td className="py-3 text-[var(--ink-secondary)]">{row.webview2}</td>
                    <td className="py-3 text-[var(--ink-muted)]">{row.webOnly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
