'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createJournalEntry, createVoucher } from '@/lib/business/accounting-service';
import { DEFAULT_ACCOUNT_CODES } from '@/lib/constants/accounting';
import NumericInput from '@/components/ui/NumericInput';
import { parseLocalizedNumber } from '@/lib/validation/client';
import { resolveFetchCompanyId } from '@/lib/data/fetchers';
import type { ChartOfAccount, CostCenter } from '@/lib/types/accounting';
import type { ClientRecord } from '@/lib/types/client';
import type { VoucherTypeId } from '@/lib/constants/accounting';

interface VoucherModalProps {
  type: VoucherTypeId;
  onClose: () => void;
  onCreated: () => void;
}

export default function VoucherModal({ type, onClose, onCreated }: VoucherModalProps) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientId, setClientId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [amount, setAmount] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('تحويل بنكي');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = parseLocalizedNumber(amount);
  const vatValue = parseLocalizedNumber(vatAmount);
  const total = subtotal + vatValue;

  useEffect(() => {
    const companyId = resolveFetchCompanyId();
    if (!companyId) return;
    Promise.all([
      supabase.from('chart_of_accounts').select('*').eq('company_id', companyId).eq('is_active', true).order('code'),
      supabase.from('cost_centers').select('*').eq('company_id', companyId).eq('is_active', true).order('code'),
      supabase.from('clients').select('id, client_code, name, business_name, quotation_number, total_amount, vat_amount, quotation_amount').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
    ]).then(([accountsRes, centersRes, clientsRes]) => {
      setAccounts((accountsRes.data || []) as ChartOfAccount[]);
      setCostCenters((centersRes.data || []) as CostCenter[]);
      setClients((clientsRes.data || []) as ClientRecord[]);
    });
  }, []);

  useEffect(() => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    setAmount(String(client.quotation_amount || 0));
    setVatAmount(String(client.vat_amount || 0));
    setDescription(
      type === 'receipt'
        ? `سند قبض — ${client.quotation_number || client.client_code} — ${client.business_name || client.name}`
        : `سند صرف — ${client.business_name || client.name}`
    );
  }, [clientId, clients, type]);

  const getAccount = (code: string) => accounts.find((account) => account.code === code);

  const handleSubmit = async () => {
    if (total <= 0) {
      setError('يرجى إدخال مبلغ صحيح.');
      return;
    }

    setSaving(true);
    setError(null);

    const cash = getAccount(DEFAULT_ACCOUNT_CODES.CASH);
    const revenue = getAccount(DEFAULT_ACCOUNT_CODES.SERVICE_REVENUE);
    const vatAccount = getAccount(DEFAULT_ACCOUNT_CODES.VAT_PAYABLE);
    const expense = getAccount(type === 'payment' ? DEFAULT_ACCOUNT_CODES.PROCUREMENT_EXPENSE : DEFAULT_ACCOUNT_CODES.OPERATING_EXPENSE);

    if (!cash || !expense || (type === 'receipt' && (!revenue || !vatAccount))) {
      setError('حسابات المحاسبة الافتراضية غير مكتملة.');
      setSaving(false);
      return;
    }

    const journalLines =
      type === 'receipt'
        ? [
            { account_id: cash.id, debit: total, credit: 0, description: 'تحصيل نقدي/بنكي' },
            { account_id: revenue!.id, debit: 0, credit: subtotal, description: 'إيراد خدمات' },
            { account_id: vatAccount!.id, debit: 0, credit: vatValue, description: 'ضريبة 15%' },
          ]
        : [
            { account_id: expense.id, debit: subtotal, credit: 0, description: 'مصروف' },
            ...(vatValue > 0 ? [{ account_id: vatAccount!.id, debit: vatValue, credit: 0, description: 'ضريبة مدخلات' }] : []),
            { account_id: cash.id, debit: 0, credit: total, description: 'صرف نقدي/بنكي' },
          ];

    const journalResult = await createJournalEntry({
      description: description || (type === 'receipt' ? 'سند قبض' : 'سند صرف'),
      clientId: clientId || null,
      referenceType: type,
      referenceId: referenceNumber || null,
      costCenterId: costCenterId || null,
      lines: journalLines,
    });

    if (journalResult.error || !journalResult.entry) {
      setSaving(false);
      setError(journalResult.error || 'تعذر إنشاء القيد.');
      return;
    }

    const voucherResult = await createVoucher({
      type,
      clientId: clientId || null,
      amount: subtotal,
      vatAmount: vatValue,
      totalAmount: total,
      paymentMethod,
      referenceNumber,
      description,
      costCenterId: costCenterId || null,
      journalEntryId: journalResult.entry.id,
      status: 'مرحّل',
    });

    setSaving(false);
    if (voucherResult.error) {
      setError(voucherResult.error);
      return;
    }

    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        <div className="p-6 border-b flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{type === 'receipt' ? 'سند قبض جديد' : 'سند صرف جديد'}</h2>
            <p className="text-sm text-gray-500 mt-1">يُنشئ القيد المحاسبي المرتبط تلقائياً</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">العميل / المعاملة</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                <option value="">— اختياري —</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.business_name || client.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">مركز التكلفة</label>
              <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                <option value="">— عام —</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>{center.code} — {center.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">المبلغ (قبل الضريبة)</label>
              <NumericInput mode="decimal" value={amount} onChange={setAmount} className="w-full p-2.5 border rounded-xl text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">ضريبة 15%</label>
              <NumericInput mode="decimal" value={vatAmount} onChange={setVatAmount} className="w-full p-2.5 border rounded-xl text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">طريقة الدفع</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                <option>تحويل بنكي</option>
                <option>نقدي</option>
                <option>شيك</option>
                <option>بطاقة</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">رقم المرجع</label>
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">البيان</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm bg-gray-100">إلغاء</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 rounded-xl text-sm bg-emerald-600 text-white disabled:opacity-50">
            {saving ? 'جاري الحفظ...' : 'حفظ السند'}
          </button>
        </div>
      </div>
    </div>
  );
}
