import { NextResponse } from 'next/server';
import { getWhatsAppEnvConfig, getWhatsAppPublicStatus } from '@/lib/whatsapp/config';
import { isWhatsAppCrmMemoryMode } from '@/lib/whatsapp/crm-bridge';
import { createWhatsAppProvider } from '@/lib/whatsapp/provider';
import { waRepository } from '@/lib/whatsapp/store/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getWhatsAppPublicStatus();
  const cfg = getWhatsAppEnvConfig();
  if (cfg.phoneNumberId) {
    await waRepository.ensureAccount(cfg.phoneNumberId);
  }
  return NextResponse.json({
    ok: true,
    connection: {
      ...status,
      /** true only in demo/tests — production with Supabase uses clients CRM */
      memoryMode: isWhatsAppCrmMemoryMode(),
      cloudApiReady: status.connected && status.provider === 'meta',
    },
    webhookPath: '/api/integrations/whatsapp/webhook',
    // Never return tokens
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: 'test' };
  if (body.action === 'test') {
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
