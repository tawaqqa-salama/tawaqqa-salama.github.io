/**
 * Runtime WhatsApp credentials: env vars win; UI-saved account fills gaps.
 * Access token never returned to the browser.
 */

import { decryptSecret, encryptSecret } from '@/lib/whatsapp/crypto';
import type { WhatsAppEnvConfig } from '@/lib/whatsapp/config';
import type { WhatsAppProviderId } from '@/lib/whatsapp/types';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';

export type SavedWhatsAppSettings = {
  business_name: string | null;
  phone_number: string | null;
  phone_number_id: string;
  waba_id: string | null;
  webhook_verify_token: string | null;
  /** encrypted or null — never expose plaintext */
  access_token_encrypted: string | null;
  api_version: string | null;
  provider: WhatsAppProviderId;
  updated_at: string;
};

type RuntimeSecretBag = {
  accessToken: string | null;
};

const g = globalThis as unknown as {
  __tawaqWaSettings?: SavedWhatsAppSettings | null;
  __tawaqWaSecrets?: RuntimeSecretBag;
};

function memorySettings(): SavedWhatsAppSettings | null {
  return g.__tawaqWaSettings || null;
}

function memorySecrets(): RuntimeSecretBag {
  if (!g.__tawaqWaSecrets) g.__tawaqWaSecrets = { accessToken: null };
  return g.__tawaqWaSecrets;
}

export function getSavedWhatsAppSettingsSync(): SavedWhatsAppSettings | null {
  return memorySettings();
}

export async function loadSavedWhatsAppSettings(): Promise<SavedWhatsAppSettings | null> {
  const mem = memorySettings();
  if (mem) return mem;

  if (!isSupabaseConfigured || isDemoMode) return null;

  try {
    const { data } = await supabase
      .from('whatsapp_accounts')
      .select(
        'business_name, phone_number, phone_number_id, waba_id, webhook_verify_token, access_token_encrypted, provider, updated_at, metadata'
      )
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1);
    const row = data?.[0] as
      | (SavedWhatsAppSettings & { metadata?: { api_version?: string } })
      | undefined;
    if (!row?.phone_number_id) return null;
    const saved: SavedWhatsAppSettings = {
      business_name: row.business_name,
      phone_number: row.phone_number,
      phone_number_id: row.phone_number_id,
      waba_id: row.waba_id,
      webhook_verify_token: row.webhook_verify_token,
      access_token_encrypted: row.access_token_encrypted,
      api_version: row.metadata?.api_version || null,
      provider: (row.provider || 'meta') as WhatsAppProviderId,
      updated_at: row.updated_at,
    };
    g.__tawaqWaSettings = saved;
    const dec = decryptSecret(saved.access_token_encrypted);
    if (dec) memorySecrets().accessToken = dec;
    return saved;
  } catch {
    return null;
  }
}

export type PublicWhatsAppSettingsView = {
  business_name: string | null;
  phone_number: string | null;
  phone_number_id: string;
  waba_id: string | null;
  has_webhook_verify_token: boolean;
  api_version: string | null;
  provider: WhatsAppProviderId;
  updated_at: string;
  hasAccessToken: boolean;
};

export async function saveWhatsAppSettings(input: {
  business_name?: string | null;
  phone_number?: string | null;
  phone_number_id: string;
  waba_id?: string | null;
  webhook_verify_token?: string | null;
  access_token?: string | null;
  api_version?: string | null;
  provider?: WhatsAppProviderId;
}): Promise<{ ok: boolean; error?: string; settings?: PublicWhatsAppSettingsView }> {
  const phoneNumberId = String(input.phone_number_id || '').trim();
  if (!phoneNumberId) {
    return { ok: false, error: 'phone_number_id_required' };
  }

  const prev = memorySettings();
  let access_token_encrypted = prev?.access_token_encrypted || null;

  if (input.access_token && input.access_token.trim()) {
    const token = input.access_token.trim();
    // Keep plaintext only in process memory for Meta calls; persist encrypted when key available
    memorySecrets().accessToken = token;
    const enc = encryptSecret(token);
    if (enc.startsWith('envref:')) {
      // No encryption key — still usable in this process; warn via hasAccessToken
      access_token_encrypted = null;
    } else {
      access_token_encrypted = enc;
    }
  }

  const saved: SavedWhatsAppSettings = {
    business_name: input.business_name?.trim() || prev?.business_name || 'توقع سلامة',
    phone_number: input.phone_number?.trim() || prev?.phone_number || null,
    phone_number_id: phoneNumberId,
    waba_id: input.waba_id?.trim() || prev?.waba_id || null,
    webhook_verify_token:
      input.webhook_verify_token?.trim() || prev?.webhook_verify_token || null,
    access_token_encrypted,
    api_version: input.api_version?.trim() || prev?.api_version || 'v21.0',
    provider: input.provider || prev?.provider || 'meta',
    updated_at: new Date().toISOString(),
  };

  g.__tawaqWaSettings = saved;

  if (isSupabaseConfigured && !isDemoMode) {
    try {
      const { error } = await supabase.from('whatsapp_accounts').upsert(
        {
          business_name: saved.business_name,
          phone_number: saved.phone_number,
          phone_number_id: saved.phone_number_id,
          waba_id: saved.waba_id,
          webhook_verify_token: saved.webhook_verify_token,
          access_token_encrypted: saved.access_token_encrypted,
          status: 'active',
          provider: saved.provider,
          metadata: { api_version: saved.api_version },
          updated_at: saved.updated_at,
        },
        { onConflict: 'phone_number_id' }
      );
      if (error) {
        // Table may be missing — memory still holds settings for this process
        return {
          ok: true,
          error: `saved_in_memory_only:${error.message}`,
          settings: publicSettingsView(saved),
        };
      }
    } catch (e) {
      return {
        ok: true,
        error: `saved_in_memory_only:${e instanceof Error ? e.message : 'db_error'}`,
        settings: publicSettingsView(saved),
      };
    }
  }

  return { ok: true, settings: publicSettingsView(saved) };
}

function publicSettingsView(saved: SavedWhatsAppSettings) {
  return {
    business_name: saved.business_name,
    phone_number: saved.phone_number,
    phone_number_id: saved.phone_number_id,
    waba_id: saved.waba_id,
    has_webhook_verify_token: Boolean(saved.webhook_verify_token),
    api_version: saved.api_version,
    provider: saved.provider,
    updated_at: saved.updated_at,
    hasAccessToken: Boolean(
      memorySecrets().accessToken ||
        saved.access_token_encrypted ||
        process.env.WHATSAPP_ACCESS_TOKEN
    ),
  };
}

/** Merge env + UI-saved settings for Meta provider. */
export function resolveWhatsAppRuntimeConfig(): WhatsAppEnvConfig {
  const saved = memorySettings();
  const secrets = memorySecrets();

  const phoneNumberId =
    process.env.WHATSAPP_PHONE_NUMBER_ID || saved?.phone_number_id || null;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || saved?.waba_id || null;
  const accessToken =
    process.env.WHATSAPP_ACCESS_TOKEN ||
    secrets.accessToken ||
    decryptSecret(saved?.access_token_encrypted) ||
    null;
  const webhookVerifyToken =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || saved?.webhook_verify_token || null;
  const appSecret = process.env.WHATSAPP_APP_SECRET || null;
  const apiVersion =
    process.env.WHATSAPP_API_VERSION || saved?.api_version || 'v21.0';
  const provider = (process.env.WHATSAPP_PROVIDER ||
    saved?.provider ||
    'meta') as WhatsAppProviderId;
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

export function getWhatsAppPublicStatusFromRuntime() {
  const cfg = resolveWhatsAppRuntimeConfig();
  const saved = memorySettings();
  return {
    connected: cfg.configured,
    provider: cfg.provider,
    phoneNumberId: cfg.phoneNumberId,
    wabaId: cfg.wabaId,
    phoneNumber: saved?.phone_number || null,
    businessName: saved?.business_name || null,
    apiVersion: cfg.apiVersion,
    webhookConfigured: Boolean(cfg.webhookVerifyToken),
    hasAppSecret: Boolean(cfg.appSecret),
    hasAccessToken: Boolean(cfg.accessToken),
    source: process.env.WHATSAPP_ACCESS_TOKEN
      ? 'env'
      : saved
        ? 'saved'
        : 'none',
  };
}

/** Test helper */
export function resetRuntimeWhatsAppSettings() {
  g.__tawaqWaSettings = null;
  g.__tawaqWaSecrets = { accessToken: null };
}
