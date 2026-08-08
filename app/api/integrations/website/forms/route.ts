import { NextResponse } from 'next/server';
import { listWebsiteForms, saveWebsiteForm } from '@/lib/website/service';

export const runtime = 'nodejs';

export async function GET() {
  const forms = await listWebsiteForms();
  return NextResponse.json({ ok: true, forms });
}

export async function POST(request: Request) {
  const body = await request.json();
  const form = await saveWebsiteForm(body);
  return NextResponse.json({ ok: true, form });
}
