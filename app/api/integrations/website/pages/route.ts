import { NextResponse } from 'next/server';
import { listWebsitePages, saveWebsitePage } from '@/lib/website/service';

export const runtime = 'nodejs';

export async function GET() {
  const pages = await listWebsitePages();
  return NextResponse.json({ ok: true, pages });
}

export async function POST(request: Request) {
  const body = await request.json();
  const page = await saveWebsitePage(body);
  return NextResponse.json({ ok: true, page });
}
