import { NextResponse } from 'next/server';
import { isDesignEngineConfigured, runCompliance } from '@/lib/projects/design-center/engine';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      client?: ClientRecord;
      data?: ProjectEngineeringData;
    };
    if (!body.projectId) {
      return NextResponse.json(
        { ok: false, code: 'PROJECT_ID_REQUIRED', message: 'projectId is required' },
        { status: 400 }
      );
    }

    const compliance = await runCompliance({
      projectId: body.projectId,
      context:
        body.client && body.data
          ? { client: body.client, data: body.data }
          : null,
    });

    if (isDesignEngineConfigured()) {
      return NextResponse.json({ ok: true, data: { compliance } });
    }

    // Local knowledge bridge is the production path until external engine is wired
    if (compliance.status === 'failed' && compliance.error_code === 'PROJECT_CONTEXT_REQUIRED') {
      return NextResponse.json(
        {
          ok: false,
          code: 'PROJECT_CONTEXT_REQUIRED',
          message: compliance.error || 'Project context required',
          message_ar: compliance.recommendations[0]?.text_ar,
          message_en: compliance.recommendations[0]?.text_en,
          data: { compliance },
        },
        { status: 400 }
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
