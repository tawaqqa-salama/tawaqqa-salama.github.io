import { saveEngineeringLive } from '@/lib/projects/engineering-live-store';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import { saveStage5LiveBundle } from '@/lib/projects/stage5-live-store';
import { trimSupervisionTextFields } from '@/lib/projects/supervision-report';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export type Stage5PersistenceResult = {
  data: ProjectEngineeringData;
  error: string | null;
  canonicalPersisted: boolean;
  stage5MirrorSynced: boolean;
};

/**
 * Canonical Stage 5 persistence boundary. All visit and supervision metadata
 * must pass this coordinator before a caller can report success or begin any
 * dependent Storage cleanup.
 */
export async function persistStage5Metadata(params: {
  clientId: string;
  data: ProjectEngineeringData;
  pipelineStage?: string | null;
}): Promise<Stage5PersistenceResult> {
  const data = sanitizeEngineeringDataForPersist(
    {
      ...params.data,
      supervision_report: params.data.supervision_report
        ? trimSupervisionTextFields(params.data.supervision_report)
        : params.data.supervision_report,
    },
    { aggressive: true, clientId: params.clientId }
  );

  const canonical = await saveEngineeringLive({
    clientId: params.clientId,
    data,
    pipelineStage: params.pipelineStage,
  });
  if (canonical.error) {
    return {
      data,
      error: canonical.error,
      canonicalPersisted: false,
      stage5MirrorSynced: false,
    };
  }

  const mirror = await saveStage5LiveBundle({
    clientId: params.clientId,
    fieldVisits: data.field_visits || [],
    supervision: data.supervision_report,
    pdfArchive: data.report_pdf_archive || [],
    pipelineStage: params.pipelineStage,
  });
  if (mirror.error) {
    return {
      data,
      error: mirror.error,
      canonicalPersisted: true,
      stage5MirrorSynced: false,
    };
  }

  return {
    data,
    error: null,
    canonicalPersisted: true,
    stage5MirrorSynced: true,
  };
}
