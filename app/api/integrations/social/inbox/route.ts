import { NextResponse } from 'next/server';
import { listInbox } from '@/lib/social/service';

export const runtime = 'nodejs';

export async function GET() {
  const conversations = await listInbox();
  return NextResponse.json({ ok: true, conversations });
}
