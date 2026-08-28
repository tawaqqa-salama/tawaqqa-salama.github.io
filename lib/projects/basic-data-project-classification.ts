import { supabase } from '@/lib/supabase';
import {
  isProjectClassification,
  normalizeProjectClassification,
  projectClassificationLabel,
  type ProjectClassification,
} from '@/lib/projects/project-classification';

export const BASIC_DATA_PROJECT_CLASSIFICATION_LABELS = {
  EXISTING: 'موقع قائم',
  UNDER_CONSTRUCTION: 'مشروع قيد الإنشاء',
} as const;

type BasicDataClassificationInput = {
  project_classification?: unknown;
  project_status?: unknown;
};

type SyncProjectClassificationRpcRow = {
  project_id?: unknown;
  client_id?: unknown;
  project_code?: unknown;
  project_classification?: unknown;
  synced?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Reads the explicit Basic Data classification only. Operational project_status
 * values are ignored unless they exactly match the approved Arabic labels.
 */
export function readBasicDataProjectClassification(
  input: BasicDataClassificationInput
): ProjectClassification | null {
  const direct = normalizeProjectClassification(input.project_classification);
  if (direct) return direct;

  const status = asNonEmptyString(input.project_status);
  if (status === BASIC_DATA_PROJECT_CLASSIFICATION_LABELS.EXISTING) return 'EXISTING';
  if (status === BASIC_DATA_PROJECT_CLASSIFICATION_LABELS.UNDER_CONSTRUCTION) {
    return 'UNDER_CONSTRUCTION';
  }

  return null;
}

export function basicDataProjectClassificationOptions(): Array<{
  value: ProjectClassification;
  label: string;
}> {
  return (['EXISTING', 'UNDER_CONSTRUCTION'] as const).map((value) => ({
    value,
    label: projectClassificationLabel(value),
  }));
}

/**
 * Server bridge: copies explicit Basic Data classification into the mapped
 * primary engineering project when that project is still legacy NULL.
 */
export async function syncProjectClassificationFromBasicData(clientId: string): Promise<{
  projectClassification: ProjectClassification | null;
  synced: boolean;
  error: string | null;
}> {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) {
    return { projectClassification: null, synced: false, error: 'PROJECT_CLASSIFICATION_CLIENT_REQUIRED' };
  }

  const { data, error } = await supabase.rpc('sync_project_classification_from_basic_data', {
    p_client_id: normalizedClientId,
  });

  if (error) {
    return { projectClassification: null, synced: false, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as SyncProjectClassificationRpcRow | null;
  const resolvedClientId = asNonEmptyString(row?.client_id);
  const projectClassification = row?.project_classification;

  if (
    !row ||
    resolvedClientId !== normalizedClientId ||
    !isProjectClassification(projectClassification)
  ) {
    return { projectClassification: null, synced: false, error: null };
  }

  return {
    projectClassification,
    synced: row.synced === true,
    error: null,
  };
}
