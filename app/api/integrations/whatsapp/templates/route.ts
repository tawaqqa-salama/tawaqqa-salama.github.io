import { NextResponse } from 'next/server';
import { memoryStore } from '@/lib/whatsapp/store/memory';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  return NextResponse.json({ ok: true, templates: memoryStore.listTemplates() });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const body = (await request.json()) as {
    name?: string;
    display_name_ar?: string;
    body?: string;
    category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    language?: string;
    status?: 'draft' | 'pending' | 'approved' | 'rejected' | 'disabled';
  };
  if (!body.name || !body.body) {
    return NextResponse.json({ ok: false, error: 'name_and_body_required' }, { status: 400 });
  }
  const template = memoryStore.upsertTemplate({
    name: body.name,
    display_name_ar: body.display_name_ar,
    body: body.body,
    category: body.category,
    language: body.language,
    status: body.status,
  });
  return NextResponse.json({ ok: true, template });
}
