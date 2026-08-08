/**
 * Meta Graph API provider for Instagram + Facebook (official OAuth + messaging + publishing).
 * Requires META_APP_ID / META_APP_SECRET (or FACEBOOK_APP_*).
 * No scraping / browser automation.
 */

import { BaseSocialProvider } from '@/lib/social/provider/base';
import { fail, ok, unsupported } from '@/lib/social/provider/types';
import type { ConnectedProfile, SocialPostInput } from '@/lib/social/provider/types';
import type { ProviderCapability, SocialPlatform } from '@/lib/social/types';

function metaApp() {
  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '';
  const version = process.env.META_API_VERSION || process.env.WHATSAPP_API_VERSION || 'v21.0';
  return { appId, appSecret, version };
}

async function graphGet(path: string, accessToken: string, version: string) {
  const url = `https://graph.facebook.com/${version}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message || res.statusText;
    throw new Error(err);
  }
  return json;
}

async function graphPost(path: string, accessToken: string, version: string, body: Record<string, unknown>) {
  const url = `https://graph.facebook.com/${version}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: accessToken }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message || res.statusText;
    throw new Error(err);
  }
  return json;
}

export class MetaSocialProvider extends BaseSocialProvider {
  constructor(public readonly platform: 'instagram' | 'facebook') {
    super();
  }
  readonly id = `meta:${this.platform}`;

  capabilities(): ProviderCapability[] {
    return ['oauth', 'messages', 'comments', 'publish', 'analytics', 'media'];
  }

  async connect(input?: { redirectUri: string; state: string }) {
    const { appId, version } = metaApp();
    if (!appId || !input?.redirectUri) {
      return unsupported(
        'أضف META_APP_ID و META_APP_SECRET ثم سجّل Redirect URI في Meta Developer Console.'
      );
    }
    const scopes =
      this.platform === 'instagram'
        ? 'instagram_basic,instagram_manage_messages,instagram_content_publish,pages_show_list,pages_read_engagement,business_management'
        : 'pages_show_list,pages_messaging,pages_manage_posts,pages_read_engagement,business_management';
    const authorizeUrl =
      `https://www.facebook.com/${version}/dialog/oauth` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
      `&state=${encodeURIComponent(input.state)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_type=code`;
    return ok({ authorizeUrl, state: input.state });
  }

  async handleOAuthCallback(input: { code: string; redirectUri: string }) {
    const { appId, appSecret, version } = metaApp();
    if (!appId || !appSecret) {
      return unsupported('META_APP_ID / META_APP_SECRET غير مضبوطين.');
    }
    try {
      const tokenUrl =
        `https://graph.facebook.com/${version}/oauth/access_token` +
        `?client_id=${encodeURIComponent(appId)}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
        `&code=${encodeURIComponent(input.code)}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenJson = (await tokenRes.json()) as {
        access_token?: string;
        expires_in?: number;
        error?: { message?: string };
      };
      if (!tokenJson.access_token) {
        return fail(tokenJson.error?.message || 'فشل تبادل رمز OAuth مع Meta');
      }
      const me = await graphGet('/me?fields=id,name', tokenJson.access_token, version);
      const profile: ConnectedProfile = {
        accountId: String(me.id),
        accountName: String(me.name || this.platform),
        profileUrl: `https://facebook.com/${me.id}`,
        avatarUrl: null,
        accessToken: tokenJson.access_token,
        refreshToken: null,
        tokenExpiry: tokenJson.expires_in
          ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
          : null,
        scopes: [],
      };
      return ok(profile);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'Meta OAuth error');
    }
  }

  async getProfile(accessToken: string) {
    const { version } = metaApp();
    try {
      const me = await graphGet('/me?fields=id,name', accessToken, version);
      return ok({
        accountId: String(me.id),
        accountName: String(me.name || this.platform),
        profileUrl: `https://facebook.com/${me.id}`,
        avatarUrl: null,
        tokenExpiry: null,
        scopes: [],
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'getProfile failed');
    }
  }

  async publishPost(accessToken: string, input: SocialPostInput) {
    const { version } = metaApp();
    try {
      // Page posting requires a Page access token + page id in production.
      // Here we attempt /me/feed which works for user tokens with pages_manage_posts on a Page token.
      const json = await graphPost('/me/feed', accessToken, version, { message: input.content });
      const id = String(json.id || json.post_id || '');
      if (!id) return fail('لم يُرجع Meta معرّف منشور');
      return ok({ platformPostId: id });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'publish failed');
    }
  }

  async getAnalytics(accessToken: string) {
    const { version } = metaApp();
    try {
      const me = await graphGet('/me?fields=id,name', accessToken, version);
      return ok({
        followers: undefined,
        posts: undefined,
        reach: undefined,
        impressions: undefined,
        engagement: undefined,
        accountId: me.id,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'analytics failed');
    }
  }

  async getMessages() {
    return unsupported(
      'استلام رسائل Messenger/Instagram يتم عبر Webhooks الرسمية (Meta) وليس polling عام بدون Page token مخصّص.'
    );
  }
}

export function createMetaProvider(platform: Extract<SocialPlatform, 'instagram' | 'facebook'>) {
  return new MetaSocialProvider(platform);
}
