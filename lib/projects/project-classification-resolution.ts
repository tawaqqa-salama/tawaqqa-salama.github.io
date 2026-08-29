import { readBasicDataProjectClassification } from '@/lib/projects/basic-data-project-classification';
import type { ProjectClassification } from '@/lib/projects/project-classification';
import type { ClientRecord } from '@/lib/types/client';

export const PROJECT_CLASSIFICATION_SOURCE_FIELD = 'clients.project_classification' as const;

export type ProjectClassificationResolution =
  | {
      status: 'RESOLVED';
      classification: ProjectClassification;
      sourceField:
        | 'projects.project_classification'
        | typeof PROJECT_CLASSIFICATION_SOURCE_FIELD
        | 'clients.project_status';
    }
  | {
      status: 'NEEDS_DATA';
      classification: null;
      reason: 'CLASSIFICATION_REQUIRED';
      sourceField: typeof PROJECT_CLASSIFICATION_SOURCE_FIELD;
      message: string;
    };

export function resolveProjectClassificationFromBasicData(input: {
  project_classification?: unknown;
  project_status?: unknown;
}): ProjectClassificationResolution {
  const direct = readBasicDataProjectClassification(input);
  if (direct) {
    const sourceField =
      typeof input.project_classification === 'string' &&
      (input.project_classification === 'EXISTING' || input.project_classification === 'UNDER_CONSTRUCTION')
        ? PROJECT_CLASSIFICATION_SOURCE_FIELD
        : 'clients.project_status';

    return {
      status: 'RESOLVED',
      classification: direct,
      sourceField,
    };
  }

  return {
    status: 'NEEDS_DATA',
    classification: null,
    reason: 'CLASSIFICATION_REQUIRED',
    sourceField: PROJECT_CLASSIFICATION_SOURCE_FIELD,
    message:
      'لا يمكن تحديد مسار التقرير الفني قبل اختيار تصنيف المشروع الهندسي في البيانات الأساسية: موقع قائم أو مشروع قيد الإنشاء.',
  };
}

export function resolveStage4ProjectClassification(
  client: Pick<ClientRecord, 'project_classification' | 'project_status' | 'primary_engineering_project_identity'>
): ProjectClassificationResolution {
  const identityClassification =
    client.primary_engineering_project_identity?.projectClassification ?? null;
  if (identityClassification) {
    return {
      status: 'RESOLVED',
      classification: identityClassification,
      sourceField: 'projects.project_classification',
    };
  }

  return resolveProjectClassificationFromBasicData({
    project_classification: client.project_classification,
    project_status: client.project_status,
  });
}
