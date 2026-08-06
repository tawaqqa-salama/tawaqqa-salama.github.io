import { NextResponse } from 'next/server';
import {
  engineUnavailablePayload,
  isDesignEngineConfigured,
  runCalculation,
} from '@/lib/projects/design-center/engine';
import type { EngineeringCalcKind } from '@/lib/projects/design-center/types';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      kind?: EngineeringCalcKind;
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
    });

    if (!isDesignEngineConfigured()) {
      return NextResponse.json(
        { ok: false, ...engineUnavailablePayload(), data: { calculation } },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, data: { calculation } });
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
