import type { ProviderCapability, ProviderResult, SocialPlatform } from '@/lib/social/types';

export type { ProviderResult };

export type OAuthStartResult = {
  authorizeUrl: string;
  state: string;
};

export type ConnectedProfile = {
  accountId: string;
  accountName: string;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiry?: string | null;
  scopes?: string[];
};

export type SocialPostInput = {
  content: string;
  mediaUrls?: string[];
  scheduledAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type SocialMessageItem = {
  id: string;
  threadId: string;
  text: string | null;
  direction: 'inbound' | 'outbound';
  createdAt: string;
  contactName?: string | null;
  contactUserId?: string | null;
  contactUsername?: string | null;
};

export type SocialAnalytics = {
  followers?: number;
  followersGrowth?: number;
  posts?: number;
  views?: number;
  reach?: number;
  impressions?: number;
  engagement?: number;
  comments?: number;
  messages?: number;
  clicks?: number;
  spend?: number;
};

/**
 * Official-API-only social provider adapter.
 * Unsupported methods MUST return `{ supported: false }` — never scrape/automate.
 */
export interface SocialMediaProvider {
  readonly platform: SocialPlatform;
  readonly id: string;
  capabilities(): ProviderCapability[];
  supports(capability: ProviderCapability): boolean;

  connect(input?: { redirectUri: string; state: string }): Promise<ProviderResult<OAuthStartResult>>;
  handleOAuthCallback(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderResult<ConnectedProfile>>;
  disconnect(accountId: string): Promise<ProviderResult<{ disconnected: true }>>;
  refreshToken(refreshToken: string): Promise<ProviderResult<ConnectedProfile>>;
  getProfile(accessToken: string): Promise<ProviderResult<Omit<ConnectedProfile, 'accessToken' | 'refreshToken'>>>;
  getPosts(accessToken: string, opts?: { limit?: number }): Promise<ProviderResult<unknown[]>>;
  publishPost(accessToken: string, input: SocialPostInput): Promise<ProviderResult<{ platformPostId: string }>>;
  getAnalytics(
    accessToken: string,
    range: { since: string; until: string }
  ): Promise<ProviderResult<SocialAnalytics>>;
  getMessages(accessToken: string, opts?: { limit?: number }): Promise<ProviderResult<SocialMessageItem[]>>;
  getComments(accessToken: string, opts?: { limit?: number }): Promise<ProviderResult<SocialMessageItem[]>>;
}

export function unsupported<T = never>(reason: string): ProviderResult<T> {
  return { ok: false, supported: false, reason };
}

export function fail<T = never>(error: string): ProviderResult<T> {
  return { ok: false, supported: true, error };
}

export function ok<T>(data: T): ProviderResult<T> {
  return { ok: true, supported: true, data };
}
