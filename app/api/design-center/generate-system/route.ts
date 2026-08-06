import { NextResponse } from 'next/server';
import {
  engineUnavailablePayload,
  generateSystemDesign,
  isDesignEngineConfigured,
} from '@/lib/projects/design-center/engine';
import type { FireSystemKind } from '@/lib/projects/design-center/types';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      kind?: FireSystemKind;
      analysisId?: string | null;
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
    });

    if (!isDesignEngineConfigured()) {
      return NextResponse.json(
        { ok: false, ...engineUnavailablePayload(), data: { system } },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, data: { system } });
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
