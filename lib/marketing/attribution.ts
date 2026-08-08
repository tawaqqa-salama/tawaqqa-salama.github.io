/** UTM + first/last-touch attribution for the existing clients CRM spine. */

export type UtmParams = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
};

export type AttributionTouch = {
  source: string;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  channel?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
};

export type ClientAttributionPatch = {
  lead_source?: string | null;
  source_channel?: string | null;
  first_touch_source?: string | null;
  first_touch_medium?: string | null;
  first_touch_campaign?: string | null;
  first_touch_content?: string | null;
  last_touch_source?: string | null;
  last_touch_medium?: string | null;
  last_touch_campaign?: string | null;
  last_touch_content?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  attribution?: Record<string, unknown>;
};

const SOURCE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
  twitter: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  google: 'Google',
  google_business: 'Google Business',
  website: 'Website',
  phone: 'Phone',
  referral: 'Referral',
  campaign: 'Campaign',
  other: 'Other',
};

export function normalizeSourceLabel(raw: string | null | undefined): string {
  if (!raw) return 'Other';
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
  return SOURCE_LABEL[key] || raw.trim();
}

export function channelFromSource(source: string): string {
  const key = source.trim().toLowerCase().replace(/\s+/g, '_');
  if (key === 'whatsapp') return 'whatsapp';
  if (key === 'website') return 'website';
  if (['instagram', 'facebook', 'linkedin', 'x', 'twitter', 'tiktok', 'youtube', 'google_business'].includes(key)) {
    return 'social_media';
  }
  return key || 'other';
}

export function parseUtmFromSearchParams(
  params: URLSearchParams | Record<string, string | undefined | null>
): UtmParams {
  const get = (k: string) => {
    if (params instanceof URLSearchParams) return params.get(k);
    return params[k] ?? null;
  };
  return {
    utm_source: get('utm_source'),
    utm_medium: get('utm_medium'),
    utm_campaign: get('utm_campaign'),
    utm_content: get('utm_content'),
    landing_page: get('landing_page') || get('lp'),
    referrer: get('referrer') || get('ref'),
  };
}

export function touchFromUtm(utm: UtmParams, fallbackSource = 'Website'): AttributionTouch {
  const source = normalizeSourceLabel(utm.utm_source || fallbackSource);
  return {
    source,
    medium: utm.utm_medium || 'website',
    campaign: utm.utm_campaign || null,
    content: utm.utm_content || null,
    channel: channelFromSource(source),
    landing_page: utm.landing_page || null,
    referrer: utm.referrer || null,
  };
}

/** Merge attribution onto an existing client row (first touch only if empty). */
export function buildAttributionPatch(
  existing: {
    first_touch_source?: string | null;
    lead_source?: string | null;
    attribution?: Record<string, unknown> | null;
  } | null | undefined,
  touch: AttributionTouch,
  opts?: { setLeadSourceIfEmpty?: boolean }
): ClientAttributionPatch {
  const setLead = opts?.setLeadSourceIfEmpty !== false;
  const hasFirst = Boolean(existing?.first_touch_source);
  const patch: ClientAttributionPatch = {
    last_touch_source: touch.source,
    last_touch_medium: touch.medium ?? null,
    last_touch_campaign: touch.campaign ?? null,
    last_touch_content: touch.content ?? null,
    utm_source: touch.source,
    utm_medium: touch.medium ?? null,
    utm_campaign: touch.campaign ?? null,
    utm_content: touch.content ?? null,
    landing_page: touch.landing_page ?? null,
    referrer: touch.referrer ?? null,
    source_channel: touch.channel ?? channelFromSource(touch.source),
    attribution: {
      ...(existing?.attribution || {}),
      last_touch_at: new Date().toISOString(),
      last_touch: touch,
    },
  };

  if (!hasFirst) {
    patch.first_touch_source = touch.source;
    patch.first_touch_medium = touch.medium ?? null;
    patch.first_touch_campaign = touch.campaign ?? null;
    patch.first_touch_content = touch.content ?? null;
    patch.attribution = {
      ...patch.attribution,
      first_touch_at: new Date().toISOString(),
      first_touch: touch,
    };
  }

  if (setLead && !existing?.lead_source) {
    patch.lead_source = touch.source;
  }

  return patch;
}
