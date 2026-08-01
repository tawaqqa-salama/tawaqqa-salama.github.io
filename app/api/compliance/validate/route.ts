import { NextResponse } from 'next/server';
import { validateCompliance } from '@/lib/compliance/engine';
import type { ComplianceValidateInput } from '@/lib/compliance/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ComplianceValidateInput;
    const result = validateCompliance(body || {});
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'فشل التحقق' },
      { status: 400 }
    );
  }
}
