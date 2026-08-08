'use client';

import { useCallback, useEffect, useState } from 'react';

type Sub = 'dashboard' | 'pages' | 'services' | 'projects' | 'blog' | 'forms' | 'seo' | 'settings';

const SUBS: { id: Sub; label: string }[] = [
  { id: 'dashboard', label: 'لوحة الموقع' },
  { id: 'pages', label: 'الصفحات' },
  { id: 'services', label: 'الخدمات' },
  { id: 'projects', label: 'المشاريع' },
  { id: 'blog', label: 'المدونة' },
  { id: 'forms', label: 'النماذج' },
  { id: 'seo', label: 'SEO' },
  { id: 'settings', label: 'الإعدادات' },
];

export default function WebsiteHub() {
  const [sub, setSub] = useState<Sub>('dashboard');
  const [site, setSite] = useState<Record<string, unknown> | null>(null);
  const [pages, setPages] = useState<Array<Record<string, unknown>>>([]);
  const [services, setServices] = useState<Array<Record<string, unknown>>>([]);
  const [forms, setForms] = useState<Array<Record<string, unknown>>>([]);
  const [blog, setBlog] = useState<Array<Record<string, unknown>>>([]);
  const [projects, setProjects] = useState<Array<Record<string, unknown>>>([]);
  const [funnel, setFunnel] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blogForm, setBlogForm] = useState({ title: '', slug: '', content: '', author: '' });
  const [testForm, setTestForm] = useState({
    name: '',
    phone: '',
    email: '',
    business_name: '',
    city: '',
    service: '',
    message: '',
    utm_campaign: '',
  });

  const load = useCallback(async () => {
    const [bundle, funnelRes] = await Promise.all([
      fetch('/api/integrations/website/bundle').then((r) => r.json()),
      fetch('/api/integrations/marketing/funnel').then((r) => r.json()),
    ]);
    if (bundle.ok) {
      setSite(bundle.site);
      setPages(bundle.pages || []);
      setServices(bundle.services || []);
      setForms(bundle.forms || []);
      setBlog(bundle.blog || []);
      setProjects(bundle.showcases || []);
    }
    if (funnelRes.ok) setFunnel(funnelRes);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [bundle, funnelRes] = await Promise.all([
        fetch('/api/integrations/website/bundle').then((r) => r.json()),
        fetch('/api/integrations/marketing/funnel').then((r) => r.json()),
      ]);
      if (cancelled) return;
      if (bundle.ok) {
        setSite(bundle.site);
        setPages(bundle.pages || []);
        setServices(bundle.services || []);
        setForms(bundle.forms || []);
        setBlog(bundle.blog || []);
        setProjects(bundle.showcases || []);
      }
      if (funnelRes.ok) setFunnel(funnelRes);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSettings = async () => {
    if (!site) return;
    setBusy(true);
    const res = await fetch('/api/integrations/website/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...site,
        connection_status: site.domain ? 'connected' : site.connection_status,
      }),
    }).then((r) => r.json());
    setBusy(false);
    setMessage(res.ok ? 'تم حفظ إعدادات الموقع' : 'فشل الحفظ');
    void load();
  };

  const togglePage = async (page: Record<string, unknown>) => {
    await fetch('/api/integrations/website/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...page, published: !page.published }),
    });
    void load();
  };

  const saveBlog = async () => {
    if (!blogForm.title.trim()) return;
    setBusy(true);
    await fetch('/api/integrations/website/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...blogForm,
        slug: blogForm.slug || blogForm.title.replace(/\s+/g, '-').toLowerCase(),
        published: true,
        publish_date: new Date().toISOString(),
        seo_title: blogForm.title,
      }),
    });
    setBusy(false);
    setBlogForm({ title: '', slug: '', content: '', author: '' });
    void load();
  };

  const submitTestLead = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/public/website/forms/consultation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: testForm,
        utm: {
          utm_source: 'website',
          utm_medium: 'website_form',
          utm_campaign: testForm.utm_campaign || 'consultation',
        },
        landing_page: '/contact',
        referrer: 'marketing-hub',
      }),
    }).then((r) => r.json());
    setBusy(false);
    if (res.ok) {
      setMessage(
        res.createdLead
          ? `تم إنشاء Lead جديد في CRM (${res.client?.client_code})`
          : `تم ربط الطلب بعميل موجود (${res.client?.client_code})`
      );
      void load();
    } else setMessage(res.error || 'فشل الإرسال');
  };

  const waClick = async () => {
    const res = await fetch('/api/integrations/website/whatsapp-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: testForm.phone || null,
        utm: { utm_source: 'website', utm_medium: 'whatsapp_button', utm_campaign: 'site_cta' },
        landing_page: '/',
      }),
    }).then((r) => r.json());
    if (res.whatsapp_url) window.open(res.whatsapp_url, '_blank');
    setMessage(res.note || null);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {SUBS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSub(s.id)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold ${
              sub === s.id ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {message ? (
        <p className="text-xs rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">{message}</p>
      ) : null}

      {sub === 'dashboard' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-xl border bg-white p-3">
              <p className="text-[10px] text-gray-500">الحالة</p>
              <p className="font-bold">{String(site?.connection_status || 'not_connected')}</p>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <p className="text-[10px] text-gray-500">الصفحات</p>
              <p className="font-bold">{pages.length}</p>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <p className="text-[10px] text-gray-500">الخدمات</p>
              <p className="font-bold">{services.length}</p>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <p className="text-[10px] text-gray-500">النماذج</p>
              <p className="font-bold">{forms.length}</p>
            </div>
          </div>
          {funnel?.funnel ? (
            <div className="rounded-xl border bg-white p-4">
              <p className="text-sm font-bold mb-2">Website → CRM</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
                {Object.entries(funnel.funnel as Record<string, number>).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-indigo-50 p-2">
                    <p className="text-indigo-900/70">{k}</p>
                    <p className="font-bold text-base">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {sub === 'settings' && site && (
        <div className="rounded-xl border bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {(
            [
              ['website_name', 'اسم الموقع'],
              ['domain', 'النطاق'],
              ['company_name', 'اسم الشركة'],
              ['phone', 'الهاتف'],
              ['whatsapp', 'واتساب'],
              ['email', 'البريد'],
              ['address', 'العنوان'],
              ['working_hours', 'ساعات العمل'],
              ['logo_url', 'شعار (URL)'],
              ['favicon_url', 'Favicon (URL)'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs space-y-1">
              <span className="text-gray-500">{label}</span>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={String(site[key] || '')}
                onChange={(e) => setSite((s) => ({ ...(s || {}), [key]: e.target.value }))}
              />
            </label>
          ))}
          <div className="md:col-span-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveSettings()}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-700 text-white"
            >
              حفظ الإعدادات
            </button>
          </div>
        </div>
      )}

      {sub === 'pages' && (
        <div className="rounded-xl border bg-white divide-y">
          {pages.map((p) => (
            <div key={String(p.id)} className="p-3 flex flex-wrap justify-between gap-2 text-sm">
              <div>
                <p className="font-semibold">{String(p.title)}</p>
                <p className="text-xs text-gray-500">/{String(p.slug)} · SEO: {String(p.seo_title || '—')}</p>
              </div>
              <button type="button" className="text-xs px-3 py-1 border rounded-lg" onClick={() => void togglePage(p)}>
                {p.published ? 'إلغاء النشر' : 'نشر'}
              </button>
            </div>
          ))}
        </div>
      )}

      {sub === 'services' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {services.map((s) => (
            <div key={String(s.id)} className="rounded-xl border bg-white p-3 text-sm">
              <p className="font-semibold">{String(s.name)}</p>
              <p className="text-xs text-gray-500 mt-1">CRM key: {String(s.crm_service_key || '—')}</p>
            </div>
          ))}
        </div>
      )}

      {sub === 'projects' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            مشاريع الموقع مربوطة بـ `clients` الحالية عبر `website_project_showcases.client_id` — لا قاعدة مشاريع ثانية.
          </p>
          {!projects.length ? (
            <p className="text-sm text-gray-500">لا معارض منشورة بعد. أضف من API `/api/integrations/website/projects`.</p>
          ) : (
            projects.map((p) => (
              <div key={String(p.id)} className="rounded-xl border bg-white p-3 text-sm">
                <p className="font-semibold">{String(p.title)}</p>
                <p className="text-xs text-gray-500">{String(p.city || '')} · {String(p.sector || '')}</p>
              </div>
            ))
          )}
        </div>
      )}

      {sub === 'blog' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 space-y-2">
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="عنوان المقال" value={blogForm.title} onChange={(e) => setBlogForm((p) => ({ ...p, title: e.target.value }))} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="slug" value={blogForm.slug} onChange={(e) => setBlogForm((p) => ({ ...p, slug: e.target.value }))} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="الكاتب" value={blogForm.author} onChange={(e) => setBlogForm((p) => ({ ...p, author: e.target.value }))} />
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-28" placeholder="المحتوى" value={blogForm.content} onChange={(e) => setBlogForm((p) => ({ ...p, content: e.target.value }))} />
            <button type="button" disabled={busy} onClick={() => void saveBlog()} className="px-3 py-2 text-xs rounded-lg bg-indigo-700 text-white">
              نشر مقال
            </button>
          </div>
          <div className="rounded-xl border bg-white divide-y">
            {blog.map((b) => (
              <div key={String(b.id)} className="p-3 text-sm">
                <p className="font-semibold">{String(b.title)}</p>
                <p className="text-xs text-gray-500">/{String(b.slug)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {sub === 'forms' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 space-y-2">
            <h3 className="font-bold text-sm">اختبار نموذج «طلب استشارة» → CRM</h3>
            {['name', 'phone', 'email', 'business_name', 'city', 'service', 'message', 'utm_campaign'].map((k) => (
              <input
                key={k}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder={k}
                value={String(testForm[k as keyof typeof testForm] || '')}
                onChange={(e) => setTestForm((p) => ({ ...p, [k]: e.target.value }))}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void submitTestLead()} className="px-3 py-2 text-xs rounded-lg bg-indigo-700 text-white">
                إرسال للنموذج العام
              </button>
              <button type="button" onClick={() => void waClick()} className="px-3 py-2 text-xs rounded-lg border">
                تواصل عبر واتساب (مع تتبع)
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              endpoint عام: <code dir="ltr">POST /api/public/website/forms/consultation</code>
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-bold text-sm mb-2">النماذج المعرفة</h3>
            {forms.map((f) => (
              <div key={String(f.id)} className="text-sm border rounded-lg px-3 py-2 mb-2">
                <p className="font-semibold">{String(f.name)}</p>
                <p className="text-xs text-gray-500">slug: {String(f.slug)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {sub === 'seo' && (
        <div className="rounded-xl border bg-white p-4 space-y-3 text-sm">
          <p className="font-bold">SEO لكل صفحة</p>
          <ul className="space-y-2">
            {pages.map((p) => (
              <li key={String(p.id)} className="border rounded-lg px-3 py-2">
                <p className="font-semibold">{String(p.title)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  title: {String(p.seo_title || '—')} · description: {String(p.meta_description || '—')} ·
                  canonical: {String(p.canonical_url || '—')}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
            متاح أيضًا: <code dir="ltr">/sitemap.xml</code> و <code dir="ltr">/robots.txt</code> على استضافة Node.
          </p>
        </div>
      )}
    </div>
  );
}
