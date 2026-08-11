/**
 * Inject Compliance Matrix HTML into an existing printable report document.
 * Additive — does not remove existing sections.
 */

import {
  buildComplianceMatrixHtml,
  runProjectCompliance,
} from '@/lib/projects/compliance';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export function appendComplianceMatrixToReportHtml(params: {
  html: string;
  client: ClientRecord;
  engineeringData?: ProjectEngineeringData | null;
}): string {
  if (!params.engineeringData) return params.html;
  const run = runProjectCompliance({
    client: params.client,
    data: params.engineeringData,
  });
  const matrix = buildComplianceMatrixHtml(run, {
    title: 'ملحق — مصفوفة المطابقة الكودية (SBC 201 / SBC 801)',
  });
  const wrapped = `<div style="page-break-before:always">${matrix}</div>`;
  if (params.html.includes('</body>')) {
    return params.html.replace('</body>', `${wrapped}</body>`);
  }
  return `${params.html}\n${wrapped}`;
}
