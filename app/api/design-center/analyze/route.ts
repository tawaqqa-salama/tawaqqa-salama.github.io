import { NextResponse } from 'next/server';
import { engineUnavailablePayload, runPlanAnalysis } from '@/lib/projects/design-center/engine';
import { isDesignEngineConfigured } from '@/lib/projects/design-center/engine';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      sheetId?: string | null;
      versionId?: string | null;
    };
    if (!body.projectId) {
      return NextResponse.json(
        { ok: false, code: 'PROJECT_ID_REQUIRED', message: 'projectId is required' },
        { status: 400 }
      );
    }

    const analysis = await runPlanAnalysis({
      projectId: body.projectId,
      sheetId: body.sheetId,
      versionId: body.versionId,
    });

    if (!isDesignEngineConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          ...engineUnavailablePayload(),
          data: { analysis },
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, data: { analysis } });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: 'ANALYZE_FAILED',
        message: e instanceof Error ? e.message : 'Analysis failed',
      },
      { status: 500 }
    );
  }
}
