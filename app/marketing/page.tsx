'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { nextLeadCode } from '@/lib/business/document-numbers';
import { shouldShowInMarketing } from '@/lib/business/pipeline';
import AddLeadModal from '@/components/marketing/AddLeadModal';
import FollowUpModal from '@/components/marketing/FollowUpModal';
import PipelineStatusBoard from '@/components/marketing/PipelineStatusBoard';
import WhatsAppInbox from '@/components/whatsapp/WhatsAppInbox';
import WhatsAppDashboardCards from '@/components/whatsapp/WhatsAppDashboardCards';
import WhatsAppCampaignsPanel from '@/components/whatsapp/WhatsAppCampaignsPanel';
import SocialMediaHub from '@/components/social/SocialMediaHub';
import WebsiteHub from '@/components/website/WebsiteHub';
import MarketingCrmFunnel from '@/components/marketing/MarketingCrmFunnel';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import type { ClientFollowUp } from '@/lib/types/sales';
import type { ClientRecord } from '@/lib/types/client';

type TabId =
  | 'dashboard'
  | 'leads'
  | 'campaigns'
  | 'whatsapp'
  | 'social'
  | 'website'
  | 'followups'
  | 'pipeline';

const SOURCE_FILTERS = [
  'الكل',
  'WhatsApp',
  'Website',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'TikTok',
  'X',
  'Google',
  'Phone',
  'Referral',
  'Campaign',
  'Other',
] as const;

export default function MarketingPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 py-10 text-center">جاري التحميل...</div>}>
      <MarketingPageInner />
    </Suspense>
  );
}

function MarketingPageInner() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const validTabs: TabId[] = [
    'dashboard',
    'leads',
    'campaigns',
    'whatsapp',
    'social',
    'website',
    'followups',
    'pipeline',
  ];
  const [tab, setTab] = useState<TabId>(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'dashboard'
  );
  const [leads, setLeads] = useState<ClientRecord[]>([]);
  const [allClients, setAllClients] = useState<ClientRecord[]>([]);
  const [followUps, setFollowUps] = useState<ClientFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [followUpClient, setFollowUpClient] = useState<ClientRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<(typeof SOURCE_FILTERS)[number]>('الكل');

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
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [{ data: clients }, { data: ups }] = await Promise.all([
        supabase.from('clients').select('*').order('created_at', { ascending: false }),
        supabase.from('client_follow_ups').select('*').order('follow_up_date', { ascending: false }),
      ]);
      if (cancelled) return;
      const all = (clients || []) as ClientRecord[];
      setAllClients(all);
      setLeads(all.filter(shouldShowInMarketing));
      setFollowUps((ups || []) as ClientFollowUp[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLeads = useMemo(() => {
    if (sourceFilter === 'الكل') return leads;
    return leads.filter((l) => (l.lead_source || '') === sourceFilter);
  }, [leads, sourceFilter]);

  const whatsappFunnel = useMemo(() => {
    const wa = allClients.filter((c) => c.lead_source === 'WhatsApp' || c.source_channel === 'whatsapp');
    return {
      total: wa.length,
      newCount: wa.filter((c) => c.pipeline_stage === 'marketing' && (c.lead_status === 'new' || c.lead_status === 'مهتم')).length,
      qualified: wa.filter((c) => c.lead_status === 'مؤهل').length,
      quotes: wa.filter((c) => Boolean(c.quotation_number)).length,
      contracted: wa.filter((c) => c.pipeline_stage === 'finance' || c.pipeline_stage === 'projects' || c.pipeline_stage === 'completed').length,
      notInterested: wa.filter((c) => c.lead_status === 'غير مهتم').length,
    };
  }, [allClients]);

  const handleAddLead = async (form: {
    owner_name: string;
    phone: string;
    business_name: string;
    lead_status: string;
    lead_notes: string;
    lead_source: string;
  }) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    const leadCode = await nextLeadCode();
    const channel = form.lead_source === 'WhatsApp' ? 'whatsapp' : form.lead_source.toLowerCase();
    const { error } = await supabase.from('clients').insert([
      {
        client_code: leadCode,
        name: form.business_name || form.owner_name,
        owner_name: form.owner_name,
        phone: form.phone,
        business_name: form.business_name || form.owner_name,
        pipeline_stage: 'marketing',
        lead_status: form.lead_status,
        lead_notes: form.lead_notes || null,
        lead_source: form.lead_source,
        source_channel: channel,
        first_contact_at: new Date().toISOString(),
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
          <h1 className="text-xl font-bold text-gray-900">{t('marketing.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('marketing.subtitle')}</p>
        </div>
        <button onClick={() => { setErrorMessage(null); setIsModalOpen(true); }} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold">
          {t('marketing.create')}
        </button>
      </div>

      <ModuleSubNavSlot label={t('subnav.marketing')}>
        <ModuleTabBar
          ariaLabel={t('subnav.marketing')}
          activeId={tab}
          onChange={(id) => setTab(id as TabId)}
          activeClassName="bg-purple-600 text-white shadow-sm"
          idleClassName="bg-white border border-gray-200 text-gray-800"
          items={[
            { id: 'dashboard', label: 'Overview' },
            { id: 'leads', label: t('marketing.tab.leads') },
            { id: 'campaigns', label: 'Campaigns' },
            { id: 'whatsapp', label: 'WhatsApp' },
            { id: 'social', label: 'السوشال ميديا' },
            { id: 'website', label: 'Website' },
            { id: 'followups', label: t('marketing.tab.followups') },
            { id: 'pipeline', label: t('marketing.tab.pipeline') },
          ]}
        />
      </ModuleSubNavSlot>

      {tab === 'dashboard' && (
        <div className="space-y-4">
          <MarketingCrmFunnel />
          <WhatsAppDashboardCards />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">{t('marketing.stat.activeLeads')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{leads.length}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">{t('marketing.stat.followups')}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{followUps.length}</p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-gray-500">WhatsApp Leads</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{whatsappFunnel.total}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              ['العملاء', whatsappFunnel.total],
              ['الجدد', whatsappFunnel.newCount],
              ['المؤهلون', whatsappFunnel.qualified],
              ['عروض الأسعار', whatsappFunnel.quotes],
              ['المتعاقدون', whatsappFunnel.contracted],
              ['غير المهتمين', whatsappFunnel.notInterested],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="text-[10px] text-emerald-900/70">{label}</p>
                <p className="text-lg font-bold text-emerald-950">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'whatsapp' && <WhatsAppInbox />}

      {tab === 'social' && (
        <SocialMediaHub
          initialSub={
            (searchParams.get('socialSub') as
              | 'dashboard'
              | 'accounts'
              | 'inbox'
              | 'content'
              | 'calendar'
              | 'campaigns'
              | 'analytics'
              | null) || 'dashboard'
          }
        />
      )}

      {tab === 'website' && <WebsiteHub />}

      {tab === 'campaigns' && (
        <div className="space-y-4">
          <WhatsAppCampaignsPanel />
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm font-bold mb-2">حملات السوشال / الموقع</p>
            <p className="text-xs text-gray-500 mb-3">
              تُدار أيضًا من تبويب السوشال ميديا → الحملات، وترتبط بـ UTM والـ CRM.
            </p>
            <button
              type="button"
              className="text-xs px-3 py-2 rounded-lg bg-teal-700 text-white"
              onClick={() => setTab('social')}
            >
              فتح حملات السوشال ميديا
            </button>
          </div>
        </div>
      )}

      {tab === 'leads' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {SOURCE_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSourceFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
                  sourceFilter === s ? 'bg-purple-600 text-white border-purple-600' : 'bg-white'
                }`}
              >
                {s === 'الكل' ? 'كل المصادر' : s}
              </button>
            ))}
          </div>
          <ResponsiveTable className="bg-white rounded-xl border shadow-sm">
            <table className="w-full text-right text-sm table-as-cards">
              <thead className="bg-gray-50 border-b text-gray-600">
                <tr>
                  <th className="p-4">{t('marketing.col.client')}</th>
                  <th className="p-4">{t('marketing.col.phone')}</th>
                  <th className="p-4">المصدر</th>
                  <th className="p-4">{t('marketing.col.interest')}</th>
                  <th className="p-4">{t('marketing.col.lastContact')}</th>
                  <th className="p-4">{t('marketing.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">{t('common.loading')}</td></tr>
                ) : filteredLeads.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">{t('marketing.emptyLeads')}</td></tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="border-b hover:bg-gray-50">
                      <td className="p-4 font-semibold" data-label={t('marketing.col.client')}>{lead.owner_name || lead.name}</td>
                      <td className="p-4 font-mono isolate-ltr" data-label={t('marketing.col.phone')}>{lead.phone}</td>
                      <td className="p-4" data-label="المصدر">{lead.lead_source || '—'}</td>
                      <td className="p-4" data-label={t('marketing.col.interest')}>{lead.lead_status || 'مهتم'}</td>
                      <td className="p-4 text-gray-500 isolate-ltr" data-label={t('marketing.col.lastContact')}>{lead.last_contact_date || '—'}</td>
                      <td className="p-4 flex flex-wrap gap-2" data-label={t('marketing.col.action')}>
                        <button onClick={() => setFollowUpClient(lead)} className="touch-target px-3 bg-gray-100 rounded-lg text-xs">{t('marketing.followUp')}</button>
                        <button onClick={() => convertToSales(lead)} className="touch-target px-3 bg-blue-600 text-white rounded-lg text-xs">{t('marketing.convertSales')}</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        </div>
      )}

      {tab === 'followups' && (
        <ResponsiveTable className="bg-white rounded-xl border shadow-sm">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500">
              <tr><th className="p-3">العميل</th><th className="p-3">التاريخ</th><th className="p-3">الطريقة</th><th className="p-3">ملاحظات</th><th className="p-3">الحالة</th></tr>
            </thead>
            <tbody>
              {followUps.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">{t('marketing.emptyFollowups')}</td></tr>
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
        </ResponsiveTable>
      )}

      {tab === 'pipeline' && <PipelineStatusBoard clients={allClients} />}

      <AddLeadModal isOpen={isModalOpen} isSubmitting={isSubmitting} errorMessage={errorMessage} onClose={() => setIsModalOpen(false)} onSubmit={handleAddLead} />
      <FollowUpModal clientName={followUpClient?.business_name || followUpClient?.owner_name || ''} isOpen={!!followUpClient} isSubmitting={isSubmitting} onClose={() => setFollowUpClient(null)} onSubmit={handleFollowUp} />
    </div>
  );
}
