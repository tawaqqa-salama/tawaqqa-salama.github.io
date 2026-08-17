'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createJournalEntry, isJournalBalanced } from '@/lib/business/accounting-service';
import NumericInput from '@/components/ui/NumericInput';
import { parseLocalizedNumber } from '@/lib/validation/client';
import { formatCurrency } from '@/lib/format/currency';
import { resolveFetchCompanyId } from '@/lib/data/fetchers';
import type { ChartOfAccount, CostCenter, JournalEntryLine } from '@/lib/types/accounting';
import type { ClientRecord } from '@/lib/types/client';

interface JournalEntryModalProps {
  onClose: () => void;
  onCreated: () => void;
}

type DraftLine = {
  account_id: string;
  description: string;
  debit: string;
  credit: string;
  cost_center_id: string;
};

const emptyLine = (): DraftLine => ({
  account_id: '',
  description: '',
  debit: '',
  credit: '',
  cost_center_id: '',
});

export default function JournalEntryModal({ onClose, onCreated }: JournalEntryModalProps) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const companyId = resolveFetchCompanyId();
    if (!companyId) return;
    Promise.all([
      supabase.from('chart_of_accounts').select('*').eq('company_id', companyId).eq('is_active', true).order('code'),
      supabase.from('cost_centers').select('*').eq('company_id', companyId).eq('is_active', true).order('code'),
      supabase.from('clients').select('id, client_code, name, business_name, quotation_number').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
    ]).then(([accountsRes, centersRes, clientsRes]) => {
      setAccounts((accountsRes.data || []) as ChartOfAccount[]);
      setCostCenters((centersRes.data || []) as CostCenter[]);
      setClients((clientsRes.data || []) as ClientRecord[]);
    });
  }, []);

  const parsedLines = useMemo<JournalEntryLine[]>(
    () =>
      lines
        .filter((line) => line.account_id)
        .map((line) => ({
          account_id: line.account_id,
          description: line.description || null,
          debit: parseLocalizedNumber(line.debit),
          credit: parseLocalizedNumber(line.credit),
          cost_center_id: line.cost_center_id || costCenterId || null,
        })),
    [lines, costCenterId]
  );

  const totalDebit = parsedLines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = parsedLines.reduce((sum, line) => sum + line.credit, 0);
  const balanced = isJournalBalanced(parsedLines);

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('يرجى إدخال وصف القيد.');
      return;
    }
    if (!balanced) {
      setError('يجب أن يتساوى مجموع المدين مع مجموع الدائن.');
      return;
    }

    setSaving(true);
    setError(null);
    const selectedClient = clients.find((client) => client.id === clientId);
    const result = await createJournalEntry({
      description,
      clientId: clientId || null,
      referenceType: selectedClient?.quotation_number ? 'client' : 'manual',
      referenceId: selectedClient?.quotation_number || selectedClient?.client_code || null,
      costCenterId: costCenterId || null,
      lines: parsedLines,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-gray-800">قيد محاسبي جديد</h2>
            <p className="text-sm text-gray-500 mt-1">أدخل بنود المدين والدائن — يجب أن يكون القيد متوازناً</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">وصف القيد</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">ربط بمعاملة / عميل</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                <option value="">— بدون ربط —</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.business_name || client.name} — {client.client_code}
                  </option>
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
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 bg-gray-50 rounded-xl border">
                <div className="md:col-span-4">
                  <select
                    value={line.account_id}
                    onChange={(e) => {
                      const next = [...lines];
                      next[index] = { ...line, account_id: e.target.value };
                      setLines(next);
                    }}
                    className="w-full p-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="">اختر الحساب</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.code} — {account.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <input
                    placeholder="البيان"
                    value={line.description}
                    onChange={(e) => {
                      const next = [...lines];
                      next[index] = { ...line, description: e.target.value };
                      setLines(next);
                    }}
                    className="w-full p-2 border rounded-lg text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <NumericInput mode="decimal" placeholder="مدين" value={line.debit} onChange={(value) => {
                    const next = [...lines];
                    next[index] = { ...line, debit: value };
                    setLines(next);
                  }} className="w-full p-2 border rounded-lg text-sm font-mono" />
                </div>
                <div className="md:col-span-2">
                  <NumericInput mode="decimal" placeholder="دائن" value={line.credit} onChange={(value) => {
                    const next = [...lines];
                    next[index] = { ...line, credit: value };
                    setLines(next);
                  }} className="w-full p-2 border rounded-lg text-sm font-mono" />
                </div>
                <div className="md:col-span-1 flex items-center">
                  {lines.length > 2 && (
                    <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== index))} className="text-red-500 text-sm">حذف</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setLines([...lines, emptyLine()])} className="text-sm text-blue-600 font-semibold">
            + إضافة بند
          </button>

          <div className={`rounded-xl p-4 text-sm ${balanced ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
            <div className="flex justify-between"><span>مجموع المدين</span><span className="font-mono">{formatCurrency(totalDebit)}</span></div>
            <div className="flex justify-between mt-1"><span>مجموع الدائن</span><span className="font-mono">{formatCurrency(totalCredit)}</span></div>
            <div className="flex justify-between mt-2 font-bold"><span>الفرق</span><span className="font-mono">{formatCurrency(Math.abs(totalDebit - totalCredit))}</span></div>
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm bg-gray-100">إلغاء</button>
          <button onClick={handleSubmit} disabled={saving || !balanced} className="px-4 py-2 rounded-xl text-sm bg-emerald-600 text-white disabled:opacity-50">
            {saving ? 'جاري الحفظ...' : 'حفظ القيد'}
          </button>
        </div>
      </div>
    </div>
  );
}
