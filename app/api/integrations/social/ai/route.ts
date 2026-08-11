import { NextResponse } from 'next/server';
import { runMarketingAiAssist, type AiAssistKind } from '@/lib/marketing/ai-assist';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: AiAssistKind;
    text?: string;
    platform?: string;
    allowPublish?: boolean;
  };
  if (!body.kind || !body.text) {
    return NextResponse.json({ ok: false, error: 'kind و text مطلوبان' }, { status: 400 });
  }
  const result = await runMarketingAiAssist({
    kind: body.kind,
    text: body.text,
    platform: body.platform,
    allowPublish: body.allowPublish,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
