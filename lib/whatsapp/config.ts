import type { WhatsAppProviderId } from '@/lib/whatsapp/types';
import {
  getWhatsAppPublicStatusFromRuntime,
  loadSavedWhatsAppSettings,
  resolveWhatsAppRuntimeConfig,
} from '@/lib/whatsapp/runtime-config';

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

/** Sync resolve — call loadSavedWhatsAppSettings() once at process start / settings GET. */
export function getWhatsAppEnvConfig(): WhatsAppEnvConfig {
  return resolveWhatsAppRuntimeConfig();
}

/** Public connection status — never includes tokens. */
export function getWhatsAppPublicStatus() {
  return getWhatsAppPublicStatusFromRuntime();
}

/** Ensure DB-saved settings are hydrated into process memory. */
export async function ensureWhatsAppRuntimeHydrated() {
  await loadSavedWhatsAppSettings();
  return getWhatsAppEnvConfig();
}
