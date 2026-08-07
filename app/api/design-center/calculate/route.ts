import { NextResponse } from 'next/server';
import { runCalculation } from '@/lib/projects/design-center/engine';
import type { EngineeringCalcKind } from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      kind?: EngineeringCalcKind;
      client?: ClientRecord;
      data?: ProjectEngineeringData;
    };
    if (!body.projectId || !body.kind) {
      return NextResponse.json(
        { ok: false, code: 'INVALID_REQUEST', message: 'projectId and kind are required' },
        { status: 400 }
      );
    }

    const calculation = await runCalculation({
      projectId: body.projectId,
      kind: body.kind,
      context: body.client && body.data ? { client: body.client, data: body.data } : null,
    });

    if (calculation.status === 'completed') {
      return NextResponse.json({ ok: true, data: { calculation } });
    }

    return NextResponse.json(
      {
        ok: false,
        code: calculation.error_code || 'CALC_INCOMPLETE',
        message: calculation.error || 'Calculation incomplete',
        data: { calculation },
      },
      { status: 422 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: 'CALC_FAILED',
        message: e instanceof Error ? e.message : 'Calculation failed',
      },
      { status: 500 }
    );
  }
}
