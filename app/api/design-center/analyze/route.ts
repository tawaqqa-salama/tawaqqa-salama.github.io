import { NextResponse } from 'next/server';
import { runPlanAnalysis } from '@/lib/projects/design-center/engine';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      sheetId?: string | null;
      versionId?: string | null;
      client?: ClientRecord;
      data?: ProjectEngineeringData;
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
      context: body.client && body.data ? { client: body.client, data: body.data } : null,
    });

    if (analysis.status === 'completed') {
      return NextResponse.json({ ok: true, data: { analysis } });
    }

    return NextResponse.json(
      {
        ok: false,
        code: analysis.error_code || 'ANALYZE_INCOMPLETE',
        message: analysis.error || 'Analysis incomplete',
        message_ar: analysis.error,
        data: { analysis },
      },
      { status: analysis.error_code === 'PROJECT_CONTEXT_REQUIRED' ? 400 : 422 }
    );
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
