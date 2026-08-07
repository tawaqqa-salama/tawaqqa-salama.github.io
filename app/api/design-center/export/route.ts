import { NextResponse } from 'next/server';
import { runExport } from '@/lib/projects/design-center/engine';
import type { DesignExportKind } from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      kind?: DesignExportKind;
      client?: ClientRecord;
      data?: ProjectEngineeringData;
    };
    if (!body.projectId || !body.kind) {
      return NextResponse.json(
        { ok: false, code: 'INVALID_REQUEST', message: 'projectId and kind are required' },
        { status: 400 }
      );
    }

    const exportJob = await runExport({
      projectId: body.projectId,
      kind: body.kind,
      context: body.client && body.data ? { client: body.client, data: body.data } : null,
    });

    if (exportJob.status === 'completed') {
      return NextResponse.json({ ok: true, data: { exportJob } });
    }

    return NextResponse.json(
      {
        ok: false,
        code: exportJob.error_code || 'EXPORT_INCOMPLETE',
        message: exportJob.error || 'Export incomplete',
        data: { exportJob },
      },
      { status: 422 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: 'EXPORT_FAILED',
        message: e instanceof Error ? e.message : 'Export failed',
      },
      { status: 500 }
    );
  }
}
