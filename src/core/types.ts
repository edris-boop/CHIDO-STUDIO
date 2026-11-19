export type StudioNavSection =
  | 'studio'
  | 'pipeline'
  | 'library'
  | 'accounting'
  | 'system';

export type AssetSubfolder =
  | 'References'
  | 'AI Images'
  | 'Tripo'
  | 'Blender'
  | 'Exports';

export type ModelingStatus =
  | 'queued'
  | 'ai_image_prep'
  | 'tripo_draft'
  | 'blender_refine'
  | 'pending_approval'
  | 'published';

export type StudioTheme = 'light' | 'pastel' | 'charcoal';

export type ReviewMessageStatus =
  | 'no_message'
  | 'message_received'
  | 'revision_needed';

export type RevisionStatus =
  | 'local'
  | 'ready_to_upload'
  | 'uploading'
  | 'pending_approval'
  | 'published'
  | 'archived';

export type TransferStatus =
  | 'downloading'
  | 'completed'
  | 'error'
  | 'waiting_connection'
  | 'ready_to_upload'
  | 'uploading'
  | 'pending_approval'
  | 'published';

export interface Company {
  id: string;
  code: string; // e.g., DAN, TOL, DGT, GENERAL
  name: string;
  englishFolder: string; // e.g., DAN-Danshvar
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  adminEmail: string;
  subscriptionPlan: 'Enterprise' | 'Studio Pro' | 'Starter' | 'Internal';
  subscriptionActive: boolean;
  notes: string;
  createdAt: string;
}

export interface ProductSet {
  id: string;
  companyId: string;
  name: string;
  category: string;
  productIds: string[];
}

export interface ProductRevision {
  id: string;
  productId: string;
  version: string; // R01, R02, R03
  source: 'tripo' | 'blender' | 'cloud';
  fileName: string;
  diskRelativePath: string;
  sha256: string;
  sizeBytes: number;
  status: RevisionStatus;
  notes: string;
  createdAt: string;
  isActiveOnline: boolean;
}

export interface ProductAssetFile {
  id: string;
  productId: string;
  subfolder: AssetSubfolder;
  fileName: string;
  diskRelativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  originUrl?: string;
  convertedFromPng?: boolean;
  createdAt: string;
}

export interface Product {
  id: string; // immutable internal UUID-like ID
  code: string; // human-readable editable code, e.g., DAN-0042
  companyId: string;
  categoryFolder: string; // e.g., Living Room
  setFolder: string; // e.g., Aria Set
  name: string;
  coverImageUrl: string;
  tags: string[];
  modelingStatus: ModelingStatus;
  localFolderRelativePath: string;
  lastTripoFile: string | null;
  lastBlenderFile: string | null;
  lastGlbFile: string | null;
  activeOnlineRevision: string | null;
  revisions: ProductRevision[];
  files: ProductAssetFile[];
  reviewMessageStatus?: ReviewMessageStatus;
  reviewMessage?: string;
  studioNote?: string;
  updatedAt: string;
}

export interface RequestClientImage {
  id: string;
  fileName: string;
  previewUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  downloadedToProject: boolean;
}

export interface ModelingRequest {
  id: string;
  requestCode: string;
  companyId: string;
  productId: string | null;
  title: string;
  category: string;
  priority: 'urgent' | 'normal' | 'low';
  status: 'new' | 'in_review' | 'in_modeling' | 'qa_review' | 'approved' | 'completed';
  feeToman: number;
  clientImages: RequestClientImage[];
  reviewMessageStatus?: ReviewMessageStatus;
  reviewMessage?: string;
  studioNote?: string;
  createdAt: string;
}

export interface FileTransfer {
  id: string;
  direction: 'download' | 'upload';
  sourceLabel: string;
  fileName: string;
  lockedProjectId: string | null; // Bound at transfer start; never mutates if active project changes
  lockedCompanyCode: string;
  lockedProductCode: string;
  targetSubfolder: AssetSubfolder | '_Inbox';
  status: TransferStatus;
  progress: number;
  sizeBytes: number;
  stagedTempPath: string;
  finalDiskPath: string;
  sha256?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  iconKey: 'chido' | 'tripo' | 'chatgpt' | 'google' | 'web';
  isPinned: boolean;
  lastProbed?: BrowserProbeResult | null;
}

export interface BrowserProbeResult {
  url: string;
  reachable: boolean;
  statusCode: number | null;
  xFrameOptions: string | null;
  cspFrameAncestors: string | null;
  iframeEmbeddable: boolean;
  requiresNativeWebContents: boolean;
  reason: string;
  probedAt: string;
}

export interface SiteScript {
  id: string;
  name: string;
  domainPattern: string;
  enabled: boolean;
  runAt: 'document-idle' | 'document-start';
  code: string;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  requestId: string | null;
  title: string;
  amountToman: number;
  paidToman: number;
  kind: 'proforma' | 'final' | 'subscription';
  status: 'unpaid' | 'partial' | 'paid';
  issuedAt: string;
}

export interface ActivityLog {
  id: string;
  actor: string;
  category: 'project' | 'browser' | 'asset' | 'blender' | 'cloud' | 'accounting';
  message: string;
  projectCode?: string;
  createdAt: string;
}

export interface StudioSettings {
  storageRootPath: string;
  blenderExecutablePath: string;
  chidoBackendUrl: string;
  defaultJpgQuality: number;
  defaultMaxSizeKb: number | null;
  keepOriginalPng: boolean;
  transparentBgHex: string;
  autoConvertPngToJpg: boolean;
  autoOpenDevToolsShortcut: string;
  theme?: StudioTheme;
}

export interface StudioState {
  activeCompanyId: string | null;
  activeProjectId: string | null;
  companies: Company[];
  sets: ProductSet[];
  products: Product[];
  requests: ModelingRequest[];
  transfers: FileTransfer[];
  browserTabs: BrowserTab[];
  activeBrowserTabId: string;
  siteScripts: SiteScript[];
  invoices: Invoice[];
  logs: ActivityLog[];
  settings: StudioSettings;
}
