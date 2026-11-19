import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { studioApi } from '../api/client';
import { calculateCompanyBalance, formatToman } from '../core/studioLogic';
import type { StudioState } from '../core/types';

interface AccountingWorkspaceViewProps {
  state: StudioState;
  onStateChange: (state: StudioState) => void;
  onNotify: (msg: string) => void;
}

export function AccountingWorkspaceView({
  state,
  onStateChange,
  onNotify,
}: AccountingWorkspaceViewProps) {
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invCompanyId, setInvCompanyId] = useState(state.companies[0]?.id || '');
  const [invTitle, setInvTitle] = useState('');
  const [invAmount, setInvAmount] = useState('4500000');
  const [invKind, setInvKind] = useState<'proforma' | 'final' | 'subscription'>('proforma');

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invTitle.trim()) return;
    const res = await studioApi.createInvoice({
      companyId: invCompanyId,
      title: invTitle,
      amountToman: Number(invAmount || 0),
      kind: invKind,
    });
    setInvTitle('');
    setShowInvoiceModal(false);
    onStateChange(res.state);
    onNotify('فاکتور در سیستم مالی چیدو ثبت شد');
  };

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--ink-primary)]">حسابداری و صورت‌حساب‌های چیدو</h1>
        <button
          type="button"
          onClick={() => setShowInvoiceModal(true)}
          className="h-10 px-4 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white text-sm font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>صدور فاکتور جدید</span>
        </button>
      </div>

      {/* Clean 3-column Company Balance Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {state.companies
          .filter((c) => c.code !== 'GENERAL')
          .map((comp) => {
            const bal = calculateCompanyBalance(comp.id, state.invoices);
            return (
              <div
                key={comp.id}
                className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl p-5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-[var(--ink-primary)]">{comp.name}</span>
                  <span className="text-xs font-medium text-[var(--ink-muted)]">{comp.subscriptionPlan}</span>
                </div>
                <div className="text-2xl font-bold font-mono-tabular text-[var(--ink-primary)]">
                  {formatToman(bal.outstandingDebt)}
                </div>
                <div className="text-sm text-[var(--ink-muted)] tabular-nums">
                  کل صورت‌حساب: {formatToman(bal.totalBilled)}
                </div>
              </div>
            );
          })}
      </div>

      {/* Clean Invoice Table */}
      <div className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl overflow-x-auto">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-[var(--ink-muted)]">
              <th className="py-3.5 px-4 font-semibold">شماره</th>
              <th className="py-3.5 px-4 font-semibold">شرکت</th>
              <th className="py-3.5 px-4 font-semibold">شرح</th>
              <th className="py-3.5 px-4 font-semibold">مبلغ کل</th>
              <th className="py-3.5 px-4 font-semibold">پرداخت‌شده</th>
              <th className="py-3.5 px-4 font-semibold">وضعیت</th>
              <th className="py-3.5 px-4 font-semibold text-left">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {state.invoices.map((inv) => {
              const comp = state.companies.find((c) => c.id === inv.companyId);
              const remaining = Math.max(0, inv.amountToman - inv.paidToman);
              return (
                <tr key={inv.id} className="hover:bg-[var(--surface-hover)]">
                  <td className="py-3.5 px-4 font-mono-tabular font-semibold text-[var(--ink-primary)]">
                    {inv.invoiceNumber}
                  </td>
                  <td className="py-3.5 px-4 text-[var(--ink-secondary)]">{comp?.name}</td>
                  <td className="py-3.5 px-4 text-[var(--ink-primary)]">{inv.title}</td>
                  <td className="py-3.5 px-4 font-mono-tabular text-[var(--ink-primary)]">
                    {formatToman(inv.amountToman)}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-[var(--ink-secondary)]">
                    {formatToman(inv.paidToman)}
                  </td>
                  <td className="py-3.5 px-4">
                    {inv.status === 'paid' ? (
                      <span className="text-[var(--tone-emerald-ink)] font-semibold">تسویه‌شده</span>
                    ) : inv.status === 'partial' ? (
                      <span className="text-[var(--tone-amber-ink)] font-semibold">پرداخت جزئی</span>
                    ) : (
                      <span className="text-[var(--tone-rose-ink)] font-semibold">پرداخت‌نشده</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-left">
                    {remaining > 0 ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await studioApi.recordPayment(inv.id, remaining);
                          onStateChange(res.state);
                          onNotify('پرداخت ثبت و فاکتور تسویه شد');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                      >
                        ثبت تسویه
                      </button>
                    ) : (
                      <span className="text-[var(--ink-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal: Issue Invoice */}
      {showInvoiceModal && (
        <div role="dialog" aria-modal="true" aria-label="صدور فاکتور" className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateInvoice} className="bg-[var(--surface-card)] border border-[var(--border-hairline)] rounded-xl max-w-md w-full p-6 space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--ink-primary)]">صدور صورت‌حساب جدید</h2>
              <button type="button" onClick={() => setShowInvoiceModal(false)} aria-label="بستن" className="p-1 text-[var(--ink-muted)]">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="inv-company" className="block font-medium text-[var(--ink-secondary)] mb-1">شرکت</label>
                <select
                  id="inv-company"
                  value={invCompanyId}
                  onChange={(e) => setInvCompanyId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                >
                  {state.companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="inv-title" className="block font-medium text-[var(--ink-secondary)] mb-1">شرح فاکتور</label>
                <input
                  id="inv-title"
                  type="text"
                  required
                  value={invTitle}
                  onChange={(e) => setInvTitle(e.target.value)}
                  placeholder="هزینه مدلسازی ست غذاخوری ۶ نفره"
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="inv-amount" className="block font-medium text-[var(--ink-secondary)] mb-1">مبلغ (تومان)</label>
                  <input
                    id="inv-amount"
                    type="number"
                    dir="ltr"
                    required
                    value={invAmount}
                    onChange={(e) => setInvAmount(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)] font-mono-tabular"
                  />
                </div>
                <div>
                  <label htmlFor="inv-kind" className="block font-medium text-[var(--ink-secondary)] mb-1">نوع</label>
                  <select
                    id="inv-kind"
                    value={invKind}
                    onChange={(e) => setInvKind(e.target.value as 'proforma' | 'final' | 'subscription')}
                    className="w-full h-10 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]"
                  >
                    <option value="proforma">پیش‌فاکتور</option>
                    <option value="final">نهایی</option>
                    <option value="subscription">اشتراک</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInvoiceModal(false)} className="h-10 px-4 rounded-lg border border-[var(--border-hairline)] text-[var(--ink-secondary)]">انصراف</button>
              <button type="submit" className="h-10 px-4 rounded-lg bg-[var(--accent-primary)] text-white font-semibold">ثبت فاکتور</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
