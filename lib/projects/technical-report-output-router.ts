import type { DocumentPreviewPayload } from '@/lib/print/document-preview';
import type { ProjectClassification } from '@/lib/projects/project-classification';
import type { ExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import type { UnderConstructionTechnicalReportModel } from '@/lib/projects/under-construction-technical-report-model';

export type TechnicalReportOutputBlocked = {
  kind: 'BLOCKED';
  project_classification: null;
  reason: 'CLASSIFICATION_REQUIRED';
  message: string;
};

export type ExistingTechnicalReportOutput = {
  kind: 'EXISTING';
  project_classification: 'EXISTING';
  model: ExistingTechnicalReportModel;
  document: DocumentPreviewPayload;
};

export type UnderConstructionTechnicalReportOutput = {
  kind: 'UNDER_CONSTRUCTION';
  project_classification: 'UNDER_CONSTRUCTION';
  model: UnderConstructionTechnicalReportModel;
  document: DocumentPreviewPayload;
};

export type TechnicalReportOutput =
  | ExistingTechnicalReportOutput
  | UnderConstructionTechnicalReportOutput
  | TechnicalReportOutputBlocked;

/**
 * Classification-only output router.
 *
 * This function deliberately accepts no ClientRecord, workflow state, report
 * wording, or design lifecycle. NULL is a hard stop and is never interpreted as
 * either technical-report path.
 */
export function resolveTechnicalReportOutput(
  projectClassification: ProjectClassification | null | undefined
):
  | { kind: 'EXISTING'; project_classification: 'EXISTING' }
  | { kind: 'UNDER_CONSTRUCTION'; project_classification: 'UNDER_CONSTRUCTION' }
  | TechnicalReportOutputBlocked {
  if (projectClassification === 'EXISTING') {
    return { kind: 'EXISTING', project_classification: 'EXISTING' };
  }
  if (projectClassification === 'UNDER_CONSTRUCTION') {
    return { kind: 'UNDER_CONSTRUCTION', project_classification: 'UNDER_CONSTRUCTION' };
  }
  return {
    kind: 'BLOCKED',
    project_classification: null,
    reason: 'CLASSIFICATION_REQUIRED',
    message: 'لا يمكن معاينة أو طباعة أو تنزيل التقرير الفني قبل تصنيف هوية المشروع.',
  };
}

export function isTechnicalReportOutputBlocked(
  output: TechnicalReportOutput
): output is TechnicalReportOutputBlocked {
  return output.kind === 'BLOCKED';
}

export class TechnicalReportOutputBlockedError extends Error {
  readonly code = 'CLASSIFICATION_REQUIRED' as const;

  constructor(message = 'لا يمكن إخراج التقرير الفني قبل تصنيف هوية المشروع.') {
    super(message);
    this.name = 'TechnicalReportOutputBlockedError';
  }
}
