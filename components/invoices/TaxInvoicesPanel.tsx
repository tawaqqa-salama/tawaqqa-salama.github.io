'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/format/currency';
import {
  ensurePaymentMilestonesForClient,
  generateTaxInvoiceFromMilestone,
  listPaymentMilestones,
  listTaxInvoices,
} from '@/lib/invoices/tax-invoice-service';
import {
  downloadTaxInvoice,
  printTaxInvoice,
  shareTaxInvoiceWhatsApp,
} from '@/components/invoices/TaxInvoiceTemplate';
import InvoicePromptModal from '@/components/invoices/InvoicePromptModal';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import RowActionsMenu from '@/components/ui/RowActionsMenu';
import type { ClientRecord } from '@/lib/types/client';
import type { PaymentMilestone, TaxInvoice } from '@/lib/types/tax-invoice';

type TaxInvoicesPanelProps = {
  clients: ClientRecord[];
  /** إن وُجد يقيّد العرض على عميل واحد */
  clientId?: string | null;
  showGenerateButton?: boolean;
};

export default function TaxInvoicesPanel({
  clients,
  clientId,
  showGenerateButton = true,
}: TaxInvoicesPanelProps) {
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState(clientId || '');
  const [busy, setBusy] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptInvoice, setPromptInvoice] = useState<TaxInvoice | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const refresh = useCallback(async () => {
    setLoading(true);
    const rows = await listTaxInvoices({
      clientId: clientId || selectedClientId || undefined,
      limit: 100,
    });
    setInvoices(rows);
    if (clientId || selectedClientId) {
      setMilestones(await listPaymentMilestones(clientId || selectedClientId));
    } else {
      setMilestones([]);
    }
    setLoading(false);
  }, [clientId, selectedClientId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (clientId) setSelectedClientId(clientId);
  }, [clientId]);

  const activeClient =
    clientMap.get(clientId || selectedClientId) ||
    clients.find((c) => c.id === (clientId || selectedClientId)) ||
    null;

  const openPrompt = (invoice: TaxInvoice) => {
    setPromptInvoice(invoice);
    setPromptOpen(true);
  };

  const handleGenerate = async (milestoneId?: string) => {
    if (!activeClient) {
      setMessage('اختر عميلاً أولاً لإصدار الفاتورة.');
      return;
    }
    setBusy(true);
    setMessage(null);
    await ensurePaymentMilestonesForClient(activeClient, null);
    const result = await generateTaxInvoiceFromMilestone({
      clientId: activeClient.id,
      milestoneId,
      triggerSource: 'manual',
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || 'فشل إصدار الفاتورة');
      return;
    }
    setMessage(result.messages.join(' — '));
    if (result.invoice) openPrompt(result.invoice);
    await refresh();
  };

  const filtered = clientId
    ? invoices
    : selectedClientId
      ? invoices.filter((inv) => inv.client_id === selectedClientId)
      : invoices;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">الفواتير الضريبية (ZATCA)</h2>
          <p className="text-sm text-gray-500">
            فواتير قياسية/مبسطة مع QR Phase 2 وربط دفعات المراحل
          </p>
        </div>
        {showGenerateButton && (
          <button
            type="button"
            disabled={busy || !activeClient}
            onClick={() => void handleGenerate()}
            className="px-4 py-2.5 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-50"
          >
            اصدار فاتورة جديدة
          </button>
        )}
      </div>

      {!clientId && (
        <label className="block text-sm max-w-md">
          <span className="text-xs font-semibold text-gray-600 mb-1 block">تصفية حسب العميل</span>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="">كل العملاء</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name || c.name} ({c.client_code})
              </option>
            ))}
          </select>
        </label>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </div>
      )}

      {activeClient && milestones.length > 0 && (
        <div className="rounded-xl border bg-white p-3">
          <p className="text-sm font-bold text-gray-800 mb-2">جدول الدفعات</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {milestones.map((m) => (
              <div key={m.id} className="rounded-xl border p-3 text-sm">
                <div className="font-semibold">{m.title}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {m.percentage}% — {formatCurrency(m.total_amount)}
                </div>
                <div className="text-xs mt-1">
                  {m.is_invoiced ? (
                    <span className="text-emerald-700 font-semibold">مُفوترة</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleGenerate(m.id.startsWith('local-') || m.id.startsWith('demo-') ? undefined : m.id)}
                      className="text-[#635bdb] font-semibold underline disabled:opacity-50"
                    >
                      إصدار فاتورة هذه الدفعة
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ResponsiveTable className="bg-white rounded-xl border">
        <table className="w-full text-right text-sm table-as-cards">
          <thead className="bg-gray-50 border-b text-gray-600">
            <tr>
              <th className="p-3">رقم الفاتورة</th>
              <th className="p-3">العميل</th>
              <th className="p-3">النوع</th>
              <th className="p-3">المبلغ</th>
              <th className="p-3">ZATCA</th>
              <th className="p-3">التاريخ</th>
              <th className="p-3">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-400">
                  جاري التحميل...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-400">
                  لا توجد فواتير ضريبية بعد
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const client = inv.client_id ? clientMap.get(inv.client_id) : null;
                const standard =
                  (inv.invoice_type || '').toUpperCase() === 'STANDARD' ||
                  inv.invoice_kind === 'standard';
                return (
                  <tr key={inv.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono" data-label="رقم الفاتورة">
                      {inv.invoice_number}
                    </td>
                    <td className="p-3" data-label="العميل">
                      {inv.buyer_name || client?.business_name || client?.name || '—'}
                    </td>
                    <td className="p-3" data-label="النوع">
                      {standard ? 'قياسية' : 'مبسطة'}
                    </td>
                    <td className="p-3 font-mono" data-label="المبلغ">
                      {formatCurrency(Number(inv.total_amount || 0))}
                    </td>
                    <td className="p-3" data-label="ZATCA">
                      {inv.status}
                    </td>
                    <td className="p-3" data-label="التاريخ">
                      {formatDate(inv.issue_date || inv.created_at)}
                    </td>
                    <td className="p-3" data-label="إجراء">
                      <RowActionsMenu
                        items={[
                          {
                            id: 'preview',
                            label: 'معاينة / طباعة',
                            onClick: () => void printTaxInvoice(inv),
                            tone: 'primary',
                          },
                          {
                            id: 'download',
                            label: 'تحميل',
                            onClick: () => void downloadTaxInvoice(inv),
                          },
                          {
                            id: 'wa',
                            label: 'واتساب',
                            onClick: () =>
                              void shareTaxInvoiceWhatsApp(inv, client?.phone),
                            tone: 'success',
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ResponsiveTable>

      <InvoicePromptModal
        open={promptOpen}
        invoice={promptInvoice}
        message="تم إصدار الفاتورة الضريبية. هل تريد استعراضها وطباعتها الآن؟"
        onClose={() => setPromptOpen(false)}
        onPreview={() => {
          if (promptInvoice) void printTaxInvoice(promptInvoice);
        }}
        onDownload={() => {
          if (promptInvoice) void downloadTaxInvoice(promptInvoice);
        }}
        onWhatsApp={() => {
          if (promptInvoice) {
            const client = promptInvoice.client_id
              ? clientMap.get(promptInvoice.client_id)
              : null;
            void shareTaxInvoiceWhatsApp(promptInvoice, client?.phone);
          }
        }}
      />
    </div>
  );
}
