import { useEffect } from 'react';
import { UploadCloud, X } from 'lucide-react';
import type { Company, Product, ProductAssetFile } from '../core/types';
import type { ContextMenuItem } from './StudioContextMenu';

interface ActiveProjectDrawerProps {
  open: boolean;
  product: Product | null;
  company: Company | null;
  onClose: () => void;
  onUploadLatestToCloud: (revisionId: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, title: string, items: ContextMenuItem[]) => void;
  onConvertAssetPng: (diskRelativePath: string) => void;
}

const STATUS_LABELS: Record<Product['modelingStatus'], string> = {
  queued: 'در صف مدلسازی',
  ai_image_prep: 'آماده‌سازی تصویر AI',
  tripo_draft: 'خروجی اولیه Tripo',
  blender_refine: 'اصلاح در Blender',
  pending_approval: 'در انتظار تأیید آنلاین',
  published: 'منتشرشده در کتابخانه',
};

export function ActiveProjectDrawer({
  open,
  product,
  company,
  onClose,
  onUploadLatestToCloud,
  onOpenContextMenu,
  onConvertAssetPng,
}: ActiveProjectDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const latestRevision = product?.revisions[product.revisions.length - 1];
  const refImages =
    product?.files.filter((f) => f.subfolder === 'References' || f.subfolder === 'AI Images') ?? [];

  const handleThumbContextMenu = (e: React.MouseEvent, file: ProductAssetFile) => {
    const items: ContextMenuItem[] = [];
    if (file.fileName.toLowerCase().endsWith('.png')) {
      items.push({
        id: 'convert-jpg',
        label: 'تبدیل PNG به JPG (پروژه فعال)',
        hint: 'JPG',
        onSelect: () => onConvertAssetPng(file.diskRelativePath),
      });
    }
    items.push({
      id: 'copy-path',
      label: 'کپی نام فایل',
      hint: file.subfolder,
      onSelect: () => {
        navigator.clipboard?.writeText(file.fileName).catch(() => {});
      },
    });
    onOpenContextMenu(e, file.fileName, items);
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="جزئیات پروژه فعال">
      <div
        className="fixed inset-0 bg-slate-950/35"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        data-testid="active-project-panel"
        className="relative z-50 w-96 max-w-[92vw] bg-[var(--surface-card)] border-r border-[var(--border-hairline)] shadow-2xl h-full flex flex-col overflow-y-auto mr-auto"
      >
        <div className="p-5 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs text-[var(--ink-muted)]">پروژه فعال قفل‌شده</div>
            <h2 className="text-base font-bold text-[var(--ink-primary)] truncate">
              {product ? `${product.code} · ${product.name}` : 'بدون پروژه (_Inbox)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن جزئیات پروژه"
            className="p-2 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--ink-muted)] shrink-0"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {!product ? (
          <div className="p-5">
            <div className="p-4 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] text-sm text-[var(--ink-secondary)] leading-relaxed">
              پروژه‌ای قفل نشده است؛ دانلودها و فایل‌های جدید در{' '}
              <span className="font-mono-tabular font-semibold" dir="ltr">
                _Inbox/
              </span>{' '}
              نگهداری می‌شوند.
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="aspect-[4/3] w-full rounded-xl overflow-hidden bg-[var(--surface-subtle)] border border-[var(--border-hairline)]">
              <img
                src={product.coverImageUrl}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--ink-muted)]">شرکت مالک</dt>
                <dd className="font-semibold text-[var(--ink-primary)]">
                  {company?.code} · {company?.name}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--ink-muted)]">دسته / ست</dt>
                <dd className="text-[var(--ink-secondary)]">
                  {product.categoryFolder} / {product.setFolder}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--ink-muted)]">وضعیت</dt>
                <dd className="font-semibold text-[var(--accent-ink)]">{STATUS_LABELS[product.modelingStatus]}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--ink-muted)]">آخرین Tripo</dt>
                <dd className="font-mono-tabular text-xs text-[var(--ink-secondary)] truncate max-w-[190px]" dir="ltr">
                  {product.lastTripoFile || '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--ink-muted)]">آخرین Blender</dt>
                <dd className="font-mono-tabular text-xs text-[var(--ink-secondary)] truncate max-w-[190px]" dir="ltr">
                  {product.lastBlenderFile || '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[var(--ink-muted)]">نسخه آنلاین</dt>
                <dd className="font-mono-tabular font-semibold text-[var(--tone-emerald-ink)]">
                  {product.activeOnlineRevision || 'منتشر نشده'}
                </dd>
              </div>
            </dl>

            <div className="pt-3 border-t border-[var(--border-hairline)] space-y-1.5">
              <div className="text-xs font-medium text-[var(--ink-muted)]">مسیر واقعی هارد</div>
              <div
                className="text-xs font-mono-tabular bg-[var(--surface-subtle)] border border-[var(--border-hairline)] rounded-lg p-2.5 text-[var(--ink-secondary)] break-all"
                dir="ltr"
              >
                {product.localFolderRelativePath}
              </div>
            </div>

            {refImages.length > 0 && (
              <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--ink-secondary)]">
                    تصاویر مرجع و AI ({refImages.length})
                  </span>
                  <span className="text-xs text-[var(--ink-muted)]">راست‌کلیک / Drag</span>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {refImages.slice(0, 6).map((file) => (
                    <div
                      key={file.id}
                      draggable
                      onContextMenu={(e) => handleThumbContextMenu(e, file)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          'application/x-chido-asset',
                          JSON.stringify({
                            fileName: file.fileName,
                            diskRelativePath: file.diskRelativePath,
                            productId: product.id,
                          })
                        );
                      }}
                      title={`${file.fileName} — راست‌کلیک یا بکشید به مرورگر`}
                      className="aspect-square rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] overflow-hidden cursor-grab active:cursor-grabbing"
                    >
                      <img
                        src={`/api/assets/file?path=${encodeURIComponent(file.diskRelativePath)}`}
                        alt={file.fileName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {latestRevision && latestRevision.status !== 'published' && (
              <div className="pt-3 border-t border-[var(--border-hairline)]">
                <button
                  type="button"
                  onClick={() => {
                    onUploadLatestToCloud(latestRevision.id);
                    onClose();
                  }}
                  className="w-full h-10 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-[var(--ink-primary)] text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <UploadCloud className="w-4 h-4 text-[var(--accent-ink)]" />
                  <span>ارسال {latestRevision.version} به مخزن چیدو</span>
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
