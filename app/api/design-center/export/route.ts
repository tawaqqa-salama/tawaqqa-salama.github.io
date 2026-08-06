import { NextResponse } from 'next/server';
import {
  engineUnavailablePayload,
  isDesignEngineConfigured,
  runExport,
} from '@/lib/projects/design-center/engine';
import type { DesignExportKind } from '@/lib/projects/design-center/types';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      kind?: DesignExportKind;
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
    });

    if (!isDesignEngineConfigured()) {
      return NextResponse.json(
        { ok: false, ...engineUnavailablePayload(), data: { exportJob } },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, data: { exportJob } });
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
