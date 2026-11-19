import type {
  AssetSubfolder,
  Company,
  FileTransfer,
  Invoice,
  ModelingRequest,
  ModelingStatus,
  Product,
  ProductRevision,
} from './types';

export function sanitizePathSegment(input: string): string {
  const cleaned = input
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'untitled';
}

export function resolveProductDiskPath(
  company: Pick<Company, 'englishFolder'>,
  product: Pick<Product, 'categoryFolder' | 'setFolder' | 'code'>
): string {
  return [
    sanitizePathSegment(company.englishFolder),
    sanitizePathSegment(product.categoryFolder),
    sanitizePathSegment(product.setFolder),
    sanitizePathSegment(product.code),
  ].join('/');
}

export function resolveTransferDestination(params: {
  lockedProjectId: string | null;
  products: Product[];
  companies: Company[];
  subfolder: AssetSubfolder;
  fileName: string;
}): {
  targetSubfolder: AssetSubfolder | '_Inbox';
  lockedCompanyCode: string;
  lockedProductCode: string;
  finalDiskPath: string;
} {
  const safeName = sanitizePathSegment(params.fileName);
  if (!params.lockedProjectId) {
    return {
      targetSubfolder: '_Inbox',
      lockedCompanyCode: 'INBOX',
      lockedProductCode: 'UNASSIGNED',
      finalDiskPath: `_Inbox/${safeName}`,
    };
  }

  const product = params.products.find((p) => p.id === params.lockedProjectId);
  if (!product) {
    return {
      targetSubfolder: '_Inbox',
      lockedCompanyCode: 'INBOX',
      lockedProductCode: 'MISSING-PROJECT',
      finalDiskPath: `_Inbox/${safeName}`,
    };
  }

  const company = params.companies.find((c) => c.id === product.companyId);
  const basePath = product.localFolderRelativePath;

  return {
    targetSubfolder: params.subfolder,
    lockedCompanyCode: company ? company.code : 'UNKNOWN',
    lockedProductCode: product.code,
    finalDiskPath: `${basePath}/${params.subfolder}/${safeName}`,
  };
}

export function createLockedTransfer(params: {
  id: string;
  direction: 'download' | 'upload';
  sourceLabel: string;
  fileName: string;
  activeProjectIdAtStart: string | null;
  subfolder: AssetSubfolder;
  sizeBytes: number;
  products: Product[];
  companies: Company[];
  nowIso?: string;
}): FileTransfer {
  const dest = resolveTransferDestination({
    lockedProjectId: params.activeProjectIdAtStart,
    products: params.products,
    companies: params.companies,
    subfolder: params.subfolder,
    fileName: params.fileName,
  });

  const safeFileName = sanitizePathSegment(params.fileName);
  return {
    id: params.id,
    direction: params.direction,
    sourceLabel: params.sourceLabel,
    fileName: safeFileName,
    lockedProjectId: params.activeProjectIdAtStart,
    lockedCompanyCode: dest.lockedCompanyCode,
    lockedProductCode: dest.lockedProductCode,
    targetSubfolder: dest.targetSubfolder,
    status: params.direction === 'download' ? 'downloading' : 'uploading',
    progress: 0,
    sizeBytes: params.sizeBytes,
    stagedTempPath: `_Staging/${params.id}-${safeFileName}.part`,
    finalDiskPath: dest.finalDiskPath,
    createdAt: params.nowIso ?? new Date().toISOString(),
  };
}

export function nextRevisionLabel(revisions: Pick<ProductRevision, 'version'>[]): string {
  let maxNum = 0;
  for (const rev of revisions) {
    const match = /^R(\d+)$/i.exec(rev.version.trim());
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `R${String(next).padStart(2, '0')}`;
}

export function canCompanyAccessProduct(
  viewerCompanyId: string,
  productCompanyId: string,
  generalCompanyId = 'comp-general'
): boolean {
  if (productCompanyId === generalCompanyId) return true;
  return viewerCompanyId === productCompanyId;
}

export function calculateCompanyBalance(
  companyId: string,
  invoices: Pick<Invoice, 'companyId' | 'amountToman' | 'paidToman'>[]
): {
  totalBilled: number;
  totalPaid: number;
  outstandingDebt: number;
} {
  let totalBilled = 0;
  let totalPaid = 0;
  for (const inv of invoices) {
    if (inv.companyId === companyId) {
      totalBilled += inv.amountToman;
      totalPaid += inv.paidToman;
    }
  }
  return {
    totalBilled,
    totalPaid,
    outstandingDebt: Math.max(0, totalBilled - totalPaid),
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatToman(amount: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(amount)) + ' تومان';
}

export type BatchPipelineAction =
  | 'prep_ai'
  | 'generate_3d'
  | 'blender_prep'
  | 'upload_cloud'
  | 'publish'
  | 'advance_next';

export const PIPELINE_STAGES: Array<{
  id: ModelingStatus;
  step: number;
  label: string;
  shortLabel: string;
  requestStatus: ModelingRequest['status'];
}> = [
  { id: 'ai_image_prep', step: 1, label: 'آماده‌سازی تصویر', shortLabel: 'تصویر AI', requestStatus: 'in_review' },
  { id: 'tripo_draft', step: 2, label: 'ساخت سه‌بعدی (Tripo)', shortLabel: 'سه‌بعدی Tripo', requestStatus: 'in_modeling' },
  { id: 'blender_refine', step: 3, label: 'آماده‌سازی Blender', shortLabel: 'Blender', requestStatus: 'in_modeling' },
  { id: 'pending_approval', step: 4, label: 'آپلود و ریویو آنلاین', shortLabel: 'آپلود و ریویو', requestStatus: 'qa_review' },
  { id: 'published', step: 5, label: 'منتشرشده در کاتالوگ', shortLabel: 'منتشرشده', requestStatus: 'completed' },
];

export function getStageIndex(status: ModelingStatus): number {
  const idx = PIPELINE_STAGES.findIndex((s) => s.id === status);
  return idx >= 0 ? idx + 1 : 0;
}

export function nextModelingStage(status: ModelingStatus): ModelingStatus {
  if (status === 'queued') return 'ai_image_prep';
  if (status === 'ai_image_prep') return 'tripo_draft';
  if (status === 'tripo_draft') return 'blender_refine';
  if (status === 'blender_refine') return 'pending_approval';
  return 'published';
}

export function mapBatchActionToStatus(
  currentStatus: ModelingStatus,
  action: BatchPipelineAction
): { modelingStatus: ModelingStatus; requestStatus: ModelingRequest['status'] } {
  const nextStatus: ModelingStatus =
    action === 'prep_ai'
      ? 'ai_image_prep'
      : action === 'generate_3d'
        ? 'tripo_draft'
        : action === 'blender_prep'
          ? 'blender_refine'
          : action === 'upload_cloud'
            ? 'pending_approval'
            : action === 'publish'
              ? 'published'
              : nextModelingStage(currentStatus);

  const stage = PIPELINE_STAGES.find((s) => s.id === nextStatus);
  return {
    modelingStatus: nextStatus,
    requestStatus: stage ? stage.requestStatus : 'new',
  };
}

export function getPipelineProgress(products: Pick<Product, 'modelingStatus'>[]): {
  total: number;
  byStage: Record<ModelingStatus, number>;
  completionPercent: number;
} {
  const byStage: Record<ModelingStatus, number> = {
    queued: 0,
    ai_image_prep: 0,
    tripo_draft: 0,
    blender_refine: 0,
    pending_approval: 0,
    published: 0,
  };
  let weightedSum = 0;
  for (const p of products) {
    byStage[p.modelingStatus] = (byStage[p.modelingStatus] || 0) + 1;
    weightedSum += (getStageIndex(p.modelingStatus) / PIPELINE_STAGES.length) * 100;
  }
  return {
    total: products.length,
    byStage,
    completionPercent: products.length > 0 ? Math.round(weightedSum / products.length) : 0,
  };
}
