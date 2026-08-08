import { NextResponse } from 'next/server';
import { getWhatsAppEnvConfig, getWhatsAppPublicStatus } from '@/lib/whatsapp/config';
import { createWhatsAppProvider } from '@/lib/whatsapp/provider';
import { getMemoryDb, memoryStore } from '@/lib/whatsapp/store/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getWhatsAppPublicStatus();
  const cfg = getWhatsAppEnvConfig();
  if (cfg.phoneNumberId) {
    memoryStore.ensureEnvAccount(cfg.phoneNumberId, {
      phone_number_id: cfg.phoneNumberId,
      waba_id: cfg.wabaId,
    });
  }
  const accounts = getMemoryDb().accounts.map((a) => ({
    id: a.id,
    business_name: a.business_name,
    phone_number: a.phone_number,
    phone_number_id: a.phone_number_id,
    waba_id: a.waba_id,
    status: a.status,
    provider: a.provider,
    last_webhook_at: a.last_webhook_at,
    last_error: a.last_error,
    // never expose tokens
  }));
  return NextResponse.json({
    ok: true,
    connection: status,
    accounts,
    webhookPath: '/api/integrations/whatsapp/webhook',
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: 'test' };
  if (body.action === 'test') {
    const provider = createWhatsAppProvider();
    const result = await provider.testConnection();
    return NextResponse.json({ ok: result.ok, detail: result.detail });
  }
  return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 });
}
