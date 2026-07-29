'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchVouchers } from '@/lib/business/accounting-service';
import { formatCurrency, formatDate } from '@/lib/format/currency';
import ErpCard from '@/components/ui/ErpCard';
import type { ClientRecord } from '@/lib/types/client';
import type { Voucher } from '@/lib/types/accounting';

export default function FinanceClientAccountsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      fetchVouchers(),
    ]).then(([clientsRes, voucherData]) => {
      setClients((clientsRes.data || []) as ClientRecord[]);
      setVouchers(voucherData.filter((v) => v.voucher_type === 'receipt'));
      setLoading(false);
    });
  }, []);

  const selected = clients.find((c) => c.id === selectedId);
  const clientVouchers = vouchers.filter((v) => v.client_id === selectedId);
  const receivable = selected
    ? Math.max(0, Number(selected.total_amount || 0) - Number(selected.paid_amount || 0))
    : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">حسابات العملاء</h1>
        <p className="text-sm text-gray-500 mt-1">كشف حساب عميل — الذمم المدينة — سندات القبض</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ErpCard title="اختر العميل">
          {loading ? <p className="text-gray-400 text-sm">...</p> : (
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
              <option value="">— اختر عميل —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.business_name || c.name} — {c.client_code}</option>
              ))}
            </select>
          )}
        </ErpCard>

        {selected && (
          <>
            <ErpCard title="ملخص الذمم المدينة">
              <div className="space-y-2 text-sm">
                <Row label="إجمالي المعاملات" value={formatCurrency(Number(selected.total_amount || 0))} />
                <Row label="المحصل" value={formatCurrency(Number(selected.paid_amount || 0))} />
                <Row label="ذمم مقبوضة (متبقي)" value={formatCurrency(receivable)} highlight />
                <Row label="حالة الاعتماد" value={selected.financial_status || '—'} />
              </div>
            </ErpCard>

            <ErpCard title="كشف حساب مختصر">
              <div className="space-y-2 text-sm">
                <Row label="عرض السعر" value={selected.quotation_number || '—'} plain />
                <Row label="نوع البيع" value={selected.sales_payment_type || 'نقدي'} plain />
                <Row label="رصيد آجل" value={formatCurrency(Number(selected.credit_balance || 0))} />
              </div>
            </ErpCard>
          </>
        )}
      </div>

      {selected && (
        <ErpCard title={`سندات القبض — ${selected.business_name || selected.name}`} padding={false}>
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500">
              <tr><th className="p-3">رقم السند</th><th className="p-3">التاريخ</th><th className="p-3">المبلغ</th><th className="p-3">الحالة</th></tr>
            </thead>
            <tbody>
              {clientVouchers.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد سندات</td></tr>
              ) : (
                clientVouchers.map((v) => (
                  <tr key={v.id} className="border-b">
                    <td className="p-3 font-mono">{v.voucher_number}</td>
                    <td className="p-3">{formatDate(v.voucher_date)}</td>
                    <td className="p-3 font-mono">{formatCurrency(v.total_amount)}</td>
                    <td className="p-3">{v.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ErpCard>
      )}
    </div>
  );
}

function Row({ label, value, highlight, plain }: { label: string; value: string; highlight?: boolean; plain?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-rose-700 font-mono' : ''} ${!plain && !highlight ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
