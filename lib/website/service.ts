/**
 * Light Website CMS + lead forms → existing CRM clients.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  parseUtmFromSearchParams,
  touchFromUtm,
} from '@/lib/marketing/attribution';
import {
  appendTimelineEvent,
  isMarketingCrmMemoryMode,
  resolveCrmClientFromChannel,
} from '@/lib/marketing/crm-identity';
import { marketingMemory } from '@/lib/marketing/store/memory';
import { isSupabaseConfigured, isDemoMode, supabase } from '@/lib/supabase';

function isMemoryStore() {
  return isMarketingCrmMemoryMode();
}

const DEFAULT_PAGES = [
  { title: 'الرئيسية', slug: 'home' },
  { title: 'من نحن', slug: 'about' },
  { title: 'خدماتنا', slug: 'services' },
  { title: 'مشاريعنا', slug: 'projects' },
  { title: 'القطاعات', slug: 'sectors' },
  { title: 'المدونة', slug: 'blog' },
  { title: 'تواصل معنا', slug: 'contact' },
];

const DEFAULT_SERVICES = [
  { name: 'أنظمة مكافحة الحريق', slug: 'fire-fighting', crm_service_key: 'fire_fighting' },
  { name: 'أنظمة الإنذار', slug: 'fire-alarm', crm_service_key: 'fire_alarm' },
  { name: 'الدراسات الهندسية', slug: 'engineering-studies', crm_service_key: 'studies' },
  { name: 'التصميم', slug: 'design', crm_service_key: 'design' },
  { name: 'الحسابات الهيدروليكية', slug: 'hydraulic', crm_service_key: 'hydraulic' },
  { name: 'الإشراف', slug: 'supervision', crm_service_key: 'supervision' },
  { name: 'الصيانة', slug: 'maintenance', crm_service_key: 'maintenance' },
  { name: 'خدمات السلامة', slug: 'safety', crm_service_key: 'safety' },
];

export async function getOrCreateWebsiteSite() {
  if (isMemoryStore()) {
    let site = marketingMemory.website.get();
    if (!site) {
      site = marketingMemory.website.save({
        id: randomUUID(),
        website_name: 'موقع مكتب الاستشارات',
        domain: null,
        logo_url: null,
        favicon_url: null,
        company_name: 'توقع سلامة',
        phone: null,
        whatsapp: null,
        email: null,
        address: null,
        working_hours: null,
        social_links: {},
        connection_status: 'not_connected',
        public_form_token: randomBytes(16).toString('hex'),
        seo_defaults: {},
      });
      for (const p of DEFAULT_PAGES) {
        marketingMemory.website.savePage({
          id: randomUUID(),
          site_id: site.id,
          ...p,
          content: '',
          published: p.slug === 'home',
          seo_title: p.title,
          meta_description: '',
          sort_order: 0,
        });
      }
      for (const s of DEFAULT_SERVICES) {
        marketingMemory.website.saveService({
          id: randomUUID(),
          site_id: site.id,
          ...s,
          description: '',
          published: true,
          sort_order: 0,
        });
      }
      marketingMemory.website.saveForm({
        id: randomUUID(),
        site_id: site.id,
        name: 'طلب استشارة',
        slug: 'consultation',
        fields: [
          { key: 'name', label: 'الاسم', type: 'text', required: true },
          { key: 'phone', label: 'الجوال', type: 'tel', required: true },
          { key: 'email', label: 'البريد', type: 'email', required: false },
          { key: 'business_name', label: 'اسم المنشأة', type: 'text', required: false },
          { key: 'activity_type', label: 'نوع النشاط', type: 'text', required: false },
          { key: 'city', label: 'المدينة', type: 'text', required: false },
          { key: 'service', label: 'نوع الخدمة', type: 'text', required: false },
          { key: 'building_area', label: 'مساحة المشروع', type: 'text', required: false },
          { key: 'message', label: 'الرسالة', type: 'textarea', required: false },
        ],
        thank_you_message: 'شكرًا لتواصلك — سيتواصل معك فريقنا قريبًا.',
        active: true,
      });
    }
    return site;
  }

  const { data: existing } = await supabase.from('website_sites').select('*').limit(1);
  if (existing?.[0]) return existing[0];

  const { data: created, error } = await supabase
    .from('website_sites')
    .insert({
      website_name: 'موقع مكتب الاستشارات',
      company_name: 'توقع سلامة',
      connection_status: 'not_connected',
      public_form_token: randomBytes(16).toString('hex'),
    })
    .select('*')
    .single();
  if (error || !created) throw new Error(error?.message || 'failed to create site');

  await supabase.from('website_pages').insert(
    DEFAULT_PAGES.map((p, i) => ({
      site_id: created.id,
      ...p,
      content: '',
      published: p.slug === 'home',
      seo_title: p.title,
      sort_order: i,
    }))
  );
  await supabase.from('website_services').insert(
    DEFAULT_SERVICES.map((s, i) => ({
      site_id: created.id,
      ...s,
      published: true,
      sort_order: i,
    }))
  );
  await supabase.from('website_forms').insert({
    site_id: created.id,
    name: 'طلب استشارة',
    slug: 'consultation',
    fields: [
      { key: 'name', label: 'الاسم', type: 'text', required: true },
      { key: 'phone', label: 'الجوال', type: 'tel', required: true },
      { key: 'email', label: 'البريد', type: 'email', required: false },
      { key: 'business_name', label: 'اسم المنشأة', type: 'text', required: false },
      { key: 'activity_type', label: 'نوع النشاط', type: 'text', required: false },
      { key: 'city', label: 'المدينة', type: 'text', required: false },
      { key: 'service', label: 'نوع الخدمة', type: 'text', required: false },
      { key: 'building_area', label: 'مساحة المشروع', type: 'text', required: false },
      { key: 'message', label: 'الرسالة', type: 'textarea', required: false },
    ],
    thank_you_message: 'شكرًا لتواصلك — سيتواصل معك فريقنا قريبًا.',
    active: true,
  });
  return created;
}

export async function updateWebsiteSettings(patch: Record<string, unknown>) {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) {
    return marketingMemory.website.save({
      ...(site as ReturnType<typeof marketingMemory.website.get> & object),
      ...patch,
      id: site.id,
    } as never);
  }
  const { data, error } = await supabase
    .from('website_sites')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', site.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listWebsitePages() {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) return marketingMemory.website.pages().filter((p) => p.site_id === site.id);
  const { data } = await supabase
    .from('website_pages')
    .select('*')
    .eq('site_id', site.id)
    .order('sort_order');
  return data || [];
}

export async function saveWebsitePage(input: Record<string, unknown>) {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) {
    return marketingMemory.website.savePage({
      id: input.id || randomUUID(),
      site_id: site.id,
      ...input,
      updated_at: new Date().toISOString(),
    });
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('website_pages')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from('website_pages')
    .insert({ ...input, site_id: site.id })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listWebsiteServices() {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) return marketingMemory.website.services().filter((s) => s.site_id === site.id);
  const { data } = await supabase
    .from('website_services')
    .select('*')
    .eq('site_id', site.id)
    .order('sort_order');
  return data || [];
}

export async function saveWebsiteService(input: Record<string, unknown>) {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) {
    return marketingMemory.website.saveService({
      id: input.id || randomUUID(),
      site_id: site.id,
      ...input,
    });
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('website_services')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from('website_services')
    .insert({ ...input, site_id: site.id })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listWebsiteForms() {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) return marketingMemory.website.forms().filter((f) => f.site_id === site.id);
  const { data } = await supabase.from('website_forms').select('*').eq('site_id', site.id);
  return data || [];
}

export async function saveWebsiteForm(input: Record<string, unknown>) {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) {
    return marketingMemory.website.saveForm({
      id: input.id || randomUUID(),
      site_id: site.id,
      ...input,
    });
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('website_forms')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from('website_forms')
    .insert({ ...input, site_id: site.id })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listBlogPosts() {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) return marketingMemory.website.blog().filter((b) => b.site_id === site.id);
  const { data } = await supabase
    .from('website_blog_posts')
    .select('*')
    .eq('site_id', site.id)
    .order('publish_date', { ascending: false });
  return data || [];
}

export async function saveBlogPost(input: Record<string, unknown>) {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) {
    return marketingMemory.website.saveBlog({
      id: input.id || randomUUID(),
      site_id: site.id,
      ...input,
      updated_at: new Date().toISOString(),
    });
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('website_blog_posts')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from('website_blog_posts')
    .insert({ ...input, site_id: site.id })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listProjectShowcases() {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) return marketingMemory.website.showcases().filter((s) => s.site_id === site.id);
  const { data } = await supabase
    .from('website_project_showcases')
    .select('*, clients:client_id(id, client_code, business_name, city, activity_type)')
    .eq('site_id', site.id)
    .order('sort_order');
  return data || [];
}

export async function saveProjectShowcase(input: Record<string, unknown>) {
  const site = await getOrCreateWebsiteSite();
  if (isMemoryStore()) {
    return marketingMemory.website.saveShowcase({
      id: input.id || randomUUID(),
      site_id: site.id,
      ...input,
    });
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('website_project_showcases')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from('website_project_showcases')
    .insert({ ...input, site_id: site.id })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export type FormSubmitInput = {
  formSlug: string;
  payload: Record<string, unknown>;
  utm?: Record<string, string | null | undefined>;
  landing_page?: string | null;
  referrer?: string | null;
  user_agent?: string | null;
  ip?: string | null;
};

/** Website form → Lead/Client on existing CRM. */
export async function submitWebsiteForm(input: FormSubmitInput) {
  await getOrCreateWebsiteSite();
  const forms = await listWebsiteForms();
  const form = forms.find((f) => f.slug === input.formSlug && f.active !== false);
  if (!form) throw new Error('النموذج غير موجود أو غير مفعّل');

  const utm = parseUtmFromSearchParams({
    ...(input.utm || {}),
    landing_page: input.landing_page || undefined,
    referrer: input.referrer || undefined,
  });
  if (!utm.utm_source) utm.utm_source = 'website';
  if (!utm.utm_medium) utm.utm_medium = 'website_form';
  const touch = touchFromUtm(utm, 'Website');

  const phone = String(input.payload.phone || input.payload.الجوال || '');
  const email = String(input.payload.email || input.payload.البريد || '');
  const name = String(input.payload.name || input.payload.الاسم || '');
  const business = String(input.payload.business_name || input.payload.اسم_المنشأة || '');
  const message = String(input.payload.message || input.payload.الرسالة || '');
  const service = String(input.payload.service || input.payload.نوع_الخدمة || '');

  const client = await resolveCrmClientFromChannel({
    phone: phone || null,
    email: email || null,
    displayName: name || null,
    businessName: business || null,
    city: String(input.payload.city || '') || null,
    activityType: String(input.payload.activity_type || '') || null,
    serviceKey: service || (form.default_service_key as string) || null,
    messagePreview: message || `طلب عبر نموذج ${form.name}`,
    platform: 'website',
    platformUserId: email || phone || `form:${form.slug}:${name}`,
    touch: {
      ...touch,
      campaign: utm.utm_campaign || (form.marketing_campaign_id as string) || null,
    },
  });

  const submission = {
    id: randomUUID(),
    form_id: form.id as string,
    customer_id: client.id,
    payload: input.payload,
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
    landing_page: input.landing_page || null,
    referrer: input.referrer || null,
    ip_hash: input.ip ? createHash('sha256').update(input.ip).digest('hex').slice(0, 16) : null,
    user_agent: input.user_agent || null,
    created_at: new Date().toISOString(),
  };

  if (isMemoryStore()) {
    marketingMemory.website.addSubmission(submission);
  } else {
    await supabase.from('website_form_submissions').insert(submission);
  }

  await appendTimelineEvent({
    customer_id: client.id,
    event_type: 'website_form',
    channel: 'website',
    title: `نموذج موقع: ${form.name}`,
    body: message || null,
    related_entity_type: 'website_form',
    related_entity_id: String(form.id),
  });

  return {
    ok: true,
    client,
    createdLead: client.createdLead,
    thank_you_message: form.thank_you_message || 'تم استلام طلبك',
  };
}

/** Track WhatsApp click from website with attribution when possible. */
export async function trackWebsiteWhatsAppClick(input: {
  phone?: string | null;
  utm?: Record<string, string | null | undefined>;
  landing_page?: string | null;
  referrer?: string | null;
}) {
  const site = await getOrCreateWebsiteSite();
  const wa = site.whatsapp || site.phone;
  const utm = parseUtmFromSearchParams({
    ...(input.utm || {}),
    utm_source: input.utm?.utm_source || 'website',
    utm_medium: input.utm?.utm_medium || 'whatsapp_button',
    landing_page: input.landing_page || undefined,
    referrer: input.referrer || undefined,
  });
  const touch = touchFromUtm(utm, 'Website');

  let client = null as Awaited<ReturnType<typeof resolveCrmClientFromChannel>> | null;
  if (input.phone) {
    client = await resolveCrmClientFromChannel({
      phone: input.phone,
      messagePreview: 'نقر على زر واتساب في الموقع',
      touch: { ...touch, channel: 'whatsapp' },
      platform: 'website',
      platformUserId: `wa_click:${input.phone}`,
    });
    await appendTimelineEvent({
      customer_id: client.id,
      event_type: 'website_whatsapp_click',
      channel: 'whatsapp',
      title: 'نقر واتساب من الموقع',
      body: input.landing_page || null,
    });
  }

  const digits = String(wa || '').replace(/\D/g, '');
  const url = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent('مرحبا، أرغب بالتواصل بخصوص خدمات السلامة')}`
    : null;

  return {
    ok: true,
    whatsapp_url: url,
    site_whatsapp: wa,
    client,
    attribution: touch,
    note: client
      ? 'تم ربط النقرة بعميل/Lead عند توفر رقم'
      : 'بدون رقم زائر تُحفظ الحملة في الجلسة فقط — اربط المحادثة لاحقًا عبر واتساب CRM',
  };
}

export async function buildSitemapXml(origin: string) {
  const pages = await listWebsitePages();
  const published = pages.filter((p) => p.published);
  const urls = published
    .map(
      (p) =>
        `  <url><loc>${origin}/w/${p.slug}</loc><lastmod>${new Date(String(p.updated_at || Date.now())).toISOString()}</lastmod></url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export function robotsTxt(origin: string) {
  return `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
}

export async function getWebsiteBundle() {
  const site = await getOrCreateWebsiteSite();
  const [pages, services, forms, blog, showcases] = await Promise.all([
    listWebsitePages(),
    listWebsiteServices(),
    listWebsiteForms(),
    listBlogPosts(),
    listProjectShowcases(),
  ]);
  return {
    site: {
      ...site,
      // never expose internal tokens to casual UI — form token only for embed settings
    },
    pages,
    services,
    forms,
    blog,
    showcases,
    memoryMode: isMemoryStore() || isDemoMode || !isSupabaseConfigured,
  };
}
