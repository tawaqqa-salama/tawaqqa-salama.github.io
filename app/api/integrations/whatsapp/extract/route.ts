import { NextResponse } from 'next/server';
import { memoryStore } from '@/lib/whatsapp/store/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    extractionId?: string;
    action?: 'confirm' | 'edit' | 'ignore';
    proposed?: Record<string, unknown>;
    userId?: string;
  };
  if (!body.extractionId || !body.action) {
    return NextResponse.json({ ok: false, error: 'extractionId_and_action_required' }, { status: 400 });
  }
  const status =
    body.action === 'confirm' ? 'confirmed' : body.action === 'edit' ? 'edited' : 'ignored';
  const row = memoryStore.reviewExtraction(
    body.extractionId,
    status,
    body.action === 'ignore' ? undefined : body.proposed,
    body.userId
  );
  if (!row) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, extraction: row });
}
