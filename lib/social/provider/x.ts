import { BaseSocialProvider } from '@/lib/social/provider/base';
import { fail, ok, unsupported } from '@/lib/social/provider/types';
import type { ConnectedProfile, SocialPostInput } from '@/lib/social/provider/types';
import type { ProviderCapability } from '@/lib/social/types';

/** X (Twitter) API v2 — OAuth 2.0 PKCE recommended; client credentials from env. */
export class XProvider extends BaseSocialProvider {
  readonly platform = 'x' as const;
  readonly id = 'x';

  capabilities(): ProviderCapability[] {
    return ['oauth', 'publish', 'analytics'];
  }

  async connect(input?: { redirectUri: string; state: string }) {
    const clientId = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || '';
    if (!clientId || !input?.redirectUri) {
      return unsupported('أضف X_CLIENT_ID و X_CLIENT_SECRET (X Developer Portal).');
    }
    const scope = encodeURIComponent('tweet.read tweet.write users.read offline.access');
    const authorizeUrl =
      `https://twitter.com/i/oauth2/authorize?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(input.state)}` +
      `&code_challenge=challenge&code_challenge_method=plain`;
    return ok({ authorizeUrl, state: input.state });
  }

  async handleOAuthCallback(input: { code: string; redirectUri: string }) {
    const clientId = process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID || '';
    const clientSecret = process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return unsupported('بيانات X غير مضبوطة.');
    try {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const res = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: input.code,
          grant_type: 'authorization_code',
          redirect_uri: input.redirectUri,
          code_verifier: 'challenge',
        }),
      });
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error_description?: string;
      };
      if (!json.access_token) return fail(json.error_description || 'X token exchange failed');
      const meRes = await fetch('https://api.twitter.com/2/users/me', {
        headers: { Authorization: `Bearer ${json.access_token}` },
      });
      const me = (await meRes.json()) as { data?: { id?: string; name?: string; username?: string } };
      const profile: ConnectedProfile = {
        accountId: String(me.data?.id || 'x'),
        accountName: String(me.data?.name || me.data?.username || 'X'),
        profileUrl: me.data?.username ? `https://x.com/${me.data.username}` : null,
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
      return fail(e instanceof Error ? e.message : 'X OAuth error');
    }
  }

  async publishPost(accessToken: string, input: SocialPostInput) {
    try {
      const res = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: input.content.slice(0, 280) }),
      });
      const json = (await res.json()) as { data?: { id?: string }; detail?: string; title?: string };
      if (!res.ok) return fail(json.detail || json.title || 'X publish failed');
      return ok({ platformPostId: String(json.data?.id || '') });
    } catch (e) {
      return fail(e instanceof Error ? e.message : 'X publish error');
    }
  }

  async getMessages() {
    return unsupported('رسائل X المباشرة تتطلب منتج DM API بصلاحيات معتمدة من X.');
  }
}
