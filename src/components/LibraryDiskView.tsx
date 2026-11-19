import { useEffect, useState } from 'react';
import {
  Box,
  Building2,
  Cuboid,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Plus,
  Search,
  Tag,
  X,
} from 'lucide-react';
import { studioApi, type DiskNode } from '../api/client';
import { canCompanyAccessProduct } from '../core/studioLogic';
import type { Product, StudioState } from '../core/types';
import type { ContextMenuItem } from './StudioContextMenu';

interface LibraryDiskViewProps {
  state: StudioState;
  onStateChange: (state: StudioState) => void;
  onOpenInStudio: (projectId: string, subMode: 'preview3d' | 'files') => void;
  onLaunchBlender: (projectId: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, title: string, items: ContextMenuItem[]) => void;
  onNotify: (msg: string) => void;
}

type LibraryMode = 'catalog' | 'disk' | 'companies';

export function LibraryDiskView({
  state,
  onStateChange,
  onOpenInStudio,
  onLaunchBlender,
  onOpenContextMenu,
  onNotify,
}: LibraryDiskViewProps) {
  const [mode, setMode] = useState<LibraryMode>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewerCompanyId, setViewerCompanyId] = useState(
    state.activeCompanyId || state.companies[0]?.id || ''
  );
  const [editingTagProdId, setEditingTagProdId] = useState<string | null>(null);
  const [tagsDraft, setTagsDraft] = useState('');

  // Disk tree state
  const [tree, setTree] = useState<DiskNode[]>([]);
  const [rootPath, setRootPath] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // Modals
  const [modal, setModal] = useState<'none' | 'product' | 'company' | 'set'>('none');

  // New Product form
  const [prodCompanyId, setProdCompanyId] = useState(state.activeCompanyId || state.companies[0]?.id || '');
  const [prodCode, setProdCode] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('Living Room');
  const [prodSet, setProdSet] = useState('Aria Set');

  // New Company form
  const [compName, setCompName] = useState('');
  const [compCode, setCompCode] = useState('');
  const [compContact, setCompContact] = useState('');
  const [compEmail, setCompEmail] = useState('');

  // New Set form
  const [setName, setSetName] = useState('');
  const [setProductIds, setSetProductIds] = useState<string[]>([]);

  const loadTree = async () => {
    const res = await studioApi.getDiskTree();
    setTree(res.tree);
    setRootPath(res.rootPath);
  };

  useEffect(() => {
    if (mode === 'disk') {
      loadTree();
    }
  }, [mode, state.products.length]);

  const visibleCatalog = state.products.filter((p) => {
    if (!canCompanyAccessProduct(viewerCompanyId, p.companyId)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)) ||
      p.setFolder.toLowerCase().includes(q)
    );
  });

  const handleProductContextMenu = (e: React.MouseEvent, prod: Product) => {
    onOpenContextMenu(e, `${prod.code} · ${prod.name}`, [
      {
        id: 'open-3d',
        label: 'پیشنمایش سه‌بعدی در استودیو',
        icon: <Cuboid className="w-4 h-4 text-[var(--accent-ink)]" />,
        onSelect: () => onOpenInStudio(prod.id, 'preview3d'),
      },
      {
        id: 'open-files',
        label: 'مشاهده فایل‌های پروژه',
        icon: <FolderOpen className="w-4 h-4 text-[var(--tone-amber-ink)]" />,
        onSelect: () => onOpenInStudio(prod.id, 'files'),
      },
      {
        id: 'open-blender',
        label: 'اجرا در Blender',
        icon: <Box className="w-4 h-4 text-[var(--tone-violet-ink)]" />,
        onSelect: () => onLaunchBlender(prod.id),
      },
      {
        id: 'edit-tags',
        label: 'ویرایش تگ‌ها و متادیتا',
        dividerAbove: true,
        icon: <Tag className="w-4 h-4 text-[var(--ink-muted)]" />,
        onSelect: () => {
          setEditingTagProdId(prod.id);
          setTagsDraft(prod.tags.join('، '));
        },
      },
    ]);
  };

  const renderTree = (nodes: DiskNode[], depth = 0) =>
    nodes.map((node) => {
      if (node.type === 'file') return null;
      const isSelected = selectedFolder === node.relativePath;
      return (
        <div key={node.relativePath}>
          <button
            type="button"
            onClick={() => setSelectedFolder(node.relativePath)}
            style={{ paddingRight: `${depth * 14 + 8}px` }}
            className={`w-full py-2 px-2.5 rounded-lg text-right text-sm flex items-center gap-2 transition-colors ${
              isSelected
                ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)] font-semibold'
                : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <Folder className="w-4 h-4 shrink-0 text-[var(--tone-amber-ink)]" />
            <span className="truncate font-mono-tabular text-xs" dir="ltr">
              {node.name}
            </span>
          </button>
          {node.children && node.children.length > 0 && renderTree(node.children, depth + 1)}
        </div>
      );
    });

  const findSelectedFolderFiles = (nodes: DiskNode[], targetRel: string): DiskNode[] => {
    for (const n of nodes) {
      if (n.relativePath === targetRel) return n.children ?? [];
      if (n.children) {
        const found = findSelectedFolderFiles(n.children, targetRel);
        if (found.length > 0) return found;
      }
    }
    return [];
  };

  const folderChildren = selectedFolder ? findSelectedFolderFiles(tree, selectedFolder) : tree;

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-6 space-y-5">
      {/* Header + Segmented Switcher + Search + Contextual Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3.5">
          <h1 className="text-2xl font-bold text-[var(--ink-primary)]">کتابخانه و فایل‌های دیسک</h1>

          <div className="flex items-center gap-1 p-1 bg-[var(--surface-subtle)] border border-[var(--border-hairline)] rounded-xl">
            {(
              [
                ['catalog', 'کاتالوگ و ست‌ها'],
                ['disk', 'پوشه‌های هارد'],
                ['companies', 'شرکت‌ها'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                  mode === id
                    ? 'bg-[var(--surface-card)] text-[var(--ink-primary)] shadow-sm'
                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'catalog' && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-[var(--ink-muted)] absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو کد یا تگ..."
                  className="h-10 pr-9 pl-3 w-52 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] text-sm text-[var(--ink-primary)]"
                />
              </div>
              <select
                aria-label="فیلتر شرکت کتابخانه"
                value={viewerCompanyId}
                onChange={(e) => setViewerCompanyId(e.target.value)}
                className="h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] text-sm font-medium text-[var(--ink-primary)]"
              >
                {state.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setModal('set')}
                className="h-10 px-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] text-sm font-medium text-[var(--ink-primary)] flex items-center gap-1.5"
              >
                <Layers className="w-4 h-4" />
                <span>ست جدید</span>
              </button>
              <button
                type="button"
                onClick={() => setModal('product')}
                className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-4.5 h-4.5" />
                <span>محصول جدید</span>
              </button>
            </>
          )}

          {mode === 'companies' && (
            <button
              type="button"
              onClick={() => setModal('company')}
              className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>شرکت جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* MODE 1: Clean Product Catalog + Sets */}
      {mode === 'catalog' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleCatalog.map((prod) => (
              <div
                key={prod.id}
                onContextMenu={(e) => handleProductContextMenu(e, prod)}
                className="bg-[var(--surface-card)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] rounded-xl overflow-hidden flex flex-col justify-between transition-colors"
              >
                <div>
                  <div className="aspect-[4/3] bg-[var(--surface-subtle)] overflow-hidden">
                    <img
                      src={prod.coverImageUrl}
                      alt={prod.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-5 space-y-2">
                    <div className="text-sm text-[var(--ink-muted)]">
                      <span className="font-mono-tabular font-semibold text-[var(--accent-ink)]">
                        {prod.code}
                      </span>
                      <span className="mx-1.5">·</span>
                      <span>{prod.setFolder}</span>
                    </div>
                    <h2 className="text-base font-bold text-[var(--ink-primary)]">{prod.name}</h2>
                    <div className="text-sm text-[var(--ink-muted)]">{prod.tags.join(' · ')}</div>

                    {editingTagProdId === prod.id && (
                      <div className="pt-2 flex gap-2">
                        <input
                          type="text"
                          value={tagsDraft}
                          onChange={(e) => setTagsDraft(e.target.value)}
                          placeholder="پذیرایی، مدرن"
                          className="flex-1 min-w-0 h-9 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-sm text-[var(--ink-primary)]"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const tags = tagsDraft
                              .split('،')
                              .join(',')
                              .split(',')
                              .map((t) => t.trim())
                              .filter(Boolean);
                            const res = await studioApi.updateProductTags(prod.id, { tags });
                            setEditingTagProdId(null);
                            onStateChange(res.state);
                            onNotify('تگ‌ها ذخیره شدند');
                          }}
                          className="px-3 h-9 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-medium"
                        >
                          ذخیره
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTagProdId(editingTagProdId === prod.id ? null : prod.id);
                      setTagsDraft(prod.tags.join('، '));
                    }}
                    className="text-sm text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] flex items-center gap-1.5"
                  >
                    <Tag className="w-4 h-4" />
                    <span>تگ‌ها</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenInStudio(prod.id, 'preview3d')}
                    className="px-3.5 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold"
                  >
                    باز کردن در استودیو
                  </button>
                </div>
              </div>
            ))}
          </div>

          {state.sets.length > 0 && (
            <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-4 flex flex-wrap items-center gap-4 text-sm">
              <span className="font-bold text-[var(--ink-primary)] flex items-center gap-2">
                <Layers className="w-4.5 h-4.5 text-[var(--accent-ink)]" />
                <span>ست‌های ترکیبی:</span>
              </span>
              {state.sets.map((s) => (
                <span key={s.id} className="text-[var(--ink-secondary)]">
                  <strong className="text-[var(--ink-primary)]">{s.name}</strong> (
                  {s.productIds
                    .map((pid) => state.products.find((p) => p.id === pid)?.code)
                    .filter(Boolean)
                    .join(' · ')}
                  )
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODE 2: Real Disk Tree Explorer */}
      {mode === 'disk' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--ink-primary)] font-mono-tabular" dir="ltr">
                {rootPath || './chido-assets'}
              </span>
              <button
                type="button"
                onClick={() => setSelectedFolder('')}
                className="text-xs text-[var(--accent-ink)] hover:underline font-medium"
              >
                ریشه
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto border border-[var(--border-hairline)] rounded-lg p-2 bg-[var(--surface-subtle)]">
              {renderTree(tree)}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newFolderName.trim()) return;
                await studioApi.createFolder(selectedFolder, newFolderName.trim());
                setNewFolderName('');
                await loadTree();
                onNotify('پوشه جدید روی دیسک ساخته شد');
              }}
              className="pt-2 border-t border-[var(--border-hairline)] flex gap-2"
            >
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="نام پوشه جدید..."
                className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-sm text-[var(--ink-primary)]"
              />
              <button
                type="submit"
                className="h-9 px-3.5 shrink-0 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-medium flex items-center gap-1.5"
              >
                <FolderPlus className="w-4 h-4" />
                <span>ساخت</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-8 bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-5 space-y-3">
            <div className="text-sm font-semibold text-[var(--ink-secondary)] font-mono-tabular" dir="ltr">
              /{selectedFolder || 'chido-assets'}
            </div>
            <div className="divide-y divide-[var(--border-hairline)] text-sm">
              {folderChildren.length === 0 ? (
                <div className="py-10 text-center text-[var(--ink-muted)]">این پوشه خالی است</div>
              ) : (
                folderChildren.map((item) => (
                  <div key={item.relativePath} className="py-2.5 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={item.type !== 'dir'}
                      onClick={() => item.type === 'dir' && setSelectedFolder(item.relativePath)}
                      className="flex items-center gap-2.5 text-[var(--ink-primary)] hover:text-[var(--accent-ink)] disabled:hover:text-[var(--ink-primary)] min-w-0"
                    >
                      <Folder
                        className={`w-4.5 h-4.5 shrink-0 ${
                          item.type === 'dir' ? 'text-[var(--tone-amber-ink)]' : 'text-[var(--ink-muted)]'
                        }`}
                      />
                      <span className="font-mono-tabular truncate" dir="ltr">
                        {item.name}
                      </span>
                    </button>
                    <span className="text-xs font-mono-tabular text-[var(--ink-muted)] shrink-0">
                      {item.type === 'dir' ? 'Folder' : 'File'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODE 3: Isolated Companies */}
      {mode === 'companies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.companies.map((comp) => {
            const count = state.products.filter((p) => p.companyId === comp.id).length;
            return (
              <div
                key={comp.id}
                className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-base font-bold text-[var(--ink-primary)] flex items-center gap-2">
                    <Building2 className="w-4.5 h-4.5 text-[var(--accent-ink)]" />
                    <span>{comp.name}</span>
                    <span className="font-mono-tabular text-sm text-[var(--ink-muted)]">({comp.code})</span>
                  </div>
                  <span
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{
                      backgroundColor: 'var(--tone-emerald-bg)',
                      color: 'var(--tone-emerald-ink)',
                    }}
                  >
                    {comp.subscriptionPlan}
                  </span>
                </div>
                <div className="text-sm text-[var(--ink-muted)] font-mono-tabular" dir="ltr">
                  {comp.englishFolder}/
                </div>
                <div className="pt-2.5 border-t border-[var(--border-hairline)] flex items-center justify-between text-sm text-[var(--ink-secondary)]">
                  <span>{comp.contactName} · {comp.adminEmail}</span>
                  <span className="font-mono-tabular font-semibold text-[var(--ink-primary)]">{count} محصول</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clean Modal Dialogs for Creation Forms */}
      {modal === 'product' && (
        <div role="dialog" aria-modal="true" aria-label="ثبت محصول جدید" className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!prodCode.trim() || !prodName.trim()) return;
              const res = await studioApi.createProduct({
                companyId: prodCompanyId,
                code: prodCode,
                name: prodName,
                categoryFolder: prodCategory,
                setFolder: prodSet,
              });
              setProdCode('');
              setProdName('');
              setModal('none');
              onStateChange(res.state);
              onNotify(`محصول ${prodCode.toUpperCase()} ساخته شد`);
            }}
            className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl max-w-md w-full p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--ink-primary)]">ثبت محصول جدید</h2>
              <button type="button" onClick={() => setModal('none')} aria-label="بستن" className="p-1 text-[var(--ink-muted)]">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="space-y-3">
              <select
                aria-label="شرکت محصول"
                value={prodCompanyId}
                onChange={(e) => setProdCompanyId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
              >
                {state.companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </select>
              <input
                type="text"
                required
                dir="ltr"
                value={prodCode}
                onChange={(e) => setProdCode(e.target.value)}
                placeholder="کد محصول (DAN-0044)"
                className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono-tabular uppercase"
              />
              <input
                type="text"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="نام محصول"
                className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  dir="ltr"
                  value={prodCategory}
                  onChange={(e) => setProdCategory(e.target.value)}
                  placeholder="Living Room"
                  className="h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={prodSet}
                  onChange={(e) => setProdSet(e.target.value)}
                  placeholder="Aria Set"
                  className="h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModal('none')} className="h-10 px-4 rounded-lg border border-[var(--border-hairline)] text-[var(--ink-secondary)]">انصراف</button>
              <button type="submit" className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] text-white font-semibold">ثبت محصول</button>
            </div>
          </form>
        </div>
      )}

      {modal === 'company' && (
        <div role="dialog" aria-modal="true" aria-label="ایجاد شرکت جدید" className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!compName.trim() || !compCode.trim()) return;
              const res = await studioApi.createCompany({
                name: compName,
                code: compCode,
                contactName: compContact,
                contactEmail: compEmail,
                adminEmail: compEmail,
              });
              setCompName('');
              setCompCode('');
              setCompContact('');
              setCompEmail('');
              setModal('none');
              onStateChange(res.state);
              onNotify('شرکت جدید ایجاد شد');
            }}
            className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl max-w-md w-full p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--ink-primary)]">ایجاد شرکت و کتابخانه مجزا</h2>
              <button type="button" onClick={() => setModal('none')} aria-label="بستن" className="p-1 text-[var(--ink-muted)]">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="space-y-3">
              <input type="text" required value={compName} onChange={(e) => setCompName(e.target.value)} placeholder="نام شرکت" className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]" />
              <input type="text" required dir="ltr" value={compCode} onChange={(e) => setCompCode(e.target.value)} placeholder="کد اختصاری (ARM)" className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono-tabular uppercase" />
              <input type="text" value={compContact} onChange={(e) => setCompContact(e.target.value)} placeholder="نام رابط" className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]" />
              <input type="email" dir="ltr" value={compEmail} onChange={(e) => setCompEmail(e.target.value)} placeholder="admin@company.ir" className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono-tabular" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModal('none')} className="h-10 px-4 rounded-lg border border-[var(--border-hairline)] text-[var(--ink-secondary)]">انصراف</button>
              <button type="submit" className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] text-white font-semibold">ایجاد شرکت</button>
            </div>
          </form>
        </div>
      )}

      {modal === 'set' && (
        <div role="dialog" aria-modal="true" aria-label="ساخت ست محصول" className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!setName.trim()) return;
              const res = await studioApi.createSet({
                companyId: viewerCompanyId,
                name: setName,
                category: 'پذیرایی',
                productIds: setProductIds,
              });
              setSetName('');
              setSetProductIds([]);
              setModal('none');
              onStateChange(res.state);
              onNotify('ست جدید ثبت شد');
            }}
            className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl max-w-md w-full p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--ink-primary)]">تعریف ست ترکیبی جدید</h2>
              <button type="button" onClick={() => setModal('none')} aria-label="بستن" className="p-1 text-[var(--ink-muted)]">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <input type="text" required value={setName} onChange={(e) => setSetName(e.target.value)} placeholder="نام ست (مثلاً ست ۳-۲-۱)" className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]" />
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {visibleCatalog.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer text-[var(--ink-primary)]">
                  <input
                    type="checkbox"
                    checked={setProductIds.includes(p.id)}
                    onChange={(e) =>
                      setSetProductIds((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                      )
                    }
                  />
                  <span className="font-mono-tabular font-semibold">{p.code}</span>
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModal('none')} className="h-10 px-4 rounded-lg border border-[var(--border-hairline)] text-[var(--ink-secondary)]">انصراف</button>
              <button type="submit" className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] text-white font-semibold">ثبت ست</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
