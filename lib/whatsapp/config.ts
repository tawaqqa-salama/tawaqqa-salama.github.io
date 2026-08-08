import type { WhatsAppProviderId } from '@/lib/whatsapp/types';

export type WhatsAppEnvConfig = {
  provider: WhatsAppProviderId;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  webhookVerifyToken: string | null;
  appSecret: string | null;
  apiVersion: string;
  graphBase: string;
  configured: boolean;
};

export function getWhatsAppEnvConfig(): WhatsAppEnvConfig {
  const provider = (process.env.WHATSAPP_PROVIDER || 'meta') as WhatsAppProviderId;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || null;
  const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null;
  const appSecret = process.env.WHATSAPP_APP_SECRET || null;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const configured = Boolean(phoneNumberId && accessToken);

  return {
    provider: configured ? provider : 'stub',
    phoneNumberId,
    wabaId,
    accessToken,
    webhookVerifyToken,
    appSecret,
    apiVersion,
    graphBase: `https://graph.facebook.com/${apiVersion}`,
    configured,
  };
}

/** Public connection status — never includes tokens. */
export function getWhatsAppPublicStatus() {
  const cfg = getWhatsAppEnvConfig();
  return {
    connected: cfg.configured,
    provider: cfg.provider,
    phoneNumberId: cfg.phoneNumberId,
    wabaId: cfg.wabaId,
    apiVersion: cfg.apiVersion,
    webhookConfigured: Boolean(cfg.webhookVerifyToken),
    hasAppSecret: Boolean(cfg.appSecret),
  };
}
