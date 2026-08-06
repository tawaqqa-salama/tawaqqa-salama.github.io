import { NextResponse } from 'next/server';
import {
  engineUnavailablePayload,
  isDesignEngineConfigured,
  runCompliance,
} from '@/lib/projects/design-center/engine';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { projectId?: string };
    if (!body.projectId) {
      return NextResponse.json(
        { ok: false, code: 'PROJECT_ID_REQUIRED', message: 'projectId is required' },
        { status: 400 }
      );
    }

    const compliance = await runCompliance({ projectId: body.projectId });

    if (!isDesignEngineConfigured()) {
      return NextResponse.json(
        { ok: false, ...engineUnavailablePayload(), data: { compliance } },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, data: { compliance } });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: 'COMPLIANCE_FAILED',
        message: e instanceof Error ? e.message : 'Compliance check failed',
      },
      { status: 500 }
    );
  }
}
