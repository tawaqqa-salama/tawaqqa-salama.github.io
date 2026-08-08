import { BaseSocialProvider } from '@/lib/social/provider/base';
import { fail, ok, unsupported } from '@/lib/social/provider/types';
import type { ConnectedProfile } from '@/lib/social/provider/types';
import type { ProviderCapability } from '@/lib/social/types';

/** YouTube Data API via Google OAuth (official). */
export class YouTubeProvider extends BaseSocialProvider {
  readonly platform = 'youtube' as const;
  readonly id = 'youtube';

  capabilities(): ProviderCapability[] {
    return ['oauth', 'publish', 'analytics'];
  }

  async connect(input?: { redirectUri: string; state: string }) {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '';
    if (!clientId || !input?.redirectUri) {
      return unsupported('أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET مع تفعيل YouTube Data API.');
    }
    const scope = encodeURIComponent(
      'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload'
    );
    const authorizeUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(input.state)}` +
      `&access_type=offline&prompt=consent`;
    return ok({ authorizeUrl, state: input.state });
  }

  async handleOAuthCallback(input: { code: string; redirectUri: string }) {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return unsupported('بيانات Google/YouTube غير مضبوطة.');
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: input.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: input.redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error_description?: string;
      };
      if (!json.access_token) return fail(json.error_description || 'Google token exchange failed');
      const chRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${json.access_token}` } }
      );
      const ch = (await chRes.json()) as {
        items?: Array<{ id?: string; snippet?: { title?: string; customUrl?: string } }>;
      };
      const item = ch.items?.[0];
      const profile: ConnectedProfile = {
        accountId: String(item?.id || 'youtube'),
        accountName: String(item?.snippet?.title || 'YouTube'),
        profileUrl: item?.snippet?.customUrl
          ? `https://youtube.com/${item.snippet.customUrl}`
          : null,
        accessToken: json.access_token,
        refreshToken: json.refresh_token || null,
        tokenExpiry: json.expires_in
          ? new Date(Date.now() + json.expires_in * 1000).toISOString()
          : null,
        avatarUrl: null,
        scopes: [],
      };
      return ok(profile);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'YouTube OAuth error');
    }
  }

  async publishPost() {
    return unsupported(
      'رفع فيديو YouTube يتطلب multipart upload عبر Data API — ليس نشر نص/صورة كمنصات أخرى.'
    );
  }

  async getMessages() {
    return unsupported('لا توجد رسائل واردة عامة عبر YouTube Data API بهذا الشكل.');
  }
}
