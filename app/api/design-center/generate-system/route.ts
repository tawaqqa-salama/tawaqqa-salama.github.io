import { NextResponse } from 'next/server';
import { generateSystemDesign } from '@/lib/projects/design-center/engine';
import type { FireSystemKind } from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      kind?: FireSystemKind;
      analysisId?: string | null;
      client?: ClientRecord;
      data?: ProjectEngineeringData;
    };
    if (!body.projectId || !body.kind) {
      return NextResponse.json(
        { ok: false, code: 'INVALID_REQUEST', message: 'projectId and kind are required' },
        { status: 400 }
      );
    }

    const system = await generateSystemDesign({
      projectId: body.projectId,
      kind: body.kind,
      analysisId: body.analysisId,
      context: body.client && body.data ? { client: body.client, data: body.data } : null,
    });

    if (system.status === 'completed') {
      return NextResponse.json({ ok: true, data: { system } });
    }

    return NextResponse.json(
      {
        ok: false,
        code: system.error_code || 'GENERATE_INCOMPLETE',
        message: system.error || 'Generation incomplete',
        data: { system },
      },
      { status: 422 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: 'GENERATE_FAILED',
        message: e instanceof Error ? e.message : 'Generation failed',
      },
      { status: 500 }
    );
  }
}
