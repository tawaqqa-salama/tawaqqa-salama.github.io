import { beforeEach, describe, expect, it } from 'vitest';
import { buildAttributionPatch, parseUtmFromSearchParams, touchFromUtm } from '@/lib/marketing/attribution';
import { resolveCrmClientFromChannel } from '@/lib/marketing/crm-identity';
import { marketingMemory } from '@/lib/marketing/store/memory';
import { runMarketingAiAssist } from '@/lib/marketing/ai-assist';
import { hasSocialPermission, hasWebsitePermission } from '@/lib/social/permissions';
import { getSocialProvider } from '@/lib/social/provider';
import {
  createOrUpdatePost,
  ingestInboundSocialMessage,
  listInbox,
  publishPostNow,
  startOAuth,
  completeOAuth,
} from '@/lib/social/service';
import { submitWebsiteForm, trackWebsiteWhatsAppClick, getOrCreateWebsiteSite } from '@/lib/website/service';
import { saveMarketingCampaign, campaignPerformance } from '@/lib/marketing/campaigns';
import { POST as inboundPost } from '@/app/api/integrations/social/inbound/route';
import { POST as publicFormPost } from '@/app/api/public/website/forms/[slug]/route';
import { testAuthCookie } from '@/tests/helpers/auth-cookie';

describe('Social + Website CRM hub', () => {
  beforeEach(() => {
    process.env.SOCIAL_FORCE_MEMORY = 'true';
    process.env.SOCIAL_PROVIDER_MODE = 'demo';
    process.env.WHATSAPP_FORCE_MEMORY = 'true';
    marketingMemory.reset();
  });

  it('parses UTM and builds first/last touch attribution', () => {
    const utm = parseUtmFromSearchParams({
      utm_source: 'instagram',
      utm_medium: 'paid_social',
      utm_campaign: 'factories_jeddah',
      utm_content: 'carousel_1',
      landing_page: '/services/fire',
    });
    const touch = touchFromUtm(utm);
    expect(touch.source).toBe('Instagram');
    expect(touch.channel).toBe('social_media');
    const first = buildAttributionPatch(null, touch);
    expect(first.first_touch_source).toBe('Instagram');
    expect(first.last_touch_source).toBe('Instagram');
    const second = buildAttributionPatch(
      { first_touch_source: 'Google', lead_source: 'Google', attribution: {} },
      { source: 'Website', medium: 'website_form', channel: 'website' }
    );
    expect(second.first_touch_source).toBeUndefined();
    expect(second.last_touch_source).toBe('Website');
  });

  it('creates lead from Instagram inbound and links existing client on second message', async () => {
    const first = await ingestInboundSocialMessage({
      platform: 'instagram',
      platformUserId: 'ig_user_1',
      contactName: 'مصنع جدة',
      text: 'أحتاج تصميم نظام إطفاء لمصنع في جدة.',
    });
    expect(first.client.createdLead).toBe(true);
    expect(first.client.lead_source).toBe('Instagram');
    expect(first.client.source_channel).toBe('social_media');

    const second = await ingestInboundSocialMessage({
      platform: 'instagram',
      platformUserId: 'ig_user_1',
      contactName: 'مصنع جدة',
      text: 'متى يمكنكم الزيارة؟',
    });
    expect(second.client.createdLead).toBe(false);
    expect(second.client.id).toBe(first.client.id);

    const inbox = await listInbox();
    expect(inbox.length).toBe(1);
    expect(inbox[0].customer?.id).toBe(first.client.id);
  });

  it('prevents duplicate clients when same phone arrives from website after social', async () => {
    const social = await resolveCrmClientFromChannel({
      phone: '+966501112233',
      platform: 'facebook',
      platformUserId: 'fb_99',
      displayName: 'أحمد',
      messagePreview: 'استفسار',
      touch: { source: 'Facebook', medium: 'social', channel: 'social_media' },
    });
    expect(social.createdLead).toBe(true);

    const site = await getOrCreateWebsiteSite('co-tawaqqa');
    const web = await submitWebsiteForm({
      formSlug: 'consultation',
      publicFormToken: site.public_form_token!,
      payload: {
        name: 'أحمد',
        phone: '0501112233',
        email: 'a@example.com',
        message: 'طلب استشارة من الموقع',
      },
      utm: { utm_source: 'website', utm_medium: 'website_form', utm_campaign: 'spring' },
      landing_page: '/contact',
    });
    expect(web.client.id).toBe(social.id);
    expect(web.createdLead).toBe(false);
    expect(web.client.last_touch_source).toBe('Website');
  });

  it('website form creates CRM lead with attribution', async () => {
    const site = await getOrCreateWebsiteSite('co-tawaqqa');
    const res = await submitWebsiteForm({
      formSlug: 'consultation',
      publicFormToken: site.public_form_token!,
      payload: {
        name: 'سارة',
        phone: '0556677889',
        business_name: 'مستودع الشرق',
        city: 'الدمام',
        service: 'fire_alarm',
        message: 'أحتاج نظام إنذار',
      },
      utm: {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'safety_ads',
        utm_content: 'ad1',
      },
      landing_page: '/services',
      referrer: 'https://google.com',
    });
    expect(res.ok).toBe(true);
    expect(res.createdLead).toBe(true);
    expect(res.client.lead_source).toBe('Google');
    expect(res.client.source_channel).toBe('google');
  });

  it('tracks website WhatsApp click attribution when phone provided', async () => {
    const site = await getOrCreateWebsiteSite('co-tawaqqa');
    const res = await trackWebsiteWhatsAppClick({
      publicFormToken: site.public_form_token!,
      phone: '0550001111',
      utm: { utm_source: 'website', utm_medium: 'whatsapp_button' },
      landing_page: '/',
    });
    expect(res.ok).toBe(true);
    expect(res.client?.createdLead).toBe(true);
  });

  it('demo OAuth connect + publish post per platform adapter', async () => {
    const start = await startOAuth('instagram', 'http://localhost:3000');
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const done = await completeOAuth('instagram', 'demo_instagram', 'http://localhost:3000', start.data.state);
    expect(done.ok).toBe(true);

    const post = await createOrUpdatePost({
      title: 'سلامة المصانع',
      content: 'خدمات الإطفاء والسلامة',
      platforms: ['instagram', 'tiktok'],
      status: 'draft',
    });
    expect(post).toBeTruthy();
    const pub = await publishPostNow((post as { id: string }).id);
    expect(pub.ok).toBe(true);
  });

  it('marks unsupported publish clearly for live TikTok text-only', async () => {
    process.env.SOCIAL_PROVIDER_MODE = 'live';
    const provider = getSocialProvider('tiktok');
    const result = await provider.publishPost('token', { content: 'hello' });
    expect(result.ok).toBe(false);
    expect(result.supported).toBe(false);
  });

  it('campaign performance links leads via utm_campaign', async () => {
    const campaign = await saveMarketingCampaign({
      name: 'خدمات السلامة للمصانع',
      channels: ['instagram', 'website'],
      status: 'active',
      budget: 1000,
    });
    await resolveCrmClientFromChannel({
      phone: '0551212121',
      displayName: 'مصنع',
      touch: {
        source: 'Instagram',
        medium: 'social',
        campaign: campaign.utm_campaign,
        channel: 'social_media',
      },
    });
    const perf = await campaignPerformance(campaign.id);
    expect(perf[0].leads).toBeGreaterThanOrEqual(1);
  });

  it('AI assist never auto-publishes', async () => {
    const blocked = await runMarketingAiAssist({
      kind: 'suggest_post',
      text: 'سلامة',
      allowPublish: true,
    });
    expect(blocked.ok).toBe(false);
    const draft = await runMarketingAiAssist({ kind: 'hashtags', text: 'سلامة' });
    expect(draft.ok).toBe(true);
    expect(draft.auto_publish).toBe(false);
  });

  it('enforces social/website permission codes', () => {
    expect(hasSocialPermission(['dept.marketing'], 'social.view')).toBe(true);
    expect(hasSocialPermission(['dept.marketing'], 'social.accounts')).toBe(false);
    expect(hasSocialPermission(['social.accounts'], 'social.accounts')).toBe(true);
    expect(hasWebsitePermission(['dept.marketing'], 'website.view')).toBe(true);
    expect(hasWebsitePermission(['dept.marketing'], 'website.settings')).toBe(false);
    expect(hasWebsitePermission(['*'], 'website.settings')).toBe(true);
  });

  it('inbound API creates CRM lead', async () => {
    const res = await inboundPost(
      new Request('http://localhost/api/integrations/social/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: testAuthCookie() },
        body: JSON.stringify({
          platform: 'linkedin',
          platformUserId: 'li_1',
          contactName: 'مهندس',
          text: 'نحتاج دراسة سلامة',
        }),
      })
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.createdLead).toBe(true);
  });

  it('public website form API works without session', async () => {
    const site = await getOrCreateWebsiteSite('co-tawaqqa');
    const res = await publicFormPost(
      new Request('http://localhost/api/public/website/forms/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_form_token: site.public_form_token,
          payload: { name: 'خالد', phone: '0544443333', message: 'مرحبا' },
          utm: { utm_source: 'facebook', utm_medium: 'social' },
        }),
      }),
      { params: Promise.resolve({ slug: 'consultation' }) }
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.client.lead_source).toBe('Facebook');
  });

  it('public website form rejects missing token', async () => {
    await getOrCreateWebsiteSite('co-tawaqqa');
    const res = await publicFormPost(
      new Request('http://localhost/api/public/website/forms/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { name: 'خالد', phone: '0544443333', message: 'مرحبا' },
        }),
      }),
      { params: Promise.resolve({ slug: 'consultation' }) }
    );
    expect(res.status).toBe(401);
  });
});
