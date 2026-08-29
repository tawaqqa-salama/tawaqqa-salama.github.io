import type { ProjectClassification } from '@/lib/projects/project-classification';

/**
 * Explicit legacy Basic Data / operational status strings that map to exactly
 * one canonical classification. Ambiguous statuses are intentionally excluded.
 */
export const UNAMBIGUOUS_LEGACY_PROJECT_STATUS_TO_CLASSIFICATION = {
  'موقع قائم': 'EXISTING',
  'قائم - تحت المعاينة': 'EXISTING',
  'مشروع قيد الإنشاء': 'UNDER_CONSTRUCTION',
  'تحت الإنشاء': 'UNDER_CONSTRUCTION',
} as const satisfies Record<string, ProjectClassification>;

export type UnambiguousLegacyProjectStatus =
  keyof typeof UNAMBIGUOUS_LEGACY_PROJECT_STATUS_TO_CLASSIFICATION;

export function resolveLegacyProjectStatusClassification(
  projectStatus: unknown
): ProjectClassification | null {
  if (typeof projectStatus !== 'string') return null;
  const normalized = projectStatus.trim();
  if (!normalized) return null;
  return UNAMBIGUOUS_LEGACY_PROJECT_STATUS_TO_CLASSIFICATION[
    normalized as UnambiguousLegacyProjectStatus
  ] ?? null;
}
