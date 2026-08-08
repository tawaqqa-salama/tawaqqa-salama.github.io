import { NextResponse } from 'next/server';
import { ensureWhatsAppRuntimeHydrated, getWhatsAppPublicStatus } from '@/lib/whatsapp/config';
import { isWhatsAppCrmMemoryMode } from '@/lib/whatsapp/crm-bridge';
import { createWhatsAppProvider } from '@/lib/whatsapp/provider';
import {
  getSavedWhatsAppSettingsSync,
  saveWhatsAppSettings,
} from '@/lib/whatsapp/runtime-config';
import { waRepository } from '@/lib/whatsapp/store/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureWhatsAppRuntimeHydrated();
  const status = getWhatsAppPublicStatus();
  const cfgPhone = status.phoneNumberId;
  if (cfgPhone) {
    await waRepository.ensureAccount(cfgPhone);
  }
  const saved = getSavedWhatsAppSettingsSync();
  return NextResponse.json({
    ok: true,
    connection: {
      ...status,
      memoryMode: isWhatsAppCrmMemoryMode(),
      cloudApiReady: status.connected && status.provider === 'meta',
    },
    form: {
      business_name: saved?.business_name || status.businessName || 'توقع سلامة',
      phone_number: saved?.phone_number || status.phoneNumber || '',
      phone_number_id: saved?.phone_number_id || status.phoneNumberId || '',
      waba_id: saved?.waba_id || status.wabaId || '',
      has_webhook_verify_token: Boolean(saved?.webhook_verify_token || status.webhookConfigured),
      api_version: saved?.api_version || status.apiVersion || 'v21.0',
      hasAccessToken: status.hasAccessToken,
      access_token_set_via_env: status.source === 'env',
    },
    webhookPath: '/api/integrations/whatsapp/webhook',
    // Never return tokens
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: 'test' | 'save';
    business_name?: string;
    phone_number?: string;
    phone_number_id?: string;
    waba_id?: string;
    webhook_verify_token?: string;
    access_token?: string;
    api_version?: string;
  };

  if (body.action === 'save') {
    if (!body.phone_number_id?.trim()) {
      return NextResponse.json(
        { ok: false, error: 'أدخل Phone Number ID من Meta' },
        { status: 400 }
      );
    }
    const result = await saveWhatsAppSettings({
      business_name: body.business_name,
      phone_number: body.phone_number,
      phone_number_id: body.phone_number_id,
      waba_id: body.waba_id,
      webhook_verify_token: body.webhook_verify_token,
      access_token: body.access_token,
      api_version: body.api_version,
    });
    await waRepository.ensureAccount(body.phone_number_id.trim());
    return NextResponse.json({
      ok: result.ok,
      settings: result.settings,
      warning: result.error?.startsWith('saved_in_memory_only')
        ? 'حُفظ في ذاكرة الخادم — نفّذ سكربت 031 أو اضبط SUPABASE لاستمرار الإعداد بعد إعادة التشغيل. التوكن لا يُعرض.'
        : null,
      connection: getWhatsAppPublicStatus(),
    });
  }

  if (body.action === 'test') {
    await ensureWhatsAppRuntimeHydrated();
    const provider = createWhatsAppProvider();
    const result = await provider.testConnection();
    return NextResponse.json({
      ok: result.ok,
      detail: result.detail,
      provider: provider.id,
    });
  }

  return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 });
}
