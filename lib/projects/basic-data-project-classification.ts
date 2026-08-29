import { supabase } from '@/lib/supabase';
import { resolveLegacyProjectStatusClassification } from '@/lib/projects/legacy-project-status-classification';
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
  const legacy = resolveLegacyProjectStatusClassification(status);
  if (legacy) return legacy;

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

type BackfillSummaryRpcRow = {
  total_candidates?: unknown;
  synced_count?: unknown;
  already_classified_count?: unknown;
  unresolved_count?: unknown;
};

/**
 * One-shot tenant-scoped backfill for legacy Production projects whose Basic
 * Data already contains an explicit or unambiguous legacy classification.
 */
export async function backfillAllProjectClassificationsFromBasicData(): Promise<{
  totalCandidates: number;
  syncedCount: number;
  alreadyClassifiedCount: number;
  unresolvedCount: number;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('backfill_project_classifications_from_basic_data');

  if (error) {
    return {
      totalCandidates: 0,
      syncedCount: 0,
      alreadyClassifiedCount: 0,
      unresolvedCount: 0,
      error: error.message,
    };
  }

  const row = (Array.isArray(data) ? data[0] : data) as BackfillSummaryRpcRow | null;
  return {
    totalCandidates: Number(row?.total_candidates ?? 0),
    syncedCount: Number(row?.synced_count ?? 0),
    alreadyClassifiedCount: Number(row?.already_classified_count ?? 0),
    unresolvedCount: Number(row?.unresolved_count ?? 0),
    error: null,
  };
}

export async function countUnresolvedProjectClassifications(): Promise<{
  count: number;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('count_unresolved_project_classifications');
  if (error) return { count: 0, error: error.message };
  return { count: Number(data ?? 0), error: null };
}
