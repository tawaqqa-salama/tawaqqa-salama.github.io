/**
 * Inject Compliance Matrix HTML into an existing printable report document.
 * Additive — does not remove existing sections.
 */

import {
  buildComplianceMatrixHtml,
  runProjectCompliance,
} from '@/lib/projects/compliance';
import { resolveComplianceRunForReport } from '@/lib/projects/compliance/snapshot';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export function appendComplianceMatrixToReportHtml(params: {
  html: string;
  client: ClientRecord;
  engineeringData?: ProjectEngineeringData | null;
}): string {
  if (!params.engineeringData) return params.html;
  const liveRun = runProjectCompliance({
    client: params.client,
    data: params.engineeringData,
  });
  const { run, fromFreeze } = resolveComplianceRunForReport({
    data: params.engineeringData,
    liveRun,
  });
  const matrix = buildComplianceMatrixHtml(run, {
    title: fromFreeze
      ? 'ملحق — مصفوفة تقييم المطابقة الكودية (لقطة معتمدة عند الاعتماد)'
      : 'ملحق — مصفوفة تقييم المطابقة الكودية (SBC 201 / SBC 801)',
  });
  const wrapped = `<div style="page-break-before:always">${matrix}</div>`;
  if (params.html.includes('</body>')) {
    return params.html.replace('</body>', `${wrapped}</body>`);
  }
  return `${params.html}\n${wrapped}`;
}
