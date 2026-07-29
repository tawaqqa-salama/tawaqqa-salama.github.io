'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { shouldShowInProjects } from '@/lib/business/pipeline';
import { ENGINEERS } from '@/lib/constants/clients';
import ClientDetailModal from '@/components/clients/ClientDetailModal';
import PageHeader from '@/components/shared/PageHeader';
import type { ClientRecord } from '@/lib/types/client';

export default function HRPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ClientRecord | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    setClients(((data || []) as ClientRecord[]).filter(shouldShowInProjects));
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const quickAssign = async (clientId: string, engineer: string) => {
    const { error } = await supabase.from('clients').update({ assigned_engineer: engineer }).eq('id', clientId);
    if (error) alert(error.message);
    else fetchClients();
  };

  return (
    <div>
      <PageHeader
        title="إدارة الموارد البشرية"
        description="توزيع المهندسين على المعاملات المعتمدة مالياً الجاهزة للمعاينة"
      />

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-right text-sm">
          <thead className="bg-gray-50 border-b text-gray-600">
            <tr>
              <th className="p-4">المشروع / العميل</th>
              <th className="p-4">المدينة</th>
              <th className="p-4">المهندس الحالي</th>
              <th className="p-4">تعيين سريع</th>
              <th className="p-4">تفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد معاملات جاهزة للتعيين (تحتاج اعتماد مالي أولاً)</td></tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-semibold">{client.business_name || client.name}</td>
                  <td className="p-4">{client.city || '—'}</td>
                  <td className="p-4">{client.assigned_engineer || '— غير معيّن —'}</td>
                  <td className="p-4">
                    <select
                      className="border rounded-lg text-xs p-2 bg-white"
                      value=""
                      onChange={(e) => e.target.value && quickAssign(client.id, e.target.value)}
                    >
                      <option value="">اختر مهندس...</option>
                      {ENGINEERS.map((eng) => (
                        <option key={eng} value={eng}>{eng}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => setSelected(client)}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold"
                    >
                      إدارة المهمة
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ClientDetailModal client={selected} department="hr" onClose={() => setSelected(null)} onUpdated={fetchClients} />
    </div>
  );
}
