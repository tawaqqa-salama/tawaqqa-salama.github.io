import { NextResponse } from 'next/server';
import { runBlueprintAiAudit, type BlueprintAuditRequest } from '@/lib/compliance/blueprint-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BlueprintAuditRequest;
    if (!body?.fileName || !body?.blueprintKind) {
      return NextResponse.json(
        { ok: false, error: 'الحقول المطلوبة: blueprintKind, fileName' },
        { status: 400 }
      );
    }

    const result = runBlueprintAiAudit(body);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'فشل فحص المخطط بالذكاء الاصطناعي',
      },
      { status: 500 }
    );
  }
}
