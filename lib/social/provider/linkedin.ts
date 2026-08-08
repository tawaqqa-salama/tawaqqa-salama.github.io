import { BaseSocialProvider } from '@/lib/social/provider/base';
import { fail, ok, unsupported } from '@/lib/social/provider/types';
import type { ConnectedProfile, SocialPostInput } from '@/lib/social/provider/types';
import type { ProviderCapability } from '@/lib/social/types';

/**
 * LinkedIn Marketing / Community Management API (official OAuth).
 * Messaging APIs are restricted — methods return unsupported when not available.
 */
export class LinkedInProvider extends BaseSocialProvider {
  readonly platform = 'linkedin' as const;
  readonly id = 'linkedin';

  capabilities(): ProviderCapability[] {
    return ['oauth', 'publish', 'analytics'];
  }

  async connect(input?: { redirectUri: string; state: string }) {
    const clientId = process.env.LINKEDIN_CLIENT_ID || '';
    if (!clientId || !input?.redirectUri) {
      return unsupported('أضف LINKEDIN_CLIENT_ID و LINKEDIN_CLIENT_SECRET في البيئة.');
    }
    const scope = encodeURIComponent('openid profile w_member_social');
    const authorizeUrl =
      `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
      `&state=${encodeURIComponent(input.state)}` +
      `&scope=${scope}`;
    return ok({ authorizeUrl, state: input.state });
  }

  async handleOAuthCallback(input: { code: string; redirectUri: string }) {
    const clientId = process.env.LINKEDIN_CLIENT_ID || '';
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return unsupported('بيانات LinkedIn غير مضبوطة.');
    try {
      const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: input.code,
          redirect_uri: input.redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error_description?: string;
      };
      if (!json.access_token) return fail(json.error_description || 'LinkedIn token exchange failed');

      const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${json.access_token}` },
      });
      const me = (await meRes.json()) as { sub?: string; name?: string };
      const profile: ConnectedProfile = {
        accountId: String(me.sub || 'linkedin'),
        accountName: String(me.name || 'LinkedIn'),
        accessToken: json.access_token,
        refreshToken: json.refresh_token || null,
        tokenExpiry: json.expires_in
          ? new Date(Date.now() + json.expires_in * 1000).toISOString()
          : null,
        profileUrl: null,
        avatarUrl: null,
        scopes: ['openid', 'profile', 'w_member_social'],
      };
      return ok(profile);
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'LinkedIn OAuth error');
    }
  }

  async publishPost(accessToken: string, input: SocialPostInput) {
    // UGC posts require person URN — attempt userinfo then ugcPosts
    try {
      const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const me = (await meRes.json()) as { sub?: string };
      if (!me.sub) return fail('تعذر الحصول على LinkedIn member URN');
      const author = `urn:li:person:${me.sub}`;
      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: input.content },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      });
      const json = (await res.json()) as { id?: string; message?: string };
      if (!res.ok) return fail(json.message || 'LinkedIn publish failed');
      return ok({ platformPostId: String(json.id || '') });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'LinkedIn publish error');
    }
  }

  async getMessages() {
    return unsupported('رسائل LinkedIn غير متاحة عبر API العامة الحالية (صلاحيات مقيدة).');
  }
}
