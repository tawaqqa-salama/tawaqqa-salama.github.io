export const PROJECT_CLASSIFICATIONS = ['EXISTING', 'UNDER_CONSTRUCTION'] as const;

/**
 * Canonical project-identity classification. It is deliberately independent from
 * client/project operational status, report wording, and workflow state.
 */
export type ProjectClassification = (typeof PROJECT_CLASSIFICATIONS)[number];

export function isProjectClassification(value: unknown): value is ProjectClassification {
  return typeof value === 'string' && (PROJECT_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function projectClassificationLabel(value: ProjectClassification): string {
  return value === 'EXISTING' ? 'موقع قائم' : 'مشروع قيد الإنشاء';
}

export function projectClassificationDescription(value: ProjectClassification): string {
  return value === 'EXISTING'
    ? 'دراسة تقييم موقع/مشروع قائم'
    : 'دراسة تصميمية لمشروع قيد الإنشاء';
}

/**
 * New Sales records must be classified explicitly. Legacy rows remain null and
 * are represented as null only; no helper infers a classification from status
 * text, technical-report data, or fire-protection design state.
 */
export function normalizeProjectClassification(value: unknown): ProjectClassification | null {
  return isProjectClassification(value) ? value : null;
}
