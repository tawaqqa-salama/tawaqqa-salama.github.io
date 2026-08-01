import { NextResponse } from 'next/server';
import { validateCompliance } from '@/lib/compliance/engine';
import { buildComplianceReportHtml } from '@/lib/export/compliance-report';
import type { ComplianceValidateInput } from '@/lib/compliance/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      input?: ComplianceValidateInput;
      projectName?: string;
      preparedBy?: string;
      format?: 'html' | 'pdf' | 'docx';
    };

    const result = validateCompliance(body.input || {});
    const html = buildComplianceReportHtml(result, {
      projectName: body.projectName,
      preparedBy: body.preparedBy,
    });

    const format = body.format || 'html';
    if (format === 'docx') {
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'application/msword; charset=utf-8',
          'Content-Disposition': 'attachment; filename="compliance-report.doc"',
        },
      });
    }

    // PDF عبر طباعة HTML من العميل؛ هنا نُرجع HTML للمعاينة
    return NextResponse.json({ ok: true, result, html, format });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'فشل التصدير' },
      { status: 400 }
    );
  }
}
