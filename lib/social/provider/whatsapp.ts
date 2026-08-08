import { BaseSocialProvider } from '@/lib/social/provider/base';
import { ok, unsupported } from '@/lib/social/provider/types';
import type { ProviderCapability } from '@/lib/social/types';
import {
  getWhatsAppPublicStatusFromRuntime,
  resolveWhatsAppRuntimeConfig,
} from '@/lib/whatsapp/runtime-config';

/**
 * Bridges Social Hub ↔ existing WhatsApp Cloud API module.
 * Messaging stays on WhatsApp CRM APIs; this provider exposes connection status.
 */
export class WhatsAppSocialProvider extends BaseSocialProvider {
  readonly platform = 'whatsapp' as const;
  readonly id = 'whatsapp-bridge';

  capabilities(): ProviderCapability[] {
    return ['messages', 'analytics'];
  }

  async connect() {
    const cfg = getWhatsAppPublicStatusFromRuntime();
    if (!cfg.phoneNumberId || !cfg.hasAccessToken) {
      return unsupported(
        'اربط واتساب من الإعدادات → تكاملات واتساب (Cloud API). لا يُستخدم QR أو أتمتة متصفح.'
      );
    }
    return ok({
      authorizeUrl: '/settings/integrations/whatsapp',
      state: 'whatsapp-settings',
    });
  }

  async getProfile() {
    const cfg = resolveWhatsAppRuntimeConfig();
    if (!cfg.phoneNumberId) {
      return unsupported('حساب واتساب غير مربوط.');
    }
    return ok({
      accountId: cfg.phoneNumberId,
      accountName: cfg.wabaId || 'WhatsApp Business',
      profileUrl: null,
      avatarUrl: null,
      tokenExpiry: null,
      scopes: ['whatsapp_business_messaging'],
    });
  }

  async publishPost() {
    return unsupported('نشر محتوى عام ليس عبر واتساب — استخدم الحملات/القوالب في صندوق واتساب.');
  }

  async getMessages() {
    return unsupported('استخدم صندوق واتساب /api/integrations/whatsapp/conversations للمحادثات.');
  }
}
