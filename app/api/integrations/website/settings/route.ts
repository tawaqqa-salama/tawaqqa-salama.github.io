import { NextResponse } from 'next/server';
import { getOrCreateWebsiteSite, updateWebsiteSettings } from '@/lib/website/service';

export const runtime = 'nodejs';

export async function GET() {
  const site = await getOrCreateWebsiteSite();
  return NextResponse.json({ ok: true, site });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const allowed = [
    'website_name',
    'domain',
    'logo_url',
    'favicon_url',
    'company_name',
    'phone',
    'whatsapp',
    'email',
    'address',
    'working_hours',
    'social_links',
    'connection_status',
    'seo_defaults',
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  const site = await updateWebsiteSettings(patch);
  return NextResponse.json({ ok: true, site });
}
