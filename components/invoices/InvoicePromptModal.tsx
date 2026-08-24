'use client';

import { formatCurrency } from '@/lib/format/currency';
import type { TaxInvoice } from '@/lib/types/tax-invoice';

type InvoicePromptModalProps = {
  open: boolean;
  title?: string;
  message?: string;
  invoice: TaxInvoice | null;
  loading?: boolean;
  onClose: () => void;
  onPreview: () => void;
  onDownload?: () => void;
  onWhatsApp?: () => void;
  onIssue?: () => void;
  issueLabel?: string;
};

export default function InvoicePromptModal({
  open,
  title = 'إصدار الفاتورة الضريبية',
  message = 'تم اعتماد المرحلة. هل تريد استعراض وإصدار الفاتورة الضريبية المعتمدة؟',
  invoice,
  loading,
  onClose,
  onPreview,
  onDownload,
  onWhatsApp,
  onIssue,
  issueLabel = 'إصدار الفاتورة',
}: InvoicePromptModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b bg-[#f0f7f3]">
          <h2 className="text-lg font-bold text-[#635bdb]">{title}</h2>
          <p className="text-sm text-gray-600 mt-1">{message}</p>
        </div>

        <div className="px-5 py-4 space-y-3">
          {invoice ? (
            <div className="rounded-xl border bg-gray-50 p-3 text-sm space-y-1">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">رقم الفاتورة</span>
                <strong dir="ltr">{invoice.invoice_number}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">النوع</span>
                <strong>
                  {(invoice.invoice_type || '').toUpperCase() === 'STANDARD' ||
                  invoice.invoice_kind === 'standard'
                    ? 'قياسية (B2B)'
                    : 'مبسطة (B2C)'}
                </strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">الإجمالي شامل الضريبة</span>
                <strong>{formatCurrency(Number(invoice.total_amount || 0))}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">حالة ZATCA</span>
                <strong>{invoice.status}</strong>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              سيتم توليد فاتورة ضريبية متوافقة مع ZATCA Phase 2 مع رمز QR وحساب ضريبة 15%.
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t bg-white flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-xl border text-sm font-semibold"
          >
            لاحقاً
          </button>
          {onIssue && !invoice && (
            <button
              type="button"
              disabled={loading}
              onClick={onIssue}
              className="px-3 py-2 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'جاري الإصدار...' : issueLabel}
            </button>
          )}
          {invoice && (
            <>
              {onWhatsApp && (
                <button
                  type="button"
                  onClick={onWhatsApp}
                  className="px-3 py-2 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-semibold"
                >
                  واتساب
                </button>
              )}
              {onDownload && (
                <button
                  type="button"
                  onClick={onDownload}
                  className="px-3 py-2 rounded-xl border text-sm font-semibold"
                >
                  تحميل PDF
                </button>
              )}
              <button
                type="button"
                onClick={onPreview}
                className="px-3 py-2 rounded-xl bg-[#635bdb] text-white text-sm font-semibold"
              >
                معاينة
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
