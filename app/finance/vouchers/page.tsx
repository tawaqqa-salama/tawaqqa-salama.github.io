'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchVouchers } from '@/lib/business/accounting-service';
import { shouldShowInFinance } from '@/lib/business/pipeline';
import VoucherModal from '@/components/finance/VoucherModal';
import ClientDetailModal from '@/components/clients/ClientDetailModal';
import ErpCard from '@/components/ui/ErpCard';
import { formatCurrency, formatDate } from '@/lib/format/currency';
import type { Voucher } from '@/lib/types/accounting';
import type { ClientRecord } from '@/lib/types/client';

type TabId = 'receipt' | 'payment' | 'approvals';

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('receipt');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchVouchers(),
      supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data }) => ((data || []) as ClientRecord[]).filter(shouldShowInFinance)),
    ])
      .then(([voucherData, financeClients]) => {
        setVouchers(voucherData);
        setClients(financeClients);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'approvals') setActiveTab('approvals');
    load();
  }, []);

  const filtered = useMemo(() => {
    if (activeTab === 'approvals') return [];
    return vouchers.filter((voucher) => voucher.voucher_type === activeTab);
  }, [vouchers, activeTab]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">السندات</h1>
          <p className="text-sm text-gray-500 mt-1">سندات القبض والصرف — واعتماد المعاملات المالية</p>
        </div>
        {activeTab !== 'approvals' && (
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-[#635bdb] text-white rounded-lg text-sm font-semibold"
          >
            + {activeTab === 'receipt' ? 'سند قبض' : 'سند صرف'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { id: 'receipt' as const, label: 'سندات القبض' },
          { id: 'payment' as const, label: 'سندات الصرف' },
          { id: 'approvals' as const, label: 'اعتماد المعاملات' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
              activeTab === tab.id
                ? 'bg-[#635bdb] text-white border-[#635bdb]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'approvals' ? (
        <ErpCard title="معاملات بانتظار الاعتماد المالي" padding={false}>
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs">
              <tr>
                <th className="p-3">العميل</th>
                <th className="p-3">عرض السعر</th>
                <th className="p-3">الإجمالي</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد معاملات بانتظار الاعتماد</td></tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-semibold">{client.business_name || client.name}</td>
                    <td className="p-3 font-mono text-blue-600">{client.quotation_number}</td>
                    <td className="p-3 font-mono">{formatCurrency(Number(client.total_amount || 0))}</td>
                    <td className="p-3">{client.financial_status || 'بانتظار الدفعة'}</td>
                    <td className="p-3">
                      <button
                        onClick={() => setSelected(client)}
                        className="px-3 py-1.5 bg-[#635bdb] text-white rounded-lg text-xs font-semibold"
                      >
                        اعتماد / سداد
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ErpCard>
      ) : (
        <ErpCard padding={false}>
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs">
              <tr>
                <th className="p-3">رقم السند</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">البيان</th>
                <th className="p-3">المبلغ</th>
                <th className="p-3">الضريبة</th>
                <th className="p-3">الإجمالي</th>
                <th className="p-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">لا توجد سندات</td></tr>
              ) : (
                filtered.map((voucher) => (
                  <tr key={voucher.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono text-blue-600">{voucher.voucher_number}</td>
                    <td className="p-3">{formatDate(voucher.voucher_date)}</td>
                    <td className="p-3">{voucher.description || '—'}</td>
                    <td className="p-3 font-mono">{formatCurrency(voucher.amount)}</td>
                    <td className="p-3 font-mono">{formatCurrency(voucher.vat_amount)}</td>
                    <td className="p-3 font-mono font-semibold">{formatCurrency(voucher.total_amount)}</td>
                    <td className="p-3">{voucher.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ErpCard>
      )}

      {showModal && activeTab !== 'approvals' && (
        <VoucherModal type={activeTab} onClose={() => setShowModal(false)} onCreated={load} />
      )}
      <ClientDetailModal client={selected} department="finance" onClose={() => setSelected(null)} onUpdated={load} />
    </div>
  );
}
