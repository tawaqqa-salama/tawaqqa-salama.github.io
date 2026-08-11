import { NextResponse } from 'next/server';
import { listProjectShowcases, saveProjectShowcase } from '@/lib/website/service';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const projects = await listProjectShowcases();
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'website' });
  if ('response' in gated) return gated.response;
  const body = await request.json();
  const project = await saveProjectShowcase(body);
  return NextResponse.json({ ok: true, project });
}
