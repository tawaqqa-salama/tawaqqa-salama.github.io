'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateTotalAmount, calculateVatAmount } from '@/lib/business/client-workflow';
import {
  buildContractTermsText,
  buildServiceScopeFromQuotation,
  createContractFromQuotation,
} from '@/lib/business/contract-service';
import { parseLocalizedNumber } from '@/lib/validation/client';
import NumericInput from '@/components/ui/NumericInput';
import { printContract } from '@/components/sales/ContractPrint';
import { loadCompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';

interface ContractModalProps {
  client: ClientRecord | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function ContractModal({ client, onClose, onCreated }: ContractModalProps) {
  const [serviceScope, setServiceScope] = useState('');
  const [terms, setTerms] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    setAmount(String(client.quotation_amount || 0));
    setServiceScope(buildServiceScopeFromQuotation(client));
    void loadCompanyProfile().then((company) => setTerms(buildContractTermsText(company)));
  }, [client]);

  if (!client) return null;

  const subtotal = parseLocalizedNumber(amount);
  const vat = calculateVatAmount(subtotal);
  const total = calculateTotalAmount(subtotal);

  const handleSave = async (print = false) => {
    setSaving(true);
    setError(null);
    const result = await createContractFromQuotation(
      {
        ...client,
        quotation_amount: subtotal,
        vat_amount: vat,
        total_amount: total,
        quotation_services: client.quotation_services,
      },
      { force: false }
    );

    // إذا كان موجوداً ونريد تحديث النطاق يدوياً — نطبع الموجود
    if (result.error) {
      setSaving(false);
      setError(result.error);
      return;
    }

    if (result.contract && (serviceScope !== result.contract.service_scope || terms !== result.contract.terms)) {
      await supabase
        .from('sales_contracts')
        .update({ service_scope: serviceScope, terms, amount: subtotal, vat_amount: vat, total_amount: total })
        .eq('id', result.contract.id);
      result.contract = {
        ...result.contract,
        service_scope: serviceScope,
        terms,
        amount: subtotal,
        vat_amount: vat,
        total_amount: total,
      };
    }

    setSaving(false);
    if (print && result.contract) {
      await printContract(result.contract, client);
    }
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">عقد اتفاق</h2>
            <p className="text-sm text-gray-500">{client.business_name || client.name} — {client.quotation_number || 'بدون عرض'}</p>
            <p className="text-xs text-emerald-700 mt-1">
              يُنشأ تلقائياً عند اعتماد/سداد العرض. يمكنك المراجعة والطباعة هنا. الرقم: CT-YYYY-NNN
            </p>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1">نطاق الأعمال (من خدمات عرض السعر)</label>
            <textarea rows={4} value={serviceScope} onChange={(e) => setServiceScope(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">الشروط وخطة السداد</label>
            <textarea rows={5} value={terms} onChange={(e) => setTerms(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">قيمة العقد (قبل الضريبة)</label>
            <NumericInput mode="decimal" value={amount} onChange={setAmount} className="w-full p-2.5 border rounded-xl text-sm font-mono" />
            <p className="text-xs text-gray-500 mt-1">شامل الضريبة تقريباً: {total.toLocaleString('ar-SA')} ر.س</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">إلغاء</button>
          <button onClick={() => void handleSave(false)} disabled={saving} className="px-4 py-2 bg-[#1f4d3a] text-white rounded-xl text-sm">حفظ / ربط العقد</button>
          <button onClick={() => void handleSave(true)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">حفظ وطباعة</button>
        </div>
      </div>
    </div>
  );
}
