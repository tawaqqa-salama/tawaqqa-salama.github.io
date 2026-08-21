import { normalizeFieldVisitEvidenceForVisit } from '@/lib/projects/field-visit-evidence';
import { persistStage5Metadata } from '@/lib/projects/stage5-persistence';
import type { FieldVisitReport, ProjectEngineeringData } from '@/lib/types/project-reports';

export type FieldVisitEvidencePersistenceResult = {
  data: ProjectEngineeringData;
  error: string | null;
  canonicalPersisted: boolean;
  stage5MirrorSynced: boolean;
};

/**
 * Persists one field-visit evidence state through the canonical engineering
 * payload first, then synchronizes the existing Stage 5 relational mirror.
 *
 * The order is intentional: callers must never report success when canonical
 * reload data is stale. Storage cleanup remains outside this coordinator and
 * is permitted only after this function returns without an error.
 */
export async function persistFieldVisitEvidenceMetadata(params: {
  clientId: string;
  data: ProjectEngineeringData;
  visitNumber: number;
  nextVisit: FieldVisitReport;
  pipelineStage?: string | null;
}): Promise<FieldVisitEvidencePersistenceResult> {
  const currentVisits = params.data.field_visits || [];
  const visitIndex = currentVisits.findIndex((visit) => visit.visit_number === params.visitNumber);
  if (visitIndex < 0) {
    return {
      data: params.data,
      error: 'الزيارة غير موجودة داخل بيانات المشروع الكانونية.',
      canonicalPersisted: false,
      stage5MirrorSynced: false,
    };
  }

  const nextVisits = currentVisits.map((visit) =>
    visit.visit_number === params.visitNumber
      ? normalizeFieldVisitEvidenceForVisit({ ...params.nextVisit, updated_at: new Date().toISOString() })
      : normalizeFieldVisitEvidenceForVisit(visit)
  );
  const nextData: ProjectEngineeringData = {
    ...params.data,
    field_visits: nextVisits,
  };

  return persistStage5Metadata({
    clientId: params.clientId,
    data: nextData,
    pipelineStage: params.pipelineStage,
  });
}
