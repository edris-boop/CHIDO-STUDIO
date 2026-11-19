import type { BatchPipelineAction } from '../core/studioLogic';
import type { ReviewMessageStatus, StudioState } from '../core/types';

export interface DiskNode {
  name: string;
  relativePath: string;
  type: 'dir' | 'file';
  sizeBytes?: number;
  children?: DiskNode[];
}

export interface DiskStats {
  totalBytes: number;
  fileCount: number;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const studioApi = {
  getState: () => jsonFetch<{ state: StudioState; diskStats: DiskStats }>('/api/state'),

  setActiveProject: (activeCompanyId: string | null, activeProjectId: string | null) =>
    jsonFetch<{ state: StudioState }>('/api/active-project', {
      method: 'POST',
      body: JSON.stringify({ activeCompanyId, activeProjectId }),
    }),

  getDiskTree: () =>
    jsonFetch<{ rootPath: string; tree: DiskNode[]; diskStats: DiskStats }>('/api/assets/tree'),

  createFolder: (parentRelPath: string, folderName: string) =>
    jsonFetch<{ ok: boolean; relativePath: string; tree: DiskNode[] }>('/api/assets/folder', {
      method: 'POST',
      body: JSON.stringify({ parentRelPath, folderName }),
    }),

  uploadFile: async (formData: FormData) => {
    const res = await fetch('/api/assets/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data as {
      ok: boolean;
      fileName: string;
      diskRelativePath: string;
      sha256: string;
      sizeBytes: number;
      conversionWarning: string | null;
      state: StudioState;
    };
  },

  deleteAsset: (relativePath: string) =>
    jsonFetch<{ ok: boolean; archivePath: string; state: StudioState }>('/api/assets/delete', {
      method: 'POST',
      body: JSON.stringify({ relativePath }),
    }),

  convertPngToJpg: (payload: {
    sourceRelativePath?: string;
    lockedProjectId?: string | null;
    quality?: number;
    maxSizeKb?: number | null;
    transparentBgHex?: string;
    keepOriginalPng?: boolean;
  }) =>
    jsonFetch<{
      ok: boolean;
      jpgFileName: string;
      diskRelativePath: string;
      width: number;
      height: number;
      originalBytes: number;
      convertedBytes: number;
      qualityUsed: number;
      targetSizeMet: boolean;
      warning: string | null;
      state: StudioState;
    }>('/api/images/convert', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  probeBrowserUrl: (url: string, tabId?: string) =>
    jsonFetch<{ probe: NonNullable<StudioState['browserTabs'][number]['lastProbed']>; state: StudioState }>(
      '/api/browser/probe',
      {
        method: 'POST',
        body: JSON.stringify({ url, tabId }),
      }
    ),

  manageBrowserTabs: (payload: {
    action: 'add' | 'select' | 'close' | 'navigate';
    tabId?: string;
    title?: string;
    url?: string;
  }) =>
    jsonFetch<{ state: StudioState }>('/api/browser/tabs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  captureDownload: (payload: {
    sourceLabel: 'Tripo' | 'ChatGPT' | 'Capture Image' | 'CHIDO Portal';
    fileName: string;
    lockedProjectId: string | null;
    convertPngToJpg?: boolean;
    quality?: number;
    maxSizeKb?: number | null;
    keepOriginalPng?: boolean;
  }) =>
    jsonFetch<{ ok: boolean; transfer: StudioState['transfers'][number]; state: StudioState }>(
      '/api/browser/capture-download',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  addScript: (payload: { name: string; domainPattern: string; code: string }) =>
    jsonFetch<{ state: StudioState }>('/api/scripts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateScript: (
    id: string,
    payload: { enabled?: boolean; code?: string; name?: string; domainPattern?: string; testRun?: boolean }
  ) =>
    jsonFetch<{ state: StudioState }>(`/api/scripts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  launchBlender: (productId: string, sourceFileRelPath?: string) =>
    jsonFetch<{
      ok: boolean;
      manifestPath: string;
      launchCommand: string;
      spawnedHostBlender: boolean;
      state: StudioState;
    }>('/api/blender/launch', {
      method: 'POST',
      body: JSON.stringify({ productId, sourceFileRelPath }),
    }),

  exportBlenderRevision: (productId: string, fileName?: string, notes?: string) =>
    jsonFetch<{ ok: boolean; state: StudioState }>('/api/blender/export-revision', {
      method: 'POST',
      body: JSON.stringify({ productId, fileName, notes }),
    }),

  revisionAction: (revisionId: string, action: 'upload' | 'approve' | 'publish' | 'archive') =>
    jsonFetch<{ ok: boolean; state: StudioState }>(`/api/revisions/${revisionId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  createCompany: (payload: {
    name: string;
    code: string;
    englishFolder?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    adminEmail?: string;
    subscriptionPlan?: string;
    notes?: string;
  }) =>
    jsonFetch<{ state: StudioState }>('/api/companies', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createProduct: (payload: {
    companyId: string;
    code: string;
    name: string;
    categoryFolder: string;
    setFolder: string;
    tags?: string[];
  }) =>
    jsonFetch<{ state: StudioState }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProductTags: (productId: string, payload: { tags?: string[]; code?: string; name?: string }) =>
    jsonFetch<{ state: StudioState }>(`/api/products/${productId}/tags`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createSet: (payload: { companyId: string; name: string; category: string; productIds: string[] }) =>
    jsonFetch<{ state: StudioState }>('/api/sets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createRequest: (payload: {
    companyId: string;
    productId?: string | null;
    title: string;
    category: string;
    priority: 'urgent' | 'normal' | 'low';
    feeToman: number;
  }) =>
    jsonFetch<{ state: StudioState }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRequestStatus: (requestId: string, status: StudioState['requests'][number]['status']) =>
    jsonFetch<{ state: StudioState }>(`/api/requests/${requestId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  decideRequestImage: (
    requestId: string,
    imgId: string,
    payload: { decision?: 'approved' | 'rejected'; downloadToProject?: boolean }
  ) =>
    jsonFetch<{ state: StudioState }>(`/api/requests/${requestId}/images/${imgId}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runBatchPipeline: (productIds: string[], action: BatchPipelineAction) =>
    jsonFetch<{ ok: boolean; updatedCodes: string[]; state: StudioState }>('/api/pipeline/batch', {
      method: 'POST',
      body: JSON.stringify({ productIds, action }),
    }),

  updatePipelineReview: (payload: {
    productId?: string | null;
    requestId?: string | null;
    reviewMessageStatus?: ReviewMessageStatus;
    reviewMessage?: string;
    studioNote?: string;
  }) =>
    jsonFetch<{ ok: boolean; state: StudioState }>('/api/pipeline/review', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createInvoice: (payload: {
    companyId: string;
    requestId?: string | null;
    title: string;
    amountToman: number;
    kind: 'proforma' | 'final' | 'subscription';
  }) =>
    jsonFetch<{ state: StudioState }>('/api/accounting/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  recordPayment: (invoiceId: string, amountToman: number) =>
    jsonFetch<{ state: StudioState }>('/api/accounting/payments', {
      method: 'POST',
      body: JSON.stringify({ invoiceId, amountToman }),
    }),

  updateSettings: (payload: Partial<StudioState['settings']>) =>
    jsonFetch<{ state: StudioState }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
