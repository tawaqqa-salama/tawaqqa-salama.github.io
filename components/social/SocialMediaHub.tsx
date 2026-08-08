'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '@/lib/social/types';

type Sub =
  | 'dashboard'
  | 'accounts'
  | 'inbox'
  | 'content'
  | 'calendar'
  | 'campaigns'
  | 'analytics';

const SUBS: { id: Sub; label: string }[] = [
  { id: 'dashboard', label: 'لوحة الأداء' },
  { id: 'accounts', label: 'الحسابات' },
  { id: 'inbox', label: 'الصندوق الوارد' },
  { id: 'content', label: 'المحتوى' },
  { id: 'calendar', label: 'التقويم' },
  { id: 'campaigns', label: 'الحملات' },
  { id: 'analytics', label: 'التحليلات' },
];

const RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: '90d', label: '90 Days' },
];

export default function SocialMediaHub({ initialSub = 'dashboard' }: { initialSub?: Sub }) {
  const [sub, setSub] = useState<Sub>(initialSub);
  const [range, setRange] = useState('30d');
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [accounts, setAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [platforms, setPlatforms] = useState(SOCIAL_PLATFORMS);
  const [providers, setProviders] = useState<Array<Record<string, unknown>>>([]);
  const [inbox, setInbox] = useState<Array<Record<string, unknown>>>([]);
  const [posts, setPosts] = useState<Array<Record<string, unknown>>>([]);
  const [campaigns, setCampaigns] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [postForm, setPostForm] = useState({
    title: '',
    content: '',
    platforms: ['instagram', 'facebook'] as string[],
    publish_at: '',
    marketing_campaign_id: '',
  });
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    objective: '',
    channels: ['instagram', 'facebook', 'website', 'whatsapp'] as string[],
    budget: '',
    target_audience: '',
  });

  const loadDashboard = useCallback(async () => {
    const res = await fetch(`/api/integrations/social/dashboard?range=${range}`).then((r) => r.json());
    if (res.ok) setStats(res);
  }, [range]);

  const loadAccounts = useCallback(async () => {
    const res = await fetch('/api/integrations/social/accounts').then((r) => r.json());
    if (res.ok) {
      setAccounts(res.accounts || []);
      if (res.platforms) setPlatforms(res.platforms);
      setProviders(res.providers || []);
    }
  }, []);

  const loadInbox = useCallback(async () => {
    const res = await fetch('/api/integrations/social/inbox').then((r) => r.json());
    if (res.ok) setInbox(res.conversations || []);
  }, []);

  const loadPosts = useCallback(async () => {
    const res = await fetch('/api/integrations/social/posts').then((r) => r.json());
    if (res.ok) setPosts(res.posts || []);
  }, []);

  const loadCampaigns = useCallback(async () => {
    const res = await fetch('/api/integrations/marketing/campaigns?performance=1').then((r) =>
      r.json()
    );
    if (res.ok) setCampaigns(res.campaigns || []);
  }, []);

  useEffect(() => {
    void loadDashboard();
    void loadAccounts();
    void loadInbox();
    void loadPosts();
    void loadCampaigns();
  }, [loadDashboard, loadAccounts, loadInbox, loadPosts, loadCampaigns]);

  const totals = (stats?.totals || {}) as Record<string, number | null>;

  const connect = async (platform: SocialPlatform) => {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/integrations/social/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'connect', platform }),
    }).then((r) => r.json());
    setBusy(false);
    if (!res.ok) {
      setMessage(res.reason || res.error || 'تعذر بدء الربط');
      return;
    }
    if (res.authorizeUrl) {
      window.location.href = res.authorizeUrl;
    }
  };

  const disconnect = async (accountId: string) => {
    setBusy(true);
    await fetch('/api/integrations/social/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect', accountId }),
    });
    setBusy(false);
    void loadAccounts();
  };

  const savePost = async (status: string) => {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/integrations/social/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...postForm,
        status,
        publish_at: postForm.publish_at || null,
        marketing_campaign_id: postForm.marketing_campaign_id || null,
      }),
    }).then((r) => r.json());
    setBusy(false);
    if (res.ok) {
      setMessage('تم حفظ المنشور');
      setPostForm((p) => ({ ...p, title: '', content: '' }));
      void loadPosts();
    } else setMessage('فشل الحفظ');
  };

  const publish = async (id: string) => {
    setBusy(true);
    const res = await fetch(`/api/integrations/social/posts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish' }),
    }).then((r) => r.json());
    setBusy(false);
    setMessage(res.ok ? 'اكتملت محاولة النشر (راجع حالة كل منصة)' : res.error || 'فشل النشر');
    void loadPosts();
  };

  const aiSuggest = async () => {
    setBusy(true);
    const res = await fetch('/api/integrations/social/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'suggest_post',
        text: postForm.content || 'خدمات أنظمة الإطفاء والسلامة',
        platform: postForm.platforms[0],
      }),
    }).then((r) => r.json());
    setBusy(false);
    if (res.ok) setPostForm((p) => ({ ...p, content: res.result, title: p.title || 'مقترح AI' }));
  };

  const saveCampaign = async () => {
    if (!campaignForm.name.trim()) return;
    setBusy(true);
    await fetch('/api/integrations/marketing/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: campaignForm.name,
        objective: campaignForm.objective,
        channels: campaignForm.channels,
        budget: campaignForm.budget ? Number(campaignForm.budget) : null,
        target_audience: campaignForm.target_audience,
        status: 'active',
      }),
    });
    setBusy(false);
    setCampaignForm({ name: '', objective: '', channels: campaignForm.channels, budget: '', target_audience: '' });
    void loadCampaigns();
  };

  const calendarPosts = useMemo(() => {
    return posts.filter((p) => p.publish_at || p.status === 'scheduled' || p.status === 'published');
  }, [posts]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {SUBS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSub(s.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
              sub === s.id ? 'bg-teal-700 text-white border-teal-700' : 'bg-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">{message}</p>
      ) : null}

      {sub === 'dashboard' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`text-xs px-3 py-1 rounded-lg border ${
                  range === r.id ? 'bg-gray-900 text-white' : 'bg-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {[
              ['المتابعون', totals.followers],
              ['نمو المتابعين', totals.followers_growth],
              ['المنشورات', totals.posts],
              ['المشاهدات', totals.views],
              ['الوصول', totals.reach],
              ['التفاعل', totals.engagement],
              ['التعليقات', totals.comments],
              ['الرسائل', totals.messages],
              ['Leads', totals.leads],
              ['Conversion %', totals.conversion_rate],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-white p-3">
                <p className="text-[10px] text-gray-500">{label}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{value ?? '—'}</p>
              </div>
            ))}
          </div>
          {stats?.funnel ? (
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm font-bold mb-2">Campaign / CRM Funnel</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
                {Object.entries(stats.funnel as Record<string, number>).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-2">
                    <p className="text-gray-500">{k}</p>
                    <p className="font-bold text-base">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {sub === 'accounts' && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-bold text-sm">+ إضافة حساب</h3>
              <span className="text-[10px] text-gray-500">OAuth رسمي فقط — بلا كلمات مرور أو أتمتة متصفح</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {platforms.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void connect(p.id)}
                  className="rounded-lg border px-3 py-3 text-sm font-semibold hover:bg-teal-50"
                >
                  {p.label_ar}
                  <span className="block text-[10px] text-gray-400 font-normal mt-1">{p.label}</span>
                </button>
              ))}
            </div>
            {providers.some((p) => p.demoMode) ? (
              <p className="text-[11px] text-amber-800 mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                وضع العرض/التجربة مفعّل لبعض المنصات (`SOCIAL_PROVIDER_MODE=demo`). للإنتاج اضبط
                بيانات OAuth الرسمية وعطّل وضع التجربة.
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border bg-white divide-y">
            {!accounts.length ? (
              <p className="p-4 text-sm text-gray-500">لا حسابات مربوطة بعد.</p>
            ) : (
              accounts.map((a) => (
                <div key={String(a.id)} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">
                      {String(a.account_name)} · {String(a.platform)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      الحالة: {String(a.connection_status)} · آخر مزامنة:{' '}
                      {a.last_sync ? new Date(String(a.last_sync)).toLocaleString('ar-SA') : '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded-lg border"
                    onClick={() => void disconnect(String(a.id))}
                  >
                    قطع الاتصال
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {sub === 'inbox' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="p-3">الشخص</th>
                <th className="p-3">المنصة</th>
                <th className="p-3">الرسالة</th>
                <th className="p-3">العميل / Lead</th>
                <th className="p-3">Pipeline</th>
                <th className="p-3">غير مقروء</th>
              </tr>
            </thead>
            <tbody>
              {!inbox.length ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    لا رسائل بعد — تصل عبر Webhooks الرسمية أو `/api/integrations/social/inbound`
                  </td>
                </tr>
              ) : (
                inbox.map((c) => {
                  const customer = c.customer as Record<string, unknown> | null;
                  return (
                    <tr key={String(c.id)} className="border-t">
                      <td className="p-3 font-semibold">{String(c.contact_name || c.contact_username || '—')}</td>
                      <td className="p-3">{String(c.platform)}</td>
                      <td className="p-3 text-gray-600 max-w-xs truncate">{String(c.last_message_preview || '—')}</td>
                      <td className="p-3">{customer ? String(customer.name) : '—'}</td>
                      <td className="p-3 text-xs">
                        {customer ? `${customer.pipeline_stage || '—'} / ${customer.lead_status || '—'}` : '—'}
                      </td>
                      <td className="p-3">{Number(c.unread_count || 0)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {sub === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <h3 className="font-bold text-sm">Create Post</h3>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Title"
              value={postForm.title}
              onChange={(e) => setPostForm((p) => ({ ...p, title: e.target.value }))}
            />
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-28"
              placeholder="Content"
              value={postForm.content}
              onChange={(e) => setPostForm((p) => ({ ...p, content: e.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              {['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube'].map((p) => (
                <label key={p} className="text-xs flex items-center gap-1 border rounded-lg px-2 py-1">
                  <input
                    type="checkbox"
                    checked={postForm.platforms.includes(p)}
                    onChange={(e) =>
                      setPostForm((prev) => ({
                        ...prev,
                        platforms: e.target.checked
                          ? [...prev.platforms, p]
                          : prev.platforms.filter((x) => x !== p),
                      }))
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
            <input
              type="datetime-local"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={postForm.publish_at}
              onChange={(e) => setPostForm((p) => ({ ...p, publish_at: e.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void savePost('draft')} className="px-3 py-2 text-xs rounded-lg border">
                حفظ مسودة
              </button>
              <button type="button" disabled={busy} onClick={() => void savePost('scheduled')} className="px-3 py-2 text-xs rounded-lg bg-teal-700 text-white">
                جدولة
              </button>
              <button type="button" disabled={busy} onClick={() => void aiSuggest()} className="px-3 py-2 text-xs rounded-lg bg-slate-800 text-white">
                اقتراح AI (مسودة)
              </button>
            </div>
          </div>
          <div className="rounded-xl border bg-white divide-y max-h-[28rem] overflow-auto">
            {posts.map((p) => (
              <div key={String(p.id)} className="p-3 text-sm space-y-1">
                <div className="flex justify-between gap-2">
                  <p className="font-semibold">{String(p.title || 'بدون عنوان')}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100">{String(p.status)}</span>
                </div>
                <p className="text-gray-600 text-xs line-clamp-2">{String(p.content)}</p>
                <p className="text-[10px] text-gray-400">{(p.platforms as string[])?.join(' · ')}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className="text-[11px] underline" onClick={() => void publish(String(p.id))}>
                    نشر الآن
                  </button>
                  <button
                    type="button"
                    className="text-[11px] underline"
                    onClick={() =>
                      void fetch(`/api/integrations/social/posts/${p.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'duplicate' }),
                      }).then(() => loadPosts())
                    }
                  >
                    تكرار
                  </button>
                  <button
                    type="button"
                    className="text-[11px] underline text-red-600"
                    onClick={() =>
                      void fetch(`/api/integrations/social/posts/${p.id}`, { method: 'DELETE' }).then(() =>
                        loadPosts()
                      )
                    }
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sub === 'calendar' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h3 className="font-bold text-sm">تقويم المحتوى</h3>
          {!calendarPosts.length ? (
            <p className="text-sm text-gray-500">لا منشورات مجدولة.</p>
          ) : (
            <ul className="space-y-2">
              {calendarPosts.map((p) => (
                <li key={String(p.id)} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{String(p.title || p.content).slice(0, 60)}</span>
                    <span className="text-xs text-gray-500">{String(p.status)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {(p.platforms as string[])?.join(', ')} ·{' '}
                    {p.publish_at ? new Date(String(p.publish_at)).toLocaleString('ar-SA') : 'بدون وقت'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sub === 'campaigns' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 space-y-2">
            <h3 className="font-bold text-sm">حملة تسويقية</h3>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="اسم الحملة" value={campaignForm.name} onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="الهدف" value={campaignForm.objective} onChange={(e) => setCampaignForm((p) => ({ ...p, objective: e.target.value }))} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="الميزانية (SAR)" value={campaignForm.budget} onChange={(e) => setCampaignForm((p) => ({ ...p, budget: e.target.value }))} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="الجمهور المستهدف" value={campaignForm.target_audience} onChange={(e) => setCampaignForm((p) => ({ ...p, target_audience: e.target.value }))} />
            <button type="button" disabled={busy} onClick={() => void saveCampaign()} className="px-3 py-2 text-xs rounded-lg bg-teal-700 text-white">
              حفظ الحملة
            </button>
          </div>
          <div className="rounded-xl border bg-white divide-y">
            {campaigns.map((row) => {
              const c = row.campaign as Record<string, unknown>;
              return (
                <div key={String(c.id)} className="p-3 text-sm">
                  <p className="font-semibold">{String(c.name)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Leads {String(row.leads)} · Opportunities {String(row.opportunities)} · Quotes{' '}
                    {String(row.quotes)} · Won {String(row.won_projects)} · Revenue {String(row.revenue)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sub === 'analytics' && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-bold text-sm mb-2">مقارنة المنصات</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {((stats?.by_platform as Array<Record<string, unknown>>) || accounts).map((p) => (
                <div key={String(p.platform || p.id)} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-semibold">{String(p.platform)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    الحالة: {String(p.connection_status || '—')} · Leads: {String(p.leads ?? '—')} ·
                    Followers: {String(p.followers ?? '—')}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-gray-500">
            المقاييس التفصيلية (Reach/Impressions/CPL) تُملأ بعد مزامنة Analytics عبر API الرسمية لكل
            منصة متصلة.
          </p>
        </div>
      )}
    </div>
  );
}
