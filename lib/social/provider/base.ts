import type { ProviderCapability, SocialPlatform } from '@/lib/social/types';
import type {
  ConnectedProfile,
  OAuthStartResult,
  ProviderResult,
  SocialAnalytics,
  SocialMediaProvider,
  SocialMessageItem,
  SocialPostInput,
} from '@/lib/social/provider/types';
import { ok, unsupported } from '@/lib/social/provider/types';

/** Shared defaults: return unsupported unless overridden. */
export abstract class BaseSocialProvider implements SocialMediaProvider {
  abstract readonly platform: SocialPlatform;
  abstract readonly id: string;
  abstract capabilities(): ProviderCapability[];

  supports(capability: ProviderCapability): boolean {
    return this.capabilities().includes(capability);
  }

  async connect(input?: {
    redirectUri: string;
    state: string;
  }): Promise<ProviderResult<OAuthStartResult>> {
    void input;
    return unsupported(
      `ربط ${this.platform} عبر OAuth غير مُعد — أضف بيانات التطبيق الرسمية في البيئة.`
    );
  }

  async handleOAuthCallback(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderResult<ConnectedProfile>> {
    void input;
    return unsupported(`OAuth callback لـ ${this.platform} غير مُعد.`);
  }

  async disconnect(accountId: string): Promise<ProviderResult<{ disconnected: true }>> {
    void accountId;
    return ok({ disconnected: true as const });
  }

  async refreshToken(refreshToken: string): Promise<ProviderResult<ConnectedProfile>> {
    void refreshToken;
    return unsupported(`تجديد التوكن غير مدعوم عبر API الحالية لـ ${this.platform}.`);
  }

  async getProfile(
    accessToken: string
  ): Promise<ProviderResult<Omit<ConnectedProfile, 'accessToken' | 'refreshToken'>>> {
    void accessToken;
    return unsupported(`جلب الملف غير مدعوم عبر API الحالية لـ ${this.platform}.`);
  }

  async getPosts(
    accessToken: string,
    opts?: { limit?: number }
  ): Promise<ProviderResult<unknown[]>> {
    void accessToken;
    void opts;
    return unsupported(`جلب المنشورات غير مدعوم عبر API الحالية لـ ${this.platform}.`);
  }

  async publishPost(
    accessToken: string,
    input: SocialPostInput
  ): Promise<ProviderResult<{ platformPostId: string }>> {
    void accessToken;
    void input;
    return unsupported(`النشر غير مدعوم عبر API الرسمية الحالية لـ ${this.platform}.`);
  }

  async getAnalytics(
    accessToken: string,
    range: { since: string; until: string }
  ): Promise<ProviderResult<SocialAnalytics>> {
    void accessToken;
    void range;
    return unsupported(`التحليلات غير متاحة عبر API الرسمية الحالية لـ ${this.platform}.`);
  }

  async getMessages(
    accessToken: string,
    opts?: { limit?: number }
  ): Promise<ProviderResult<SocialMessageItem[]>> {
    void accessToken;
    void opts;
    return unsupported(`الرسائل غير متاحة عبر API الرسمية الحالية لـ ${this.platform}.`);
  }

  async getComments(
    accessToken: string,
    opts?: { limit?: number }
  ): Promise<ProviderResult<SocialMessageItem[]>> {
    void accessToken;
    void opts;
    return unsupported(`التعليقات غير متاحة عبر API الرسمية الحالية لـ ${this.platform}.`);
  }
}

/** Demo/test provider — labeled demo; not a substitute for live OAuth credentials. */
export class DemoSocialProvider extends BaseSocialProvider {
  constructor(public readonly platform: SocialPlatform) {
    super();
  }
  readonly id = `demo:${this.platform}`;

  capabilities(): ProviderCapability[] {
    return ['oauth', 'messages', 'comments', 'publish', 'analytics', 'media'];
  }

  async connect(input?: { redirectUri: string; state: string }) {
    const state = input?.state || 'demo';
    const url = `${input?.redirectUri || '/api/integrations/social/oauth/callback'}?code=demo_${this.platform}&state=${state}`;
    return ok<OAuthStartResult>({ authorizeUrl: url, state });
  }

  async handleOAuthCallback(input: { code: string; redirectUri: string }) {
    void input;
    return ok<ConnectedProfile>({
      accountId: `demo_${this.platform}_1`,
      accountName: `Demo ${this.platform}`,
      profileUrl: null,
      avatarUrl: null,
      accessToken: `demo-token-${this.platform}`,
      refreshToken: `demo-refresh-${this.platform}`,
      tokenExpiry: new Date(Date.now() + 86400000 * 60).toISOString(),
      scopes: ['demo'],
    });
  }

  async getProfile(accessToken: string) {
    return ok({
      accountId: `demo_${this.platform}_1`,
      accountName: `Demo ${this.platform}`,
      profileUrl: null,
      avatarUrl: null,
      tokenExpiry: null,
      scopes: ['demo'],
      accessTokenHint: accessToken.slice(0, 8),
    } as Omit<ConnectedProfile, 'accessToken' | 'refreshToken'>);
  }

  async publishPost(_accessToken: string, input: SocialPostInput) {
    return ok({ platformPostId: `demo_post_${Date.now()}_${input.content.slice(0, 8)}` });
  }

  async getAnalytics() {
    return ok<SocialAnalytics>({
      followers: 1200,
      followersGrowth: 24,
      posts: 8,
      views: 5400,
      reach: 3100,
      impressions: 6200,
      engagement: 410,
      comments: 55,
      messages: 12,
      clicks: 90,
    });
  }

  async getMessages() {
    return ok<SocialMessageItem[]>([]);
  }

  async getComments() {
    return ok<SocialMessageItem[]>([]);
  }
}
