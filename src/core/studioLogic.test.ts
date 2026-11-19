import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCompanyBalance,
  canCompanyAccessProduct,
  createLockedTransfer,
  getPipelineProgress,
  getStageIndex,
  mapBatchActionToStatus,
  nextModelingStage,
  nextRevisionLabel,
  resolveProductDiskPath,
  sanitizePathSegment,
} from './studioLogic';
import type { Company, Invoice, Product } from './types';

const companies: Company[] = [
  {
    id: 'comp-dan',
    code: 'DAN',
    name: 'دانشور',
    englishFolder: 'DAN-Danshvar',
    contactName: 'مهندس دانشور',
    contactPhone: '021-88001122',
    contactEmail: 'info@danshvar.ir',
    adminEmail: 'admin@danshvar.ir',
    subscriptionPlan: 'Enterprise',
    subscriptionActive: true,
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'comp-tol',
    code: 'TOL',
    name: 'تولیکا',
    englishFolder: 'TOL-Tolica',
    contactName: 'سارا راد',
    contactPhone: '021-88003344',
    contactEmail: 'info@tolica.ir',
    adminEmail: 'admin@tolica.ir',
    subscriptionPlan: 'Studio Pro',
    subscriptionActive: true,
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const products: Product[] = [
  {
    id: 'prod-dan-42',
    code: 'DAN-0042',
    companyId: 'comp-dan',
    categoryFolder: 'Living Room',
    setFolder: 'Aria Set',
    name: 'مبل سه‌نفره آریا',
    coverImageUrl: '',
    tags: ['پذیرایی', 'مدرن'],
    modelingStatus: 'blender_refine',
    localFolderRelativePath: 'DAN-Danshvar/Living Room/Aria Set/DAN-0042',
    lastTripoFile: null,
    lastBlenderFile: null,
    lastGlbFile: null,
    activeOnlineRevision: null,
    revisions: [],
    files: [],
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

test('sanitizePathSegment removes illegal filesystem characters', () => {
  assert.equal(sanitizePathSegment('Aria: Set / v1?'), 'Aria- Set - v1-');
  assert.equal(sanitizePathSegment('   '), 'untitled');
});

test('resolveProductDiskPath builds deterministic company/category/set/code hierarchy', () => {
  const path = resolveProductDiskPath(companies[0], products[0]);
  assert.equal(path, 'DAN-Danshvar/Living Room/Aria Set/DAN-0042');
});

test('createLockedTransfer binds destination to active project at start time and routes unassigned to _Inbox', () => {
  const bound = createLockedTransfer({
    id: 'tr-1',
    direction: 'download',
    sourceLabel: 'Tripo',
    fileName: 'aria_sofa.glb',
    activeProjectIdAtStart: 'prod-dan-42',
    subfolder: 'Tripo',
    sizeBytes: 204800,
    products,
    companies,
    nowIso: '2026-11-18T10:00:00Z',
  });

  assert.equal(bound.lockedProjectId, 'prod-dan-42');
  assert.equal(bound.lockedCompanyCode, 'DAN');
  assert.equal(bound.lockedProductCode, 'DAN-0042');
  assert.equal(bound.finalDiskPath, 'DAN-Danshvar/Living Room/Aria Set/DAN-0042/Tripo/aria_sofa.glb');
  assert.equal(bound.stagedTempPath, '_Staging/tr-1-aria_sofa.glb.part');

  const inbox = createLockedTransfer({
    id: 'tr-2',
    direction: 'download',
    sourceLabel: 'ChatGPT',
    fileName: 'unassigned.png',
    activeProjectIdAtStart: null,
    subfolder: 'AI Images',
    sizeBytes: 10240,
    products,
    companies,
  });

  assert.equal(inbox.targetSubfolder, '_Inbox');
  assert.equal(inbox.finalDiskPath, '_Inbox/unassigned.png');
});

test('nextRevisionLabel increments R01 -> R02 -> R03 cleanly', () => {
  assert.equal(nextRevisionLabel([]), 'R01');
  assert.equal(nextRevisionLabel([{ version: 'R01' }, { version: 'R02' }]), 'R03');
  assert.equal(nextRevisionLabel([{ version: 'R09' }]), 'R10');
});

test('canCompanyAccessProduct enforces strict isolation between companies while sharing GENERAL', () => {
  assert.equal(canCompanyAccessProduct('comp-dan', 'comp-dan'), true);
  assert.equal(canCompanyAccessProduct('comp-tol', 'comp-dan'), false);
  assert.equal(canCompanyAccessProduct('comp-tol', 'comp-general'), true);
});

test('calculateCompanyBalance sums billed, paid, and remaining debt accurately', () => {
  const invoices: Pick<Invoice, 'companyId' | 'amountToman' | 'paidToman'>[] = [
    { companyId: 'comp-dan', amountToman: 12_000_000, paidToman: 8_000_000 },
    { companyId: 'comp-dan', amountToman: 5_000_000, paidToman: 5_000_000 },
    { companyId: 'comp-tol', amountToman: 9_000_000, paidToman: 0 },
  ];
  assert.deepEqual(calculateCompanyBalance('comp-dan', invoices), {
    totalBilled: 17_000_000,
    totalPaid: 13_000_000,
    outstandingDebt: 4_000_000,
  });
});

test('pipeline stage progression advances deterministically and computes batch completion', () => {
  assert.equal(getStageIndex('ai_image_prep'), 1);
  assert.equal(getStageIndex('published'), 5);
  assert.equal(nextModelingStage('queued'), 'ai_image_prep');
  assert.equal(nextModelingStage('tripo_draft'), 'blender_refine');
  assert.equal(nextModelingStage('published'), 'published');

  assert.deepEqual(mapBatchActionToStatus('queued', 'generate_3d'), {
    modelingStatus: 'tripo_draft',
    requestStatus: 'in_modeling',
  });
  assert.deepEqual(mapBatchActionToStatus('blender_refine', 'advance_next'), {
    modelingStatus: 'pending_approval',
    requestStatus: 'qa_review',
  });

  const report = getPipelineProgress([
    { modelingStatus: 'ai_image_prep' },
    { modelingStatus: 'published' },
  ]);
  assert.equal(report.total, 2);
  assert.equal(report.byStage.ai_image_prep, 1);
  assert.equal(report.byStage.published, 1);
  assert.equal(report.completionPercent, 60);
});
