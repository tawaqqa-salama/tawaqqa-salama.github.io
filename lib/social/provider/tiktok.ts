import { BaseSocialProvider } from '@/lib/social/provider/base';
import { fail, ok, unsupported } from '@/lib/social/provider/types';
import type { ConnectedProfile } from '@/lib/social/provider/types';
import type { ProviderCapability } from '@/lib/social/types';

/** TikTok Login Kit / Content Posting API (official). */
export class TikTokProvider extends BaseSocialProvider {
  readonly platform = 'tiktok' as const;
  readonly id = 'tiktok';

  capabilities(): ProviderCapability[] {
    return ['oauth', 'publish', 'analytics'];
  }

  async connect(input?: { redirectUri: string; state: string }) {
    const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    if (!clientKey || !input?.redirectUri) {
      return unsupported('أضف TIKTOK_CLIENT_KEY و TIKTOK_CLIENT_SECRET (TikTok Developers).');
    }
    const authorizeUrl =
      `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${encodeURIComponent(clientKey)}` +
      `&scope=${encodeURIComponent('user.info.basic,video.publish,video.list')}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
      `&state=${encodeURIComponent(input.state)}`;
    return ok({ authorizeUrl, state: input.state });
  }

  async handleOAuthCallback(input: { code: string; redirectUri: string }) {
    const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
    if (!clientKey || !clientSecret) return unsupported('بيانات TikTok غير مضبوطة.');
    try {
      const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code: input.code,
          grant_type: 'authorization_code',
          redirect_uri: input.redirectUri,
        }),
      });
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        open_id?: string;
        error_description?: string;
      };
      if (!json.access_token) return fail(json.error_description || 'TikTok token exchange failed');
      const profile: ConnectedProfile = {
        accountId: String(json.open_id || 'tiktok'),
        accountName: 'TikTok',
        accessToken: json.access_token,
        refreshToken: json.refresh_token || null,
        tokenExpiry: json.expires_in
          ? new Date(Date.now() + json.expires_in * 1000).toISOString()
          : null,
        profileUrl: null,
        avatarUrl: null,
        scopes: [],
      };
      return ok(profile);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'TikTok OAuth error');
    }
  }

  async publishPost() {
    return unsupported(
      'نشر TikTok يتطلب Content Posting API مع رفع فيديو ومراجعة صلاحيات — النص فقط غير كافٍ.'
    );
  }

  async getMessages() {
    return unsupported('رسائل TikTok غير متاحة عبر API العامة الحالية.');
  }
}
