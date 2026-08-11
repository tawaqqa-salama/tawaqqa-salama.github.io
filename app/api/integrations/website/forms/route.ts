import { NextResponse } from 'next/server';
import { listWebsiteForms, saveWebsiteForm } from '@/lib/website/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const forms = await listWebsiteForms();
  return NextResponse.json({ ok: true, forms });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const body = await request.json();
  const form = await saveWebsiteForm(body);
  return NextResponse.json({ ok: true, form });
}
