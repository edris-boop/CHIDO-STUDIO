import { useState } from 'react';
import {
  ArrowLeft,
  Box,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  MessageSquare,
  MessageSquareOff,
  NotebookPen,
  Plus,
  Square,
  UploadCloud,
  X,
} from 'lucide-react';
import { studioApi } from '../api/client';
import {
  type BatchPipelineAction,
  formatBytes,
  formatToman,
  getPipelineProgress,
  getStageIndex,
  PIPELINE_STAGES,
} from '../core/studioLogic';
import type { ModelingStatus, Product, ReviewMessageStatus, StudioState } from '../core/types';
import type { ContextMenuItem } from './StudioContextMenu';

interface PipelineWorkspaceViewProps {
  state: StudioState;
  onStateChange: (state: StudioState) => void;
  onSelectAndOpenStudio: (projectId: string, subMode?: 'preview3d' | 'browser' | 'files', glbPath?: string) => void;
  onLaunchBlender: (projectId: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, title: string, items: ContextMenuItem[]) => void;
  onNotify: (msg: string) => void;
}

type PipelineFilter = 'all' | ModelingStatus | 'revisions';

const REVIEW_BADGES: Record<
  ReviewMessageStatus,
  { label: string; bgVar: string; inkVar: string; hasMsg: boolean }
> = {
  message_received: {
    label: 'پیام داده شده',
    bgVar: 'var(--tone-emerald-bg)',
    inkVar: 'var(--tone-emerald-ink)',
    hasMsg: true,
  },
  revision_needed: {
    label: 'نیاز به اصلاح (پیام)',
    bgVar: 'var(--tone-amber-bg)',
    inkVar: 'var(--tone-amber-ink)',
    hasMsg: true,
  },
  no_message: {
    label: 'بدون پیام',
    bgVar: 'var(--surface-subtle)',
    inkVar: 'var(--ink-muted)',
    hasMsg: false,
  },
};

export function PipelineWorkspaceView({
  state,
  onStateChange,
  onSelectAndOpenStudio,
  onLaunchBlender,
  onOpenContextMenu,
  onNotify,
}: PipelineWorkspaceViewProps) {
  const [filter, setFilter] = useState<PipelineFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyBatch, setBusyBatch] = useState(false);
  const [expandedImagesId, setExpandedImagesId] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [draftMsgStatus, setDraftMsgStatus] = useState<ReviewMessageStatus>('no_message');
  const [draftReviewMsg, setDraftReviewMsg] = useState('');
  const [draftNote, setDraftNote] = useState('');

  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [reqTitle, setReqTitle] = useState('');
  const [reqCompanyId, setReqCompanyId] = useState(state.activeCompanyId || state.companies[0]?.id || '');
  const [reqFee, setReqFee] = useState('4500000');

  const progressReport = getPipelineProgress(state.products);

  const visibleProducts = state.products.filter((p) => {
    if (filter === 'all' || filter === 'revisions') return true;
    return p.modelingStatus === filter;
  });

  const allVisibleSelected =
    visibleProducts.length > 0 && visibleProducts.every((p) => selectedIds.includes(p.id));

  const toggleSelect = (pid: string) => {
    setSelectedIds((prev) => (prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]));
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleProducts.some((p) => p.id === id)));
    } else {
      const next = new Set(selectedIds);
      for (const p of visibleProducts) next.add(p.id);
      setSelectedIds(Array.from(next));
    }
  };

  const runBatch = async (ids: string[], action: BatchPipelineAction, label: string) => {
    if (ids.length === 0) return;
    setBusyBatch(true);
    try {
      const res = await studioApi.runBatchPipeline(ids, action);
      onStateChange(res.state);
      onNotify(`${label} برای ${res.updatedCodes.length} مدل انجام شد`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'خطا در اجرای عملیات دسته‌ای');
    } finally {
      setBusyBatch(false);
    }
  };

  const startEditReview = (prod: Product) => {
    if (editingReviewId === prod.id) {
      setEditingReviewId(null);
      return;
    }
    setEditingReviewId(prod.id);
    setDraftMsgStatus(prod.reviewMessageStatus ?? 'no_message');
    setDraftReviewMsg(prod.reviewMessage ?? '');
    setDraftNote(prod.studioNote ?? '');
  };

  const handleSaveReview = async (prodId: string) => {
    const res = await studioApi.updatePipelineReview({
      productId: prodId,
      reviewMessageStatus: draftMsgStatus,
      reviewMessage: draftReviewMsg,
      studioNote: draftNote,
    });
    setEditingReviewId(null);
    onStateChange(res.state);
    onNotify('پیام ریویو و یادداشت ذخیره شد');
  };

  const handleCreateReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqTitle.trim()) return;
    const res = await studioApi.createRequest({
      companyId: reqCompanyId,
      title: reqTitle,
      category: 'پذیرایی',
      priority: 'normal',
      feeToman: Number(reqFee || 3500000),
    });
    setReqTitle('');
    setShowNewRequestModal(false);
    onStateChange(res.state);
    onNotify('درخواست مدلسازی جدید ثبت شد');
  };

  const handleRowContextMenu = (e: React.MouseEvent, prod: Product) => {
    onOpenContextMenu(e, `${prod.code} · ${prod.name}`, [
      {
        id: 'ctx-open-3d',
        label: 'باز کردن پیشنمایش سه‌بعدی',
        icon: <Cloud className="w-4 h-4 text-[var(--accent-ink)]" />,
        onSelect: () => onSelectAndOpenStudio(prod.id, 'preview3d'),
      },
      {
        id: 'ctx-open-blender',
        label: 'اجرا در Blender',
        icon: <Box className="w-4 h-4 text-[var(--tone-violet-ink)]" />,
        onSelect: () => onLaunchBlender(prod.id),
      },
      {
        id: 'ctx-next-stage',
        label: 'انتقال به مرحله بعدی خط تولید',
        dividerAbove: true,
        icon: <ArrowLeft className="w-4 h-4 text-[var(--tone-emerald-ink)]" />,
        onSelect: () => runBatch([prod.id], 'advance_next', 'انتقال مرحله بعد'),
      },
      {
        id: 'ctx-edit-note',
        label: 'ثبت / ویرایش پیام ریویو و یادداشت',
        icon: <NotebookPen className="w-4 h-4 text-[var(--tone-amber-ink)]" />,
        onSelect: () => startEditReview(prod),
      },
    ]);
  };

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-6 space-y-5">
      {/* Header + Progress Summary + New Request */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[var(--ink-primary)]">
            خط تولید، پیشرفت مدل‌ها و ریویو
          </h1>
          <p className="text-sm text-[var(--ink-muted)]">
            میانگین پیشرفت کل:{' '}
            <span className="font-mono-tabular font-bold text-[var(--accent-ink)]">
              {progressReport.completionPercent}%
            </span>{' '}
            در بین {progressReport.total} مدل فعال · امکان اجرای دسته‌ای بدون تغییر صفحه
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewRequestModal(true)}
          className="h-10 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>ثبت درخواست جدید</span>
        </button>
      </div>

      {/* 5-Stage Progress Filter Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`p-3 rounded-xl border text-right transition-colors ${
            filter === 'all'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : 'border-[var(--border-hairline)] bg-[var(--surface-card)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <div className="text-xs text-[var(--ink-muted)]">همه مدل‌ها</div>
          <div className="text-xl font-bold font-mono-tabular mt-0.5">{progressReport.total}</div>
        </button>

        {PIPELINE_STAGES.map((st) => {
          const count = progressReport.byStage[st.id] || 0;
          const active = filter === st.id;
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setFilter(st.id)}
              className={`p-3 rounded-xl border text-right transition-colors ${
                active
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                  : 'border-[var(--border-hairline)] bg-[var(--surface-card)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <div className="text-xs text-[var(--ink-muted)] truncate">
                {st.step}. {st.shortLabel}
              </div>
              <div className="text-xl font-bold font-mono-tabular mt-0.5">{count}</div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setFilter('revisions')}
          className={`p-3 rounded-xl border text-right transition-colors ${
            filter === 'revisions'
              ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : 'border-[var(--border-hairline)] bg-[var(--surface-card)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <div className="text-xs text-[var(--ink-muted)]">مخزن ریویژن‌ها</div>
          <div className="text-xl font-bold font-mono-tabular mt-0.5">
            {state.products.reduce((s, p) => s + p.revisions.length, 0)}
          </div>
        </button>
      </div>

      {/* Inline Batch Production Bar (Always visible when not in revisions table) */}
      {filter !== 'revisions' && (
        <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              className="h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-sm font-medium text-[var(--ink-primary)] flex items-center gap-2"
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-4 h-4 text-[var(--accent-ink)]" />
              ) : (
                <Square className="w-4 h-4 text-[var(--ink-muted)]" />
              )}
              <span>{allVisibleSelected ? 'لغو انتخاب همه' : 'انتخاب همه'}</span>
            </button>
            <span className="text-sm font-medium text-[var(--ink-secondary)]">
              <span className="font-mono-tabular font-bold text-[var(--ink-primary)]">{selectedIds.length}</span>{' '}
              مدل انتخاب شده
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.length === 0 || busyBatch}
              onClick={() => runBatch(selectedIds, 'generate_3d', 'ساخت سه‌بعدی (Tripo)')}
              className="h-9 px-3.5 rounded-lg text-sm font-semibold disabled:opacity-45 transition-opacity"
              style={{
                backgroundColor: 'var(--tone-violet-bg)',
                color: 'var(--tone-violet-ink)',
              }}
            >
              ساخت سه‌بعدی دسته‌ای
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || busyBatch}
              onClick={() => runBatch(selectedIds, 'blender_prep', 'آماده‌سازی Blender')}
              className="h-9 px-3.5 rounded-lg text-sm font-semibold disabled:opacity-45 transition-opacity"
              style={{
                backgroundColor: 'var(--tone-amber-bg)',
                color: 'var(--tone-amber-ink)',
              }}
            >
              آماده‌سازی Blender
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || busyBatch}
              onClick={() => runBatch(selectedIds, 'upload_cloud', 'آپلود به مخزن چیدو')}
              className="h-9 px-3.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] text-sm font-semibold disabled:opacity-45 transition-opacity"
            >
              آپلود دسته‌ای
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || busyBatch}
              onClick={() => runBatch(selectedIds, 'publish', 'انتشار آنلاین')}
              className="h-9 px-3.5 rounded-lg text-sm font-semibold disabled:opacity-45 transition-opacity"
              style={{
                backgroundColor: 'var(--tone-emerald-bg)',
                color: 'var(--tone-emerald-ink)',
              }}
            >
              انتشار نهایی
            </button>
          </div>
        </div>
      )}

      {/* Revisions Matrix View when filter === 'revisions' */}
      {filter === 'revisions' ? (
        <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl divide-y divide-[var(--border-hairline)]">
          {state.products.map((prod) => (
            <div key={prod.id} className="p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-base font-bold text-[var(--ink-primary)]">
                  <span className="font-mono-tabular text-[var(--accent-ink)]">{prod.code}</span>
                  <span>·</span>
                  <span>{prod.name}</span>
                  <span className="text-sm font-normal text-[var(--ink-muted)]">
                    (آنلاین: {prod.activeOnlineRevision || 'منتشر نشده'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectAndOpenStudio(prod.id, 'preview3d')}
                  className="h-9 px-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-sm font-medium flex items-center gap-1.5"
                >
                  <Cloud className="w-4 h-4 text-[var(--accent-ink)]" />
                  <span>پیشنمایش 3D</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] text-[var(--ink-muted)]">
                      <th className="py-2 font-medium">نسخه</th>
                      <th className="py-2 font-medium">فایل</th>
                      <th className="py-2 font-medium">حجم</th>
                      <th className="py-2 font-medium">وضعیت</th>
                      <th className="py-2 font-medium text-left">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {prod.revisions.map((rev) => (
                      <tr key={rev.id}>
                        <td className="py-2.5 font-mono-tabular font-bold text-[var(--ink-primary)]">{rev.version}</td>
                        <td className="py-2.5 font-mono-tabular text-[var(--ink-secondary)]" dir="ltr">
                          {rev.fileName}
                        </td>
                        <td className="py-2.5 font-mono-tabular text-[var(--ink-muted)]">
                          {formatBytes(rev.sizeBytes)}
                        </td>
                        <td className="py-2.5">
                          {rev.isActiveOnline ? (
                            <span className="text-[var(--tone-emerald-ink)] font-semibold">منتشرشده (Active)</span>
                          ) : rev.status === 'pending_approval' ? (
                            <span className="text-[var(--tone-amber-ink)] font-medium">در انتظار تأیید</span>
                          ) : rev.status === 'archived' ? (
                            <span className="text-[var(--ink-muted)]">آرشیو شده</span>
                          ) : (
                            <span className="text-[var(--ink-secondary)]">محلی</span>
                          )}
                        </td>
                        <td className="py-2.5 text-left space-x-2 space-x-reverse">
                          {(rev.status === 'local' || rev.status === 'ready_to_upload') && (
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await studioApi.revisionAction(rev.id, 'upload');
                                onStateChange(res.state);
                                onNotify(`ریویژن ${rev.version} آپلود شد`);
                              }}
                              className="px-3 py-1 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-xs font-medium inline-flex items-center gap-1"
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                              <span>آپلود</span>
                            </button>
                          )}
                          {(rev.status === 'pending_approval' ||
                            (!rev.isActiveOnline && rev.status === 'published')) && (
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await studioApi.revisionAction(rev.id, 'publish');
                                onStateChange(res.state);
                                onNotify(`ریویژن ${rev.version} منتشر شد`);
                              }}
                              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                            >
                              تأیید و انتشار
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectAndOpenStudio(prod.id, 'preview3d', rev.diskRelativePath)}
                            className="px-3 py-1 rounded-lg border border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)] text-xs font-medium text-[var(--ink-primary)]"
                          >
                            نمایش
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Unified Pipeline Models + Progress Bar + Review Message/Notes */
        <div className="space-y-3.5">
          {visibleProducts.length === 0 ? (
            <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-10 text-center text-base text-[var(--ink-muted)]">
              در این مرحله مدلی وجود ندارد.
            </div>
          ) : (
            visibleProducts.map((prod) => {
              const comp = state.companies.find((c) => c.id === prod.companyId);
              const linkedReq = state.requests.find((r) => r.productId === prod.id);
              const isSelected = selectedIds.includes(prod.id);
              const stageStep = getStageIndex(prod.modelingStatus);
              const currentStageObj = PIPELINE_STAGES.find((s) => s.id === prod.modelingStatus);
              const msgStatus = prod.reviewMessageStatus ?? 'no_message';
              const reviewStyle = REVIEW_BADGES[msgStatus];
              const isEditingReview = editingReviewId === prod.id;
              const isImagesOpen = expandedImagesId === prod.id;

              return (
                <div
                  key={prod.id}
                  onContextMenu={(e) => handleRowContextMenu(e, prod)}
                  className={`bg-[var(--surface-card)] border rounded-xl p-5 space-y-4 transition-colors ${
                    isSelected
                      ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]/30'
                      : 'border-[var(--border-hairline)]'
                  }`}
                >
                  {/* Top Row: Checkbox + Code/Title + Review Status + Quick Actions */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSelect(prod.id)}
                        aria-label={`انتخاب ${prod.code}`}
                        className="mt-1 p-1 rounded hover:bg-[var(--surface-subtle)] text-[var(--ink-secondary)] shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-[var(--accent-ink)]" />
                        ) : (
                          <Square className="w-5 h-5 text-[var(--ink-muted)]" />
                        )}
                      </button>

                      <div className="min-w-0 space-y-1">
                        <div className="text-sm text-[var(--ink-muted)] flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular font-bold text-[var(--accent-ink)]">
                            {prod.code}
                          </span>
                          <span>·</span>
                          <span>{comp?.name}</span>
                          {linkedReq && (
                            <>
                              <span>·</span>
                              <span className="font-mono-tabular">{linkedReq.requestCode}</span>
                              <span>·</span>
                              <span className="font-mono-tabular">{formatToman(linkedReq.feeToman)}</span>
                            </>
                          )}
                        </div>
                        <div className="text-lg font-bold text-[var(--ink-primary)]">{prod.name}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Review Message Indicator */}
                      <span
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5"
                        style={{ backgroundColor: reviewStyle.bgVar, color: reviewStyle.inkVar }}
                      >
                        {reviewStyle.hasMsg ? (
                          <MessageSquare className="w-4 h-4" />
                        ) : (
                          <MessageSquareOff className="w-4 h-4" />
                        )}
                        <span>{reviewStyle.label}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => startEditReview(prod)}
                        className="h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-sm font-medium text-[var(--ink-primary)] flex items-center gap-1.5"
                      >
                        <NotebookPen className="w-4 h-4" />
                        <span>پیام و یادداشت</span>
                      </button>

                      {prod.modelingStatus !== 'published' && (
                        <button
                          type="button"
                          disabled={busyBatch}
                          onClick={() => runBatch([prod.id], 'advance_next', `پیشرفت ${prod.code}`)}
                          className="h-9 px-3.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold flex items-center gap-1.5"
                        >
                          <span>مرحله بعد</span>
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectAndOpenStudio(prod.id, 'preview3d')}
                        className="h-9 px-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-sm font-semibold text-[var(--ink-primary)]"
                      >
                        استودیو 3D
                      </button>

                      {linkedReq && linkedReq.clientImages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedImagesId(isImagesOpen ? null : prod.id)}
                          aria-expanded={isImagesOpen}
                          className="h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-sm text-[var(--ink-secondary)] flex items-center gap-1"
                        >
                          <span>تصاویر ({linkedReq.clientImages.length})</span>
                          {isImagesOpen ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 5-Step Stage Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                      <span>
                        مرحله فعلی:{' '}
                        <strong className="text-[var(--ink-primary)]">
                          {currentStageObj ? currentStageObj.label : 'در صف'}
                        </strong>
                      </span>
                      <span className="font-mono-tabular font-semibold">
                        {stageStep} / {PIPELINE_STAGES.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {PIPELINE_STAGES.map((st) => {
                        const completedOrCurrent = stageStep >= st.step;
                        const isCurrent = stageStep === st.step;
                        return (
                          <div key={st.id} className="space-y-1">
                            <div
                              className={`h-2 rounded-full transition-colors ${
                                isCurrent
                                  ? 'bg-[var(--accent-primary)]'
                                  : completedOrCurrent
                                    ? 'bg-emerald-500/80'
                                    : 'bg-[var(--surface-elevated)]'
                              }`}
                            />
                            <div
                              className={`text-xs truncate ${
                                isCurrent
                                  ? 'font-bold text-[var(--accent-ink)]'
                                  : completedOrCurrent
                                    ? 'text-[var(--ink-secondary)]'
                                    : 'text-[var(--ink-muted)]'
                              }`}
                            >
                              {st.shortLabel}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Visible Summary of Review Message & Studio Note */}
                  {(prod.reviewMessage || prod.studioNote) && !isEditingReview && (
                    <div className="rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-hairline)] p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink-muted)] mb-0.5">
                          پیام ریویو / کلاینت
                        </div>
                        <div className="text-[var(--ink-primary)]">
                          {prod.reviewMessage || 'هنوز پیامی ثبت نشده است.'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[var(--ink-muted)] mb-0.5">
                          یادداشت تیم استودیو
                        </div>
                        <div className="text-[var(--ink-secondary)]">
                          {prod.studioNote || 'یادداشتی ثبت نشده است.'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline Editor for Review Status, Client Message & Studio Note */}
                  {isEditingReview && (
                    <div className="rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-strong)] p-4 space-y-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor={`rev-status-${prod.id}`}
                          className="font-bold text-[var(--ink-primary)]"
                        >
                          وضعیت پیام ریویو و یادداشت ({prod.code})
                        </label>
                        <select
                          id={`rev-status-${prod.id}`}
                          value={draftMsgStatus}
                          onChange={(e) => setDraftMsgStatus(e.target.value as ReviewMessageStatus)}
                          className="h-9 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] text-sm font-medium text-[var(--ink-primary)]"
                        >
                          <option value="no_message">بدون پیام</option>
                          <option value="message_received">پیام داده شده</option>
                          <option value="revision_needed">نیاز به اصلاح (پیام کلاینت)</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor={`rev-msg-${prod.id}`}
                            className="block text-xs font-medium text-[var(--ink-muted)] mb-1"
                          >
                            متن پیام ریویو / کلاینت
                          </label>
                          <textarea
                            id={`rev-msg-${prod.id}`}
                            rows={2}
                            value={draftReviewMsg}
                            onChange={(e) => setDraftReviewMsg(e.target.value)}
                            placeholder="مثلاً: رنگ چوب گردو تیره‌تر شود..."
                            className="w-full p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] text-sm text-[var(--ink-primary)]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`rev-note-${prod.id}`}
                            className="block text-xs font-medium text-[var(--ink-muted)] mb-1"
                          >
                            یادداشت داخلی تیم
                          </label>
                          <textarea
                            id={`rev-note-${prod.id}`}
                            rows={2}
                            value={draftNote}
                            onChange={(e) => setDraftNote(e.target.value)}
                            placeholder="یادداشت فنی برای مدلساز یا اپراتور..."
                            className="w-full p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] text-sm text-[var(--ink-primary)]"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingReviewId(null)}
                          className="h-9 px-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] text-sm text-[var(--ink-secondary)]"
                        >
                          انصراف
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveReview(prod.id)}
                          className="h-9 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold"
                        >
                          ذخیره پیام و یادداشت
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Client Reference Images */}
                  {isImagesOpen && linkedReq && linkedReq.clientImages.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[var(--border-hairline)]">
                      {linkedReq.clientImages.map((img) => (
                        <div
                          key={img.id}
                          className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-subtle)] flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={img.previewUrl}
                              alt={img.fileName}
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-lg object-cover border border-[var(--border-hairline)] shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-mono-tabular font-semibold text-[var(--ink-primary)] truncate" dir="ltr">
                                {img.fileName}
                              </div>
                              <div className="text-xs text-[var(--ink-muted)]">
                                {img.status === 'approved'
                                  ? 'تأیید شده'
                                  : img.status === 'rejected'
                                  ? 'رد شده'
                                  : 'در انتظار بررسی'}
                                {img.downloadedToProject ? ' · دانلود در References' : ''}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await studioApi.decideRequestImage(linkedReq.id, img.id, {
                                  decision: 'approved',
                                  downloadToProject: true,
                                });
                                onStateChange(res.state);
                                onNotify(`تصویر ${img.fileName} تأیید و ذخیره شد`);
                              }}
                              title="تأیید و دانلود در پوشه محصول"
                              className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await studioApi.decideRequestImage(linkedReq.id, img.id, {
                                  decision: 'rejected',
                                });
                                onStateChange(res.state);
                                onNotify(`تصویر ${img.fileName} رد شد`);
                              }}
                              aria-label={`رد تصویر ${img.fileName}`}
                              className="h-8 w-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-card)] hover:bg-[var(--tone-rose-bg)] text-[var(--tone-rose-ink)] flex items-center justify-center"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal: New Modeling Request */}
      {showNewRequestModal && (
        <div role="dialog" aria-modal="true" aria-label="ثبت درخواست مدلسازی" className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateReq} className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--ink-primary)]">ثبت درخواست مدلسازی جدید</h2>
              <button
                type="button"
                onClick={() => setShowNewRequestModal(false)}
                aria-label="بستن"
                className="p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] text-[var(--ink-muted)]"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="space-y-3.5 text-sm">
              <div>
                <label htmlFor="req-comp" className="block font-medium text-[var(--ink-secondary)] mb-1">
                  شرکت
                </label>
                <select
                  id="req-comp"
                  value={reqCompanyId}
                  onChange={(e) => setReqCompanyId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                >
                  {state.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="req-title" className="block font-medium text-[var(--ink-secondary)] mb-1">
                  عنوان درخواست
                </label>
                <input
                  id="req-title"
                  type="text"
                  required
                  value={reqTitle}
                  onChange={(e) => setReqTitle(e.target.value)}
                  placeholder="میز عسلی سنگ مرمر"
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                />
              </div>
              <div>
                <label htmlFor="req-fee" className="block font-medium text-[var(--ink-secondary)] mb-1">
                  تعرفه (تومان)
                </label>
                <input
                  id="req-fee"
                  type="number"
                  dir="ltr"
                  value={reqFee}
                  onChange={(e) => setReqFee(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] font-mono-tabular text-[var(--ink-primary)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewRequestModal(false)}
                className="h-10 px-4 rounded-lg border border-[var(--border-hairline)] text-sm text-[var(--ink-secondary)]"
              >
                انصراف
              </button>
              <button type="submit" className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] text-white text-sm font-semibold">
                ثبت درخواست
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
