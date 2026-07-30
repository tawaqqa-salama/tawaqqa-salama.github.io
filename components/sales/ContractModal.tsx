'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calculateTotalAmount, calculateVatAmount } from '@/lib/business/client-workflow';
import { generateContractNumber } from '@/lib/constants/modules';
import { parseLocalizedNumber } from '@/lib/validation/client';
import NumericInput from '@/components/ui/NumericInput';
import { printContract } from '@/components/sales/ContractPrint';
import type { ClientRecord } from '@/lib/types/client';
import type { SalesContract } from '@/lib/types/sales';

interface ContractModalProps {
  client: ClientRecord | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function ContractModal({ client, onClose, onCreated }: ContractModalProps) {
  const [serviceScope, setServiceScope] = useState('');
  const [terms, setTerms] = useState('يلتزم الطرف الثاني بسداد المبالغ وفق جدول الدفعات المتفق عليه. ت covers خدمات الاستشارات الهندسية وتراخيص السلامة.');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    setAmount(String(client.quotation_amount || 0));
    setServiceScope(`خدمات استشارية وتراخيص سلامة — ${client.business_name || client.name}`);
  }, [client]);

  if (!client) return null;

  const subtotal = parseLocalizedNumber(amount);
  const vat = calculateVatAmount(subtotal);
  const total = calculateTotalAmount(subtotal);

  const handleSave = async (print = false) => {
    setSaving(true);
    setError(null);
    const contractNumber = await generateContractNumber();
    const contract: Omit<SalesContract, 'id' | 'created_at'> = {
      client_id: client.id,
      contract_number: contractNumber,
      quotation_number: client.quotation_number || null,
      contract_date: new Date().toISOString().slice(0, 10),
      service_scope: serviceScope,
      terms,
      amount: subtotal,
      vat_amount: vat,
      total_amount: total,
      status: 'معتمد',
    };
    const { data, error: insertError } = await supabase.from('sales_contracts').insert(contract).select('*').single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (print && data) printContract(data as SalesContract, client);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-bold">عقد خدمات استشارية</h2>
            <p className="text-sm text-gray-500">{client.business_name || client.name} — {client.quotation_number || 'بدون عرض'}</p>
            <p className="text-xs text-emerald-700 mt-1">رقم العقد يُصدر تلقائياً عند الحفظ بصيغة CT-YYYY-NNN</p>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400">×</button>
        </div>
        {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1">نطاق الخدمة</label>
            <textarea rows={3} value={serviceScope} onChange={(e) => setServiceScope(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">الشروط والأحكام</label>
            <textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">قيمة العقد (قبل الضريبة)</label>
            <NumericInput mode="decimal" value={amount} onChange={setAmount} className="w-full p-2.5 border rounded-xl text-sm font-mono" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">إلغاء</button>
          <button onClick={() => handleSave(false)} disabled={saving} className="px-4 py-2 bg-[#1f4d3a] text-white rounded-xl text-sm">حفظ العقد</button>
          <button onClick={() => handleSave(true)} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">حفظ وطباعة</button>
        </div>
      </div>
    </div>
  );
}
