'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { shouldShowInMarketing } from '@/lib/business/pipeline';
import AddLeadModal from '@/components/marketing/AddLeadModal';
import FollowUpModal from '@/components/marketing/FollowUpModal';
import PipelineStatusBoard from '@/components/marketing/PipelineStatusBoard';
import type { ClientFollowUp } from '@/lib/types/sales';
import type { ClientRecord } from '@/lib/types/client';

type TabId = 'leads' | 'followups' | 'pipeline';

export default function MarketingPage() {
  const [tab, setTab] = useState<TabId>('leads');
  const [leads, setLeads] = useState<ClientRecord[]>([]);
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [followUps, setFollowUps] = useState<ClientFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [followUpClient, setFollowUpClient] = useState<ClientRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: clients }, { data: ups }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('client_follow_ups').select('*').order('follow_up_date', { ascending: false }),
    ]);
    const all = (clients || []) as ClientRecord[];
    setAllClients(all);
    setLeads(all.filter(shouldShowInMarketing));
    setFollowUps((ups || []) as ClientFollowUp[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddLead = async (form: {
    owner_name: string;
    phone: string;
    business_name: string;
    lead_status: string;
    lead_notes: string;
  }) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    const { error } = await supabase.from('clients').insert([
      {
        client_code: `LD-${Date.now().toString().slice(-8)}`,
        name: form.business_name || form.owner_name,
        owner_name: form.owner_name,
        phone: form.phone,
        business_name: form.business_name || form.owner_name,
        pipeline_stage: 'marketing',
        lead_status: form.lead_status,
        lead_notes: form.lead_notes || null,
        last_contact_date: new Date().toISOString().slice(0, 10),
        financial_status: 'بانتظار الدفعة',
        engineering_status: 'جديد',
        quotation_status: 'مسودة',
        visit_status: 'لم تُجدول',
        final_report_status: 'قيد الإعداد',
      },
    ]);
    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setIsModalOpen(false);
    fetchData();
  };

  const convertToSales = async (client: ClientRecord) => {
    const { error } = await supabase.from('clients').update({ pipeline_stage: 'sales' }).eq('id', client.id);
    if (error) alert(error.message);
    else fetchData();
  };

  const handleFollowUp = async (payload: { follow_up_date: string; contact_method: string; notes: string }) => {
    if (!followUpClient) return;
    setIsSubmitting(true);
    await supabase.from('client_follow_ups').insert({
      client_id: followUpClient.id,
      follow_up_date: payload.follow_up_date,
      contact_method: payload.contact_method,
      notes: payload.notes,
      status: 'تم',
    });
    await supabase.from('clients').update({
      last_contact_date: payload.follow_up_date,
      next_follow_up_date: payload.follow_up_date,
      lead_notes: payload.notes || followUpClient.lead_notes,
    }).eq('id', followUpClient.id);
    setIsSubmitting(false);
    setFollowUpClient(null);
    fetchData();
  };

  const clientName = (id: string) => {
    const c = allClients.find((x) => x.id === id);
    return c?.business_name || c?.owner_name || id;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">إدارة التسويق</h1>
          <p className="text-sm text-gray-500 mt-1">Leads، متابعات التواصل، ومتابعة مراحل المشاريع (للقراءة فقط)</p>
        </div>
        <button onClick={() => { setErrorMessage(null); setIsModalOpen(true); }} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold">
          + Lead جديد
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { id: 'leads' as const, label: 'Leads' },
          { id: 'followups' as const, label: 'متابعات التواصل' },
          { id: 'pipeline' as const, label: 'لوحة حالة العميل' },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === t.id ? 'bg-purple-600 text-white' : 'bg-white border'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'leads' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="p-4">العميل</th>
                <th className="p-4">الجوال</th>
                <th className="p-4">حالة الاهتمام</th>
                <th className="p-4">آخر تواصل</th>
                <th className="p-4">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا يوجد Leads</td></tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 font-semibold">{lead.owner_name || lead.name}</td>
                    <td className="p-4 font-mono">{lead.phone}</td>
                    <td className="p-4">{lead.lead_status || 'مهتم'}</td>
                    <td className="p-4 text-gray-500">{lead.last_contact_date || '—'}</td>
                    <td className="p-4 flex flex-wrap gap-2">
                      <button onClick={() => setFollowUpClient(lead)} className="px-2 py-1 bg-gray-100 rounded-lg text-xs">متابعة</button>
                      <button onClick={() => convertToSales(lead)} className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs">→ مبيعات</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'followups' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500">
              <tr><th className="p-3">العميل</th><th className="p-3">التاريخ</th><th className="p-3">الطريقة</th><th className="p-3">ملاحظات</th><th className="p-3">الحالة</th></tr>
            </thead>
            <tbody>
              {followUps.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد متابعات</td></tr>
              ) : (
                followUps.map((fu) => (
                  <tr key={fu.id} className="border-b">
                    <td className="p-3">{clientName(fu.client_id)}</td>
                    <td className="p-3">{fu.follow_up_date}</td>
                    <td className="p-3">{fu.contact_method}</td>
                    <td className="p-3">{fu.notes || '—'}</td>
                    <td className="p-3">{fu.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pipeline' && <PipelineStatusBoard clients={allClients} />}

      <AddLeadModal isOpen={isModalOpen} isSubmitting={isSubmitting} errorMessage={errorMessage} onClose={() => setIsModalOpen(false)} onSubmit={handleAddLead} />
      <FollowUpModal clientName={followUpClient?.business_name || followUpClient?.owner_name || ''} isOpen={!!followUpClient} isSubmitting={isSubmitting} onClose={() => setFollowUpClient(null)} onSubmit={handleFollowUp} />
    </div>
  );
}
