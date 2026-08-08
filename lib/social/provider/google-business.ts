import { BaseSocialProvider } from '@/lib/social/provider/base';
import { ok, unsupported } from '@/lib/social/provider/types';
import type { ProviderCapability } from '@/lib/social/types';

/**
 * Google Business Profile API — only when official OAuth client is configured.
 */
export class GoogleBusinessProvider extends BaseSocialProvider {
  readonly platform = 'google_business' as const;
  readonly id = 'google_business';

  capabilities(): ProviderCapability[] {
    return ['oauth', 'analytics'];
  }

  async connect(input?: { redirectUri: string; state: string }) {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    if (!clientId || !input?.redirectUri) {
      return unsupported(
        'Google Business Profile يتطلب GOOGLE_CLIENT_ID وتفعيل Business Profile API في Google Cloud.'
      );
    }
    const scope = encodeURIComponent('https://www.googleapis.com/auth/business.manage');
    const authorizeUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(input.redirectUri)}` +
      `&scope=${scope}` +
      `&state=${encodeURIComponent(input.state)}` +
      `&access_type=offline&prompt=consent`;
    return ok({ authorizeUrl, state: input.state });
  }

  async publishPost() {
    return unsupported('نشر GBP يتطلب Local Posts API بصلاحيات الحساب المُتحقق.');
  }

  async getMessages() {
    return unsupported('مراجعات/رسائل GBP تُجلب عبر APIs منفصلة عند تفعيلها.');
  }
}
