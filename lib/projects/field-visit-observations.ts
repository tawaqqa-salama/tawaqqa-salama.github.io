import type {
  FieldVisitObservation,
  FieldVisitObservationCategory,
  FieldVisitObservationSeverity,
  FieldVisitObservationStatus,
} from '@/lib/types/project-reports';

export const FIELD_VISIT_OBSERVATION_CATEGORIES: Array<{
  value: FieldVisitObservationCategory;
  label: string;
}> = [
  { value: 'firefighting', label: 'نظام الإطفاء' },
  { value: 'fire_alarm', label: 'نظام الإنذار' },
  { value: 'egress', label: 'مخارج ومسارات الهروب' },
  { value: 'passive_fire_protection', label: 'الحماية السلبية من الحريق' },
  { value: 'electrical_safety', label: 'السلامة الكهربائية' },
  { value: 'housekeeping', label: 'السلامة العامة والترتيب' },
  { value: 'other', label: 'أخرى' },
];

export const FIELD_VISIT_OBSERVATION_SEVERITIES: Array<{
  value: FieldVisitObservationSeverity;
  label: string;
}> = [
  { value: 'low', label: 'منخفضة' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'high', label: 'عالية' },
  { value: 'critical', label: 'حرجة' },
];

export const FIELD_VISIT_OBSERVATION_STATUSES: Array<{
  value: FieldVisitObservationStatus;
  label: string;
}> = [
  { value: 'open', label: 'مفتوحة' },
  { value: 'in_progress', label: 'قيد المعالجة' },
  { value: 'resolved', label: 'تمت المعالجة' },
];

const categoryValues = new Set(FIELD_VISIT_OBSERVATION_CATEGORIES.map((item) => item.value));
const severityValues = new Set(FIELD_VISIT_OBSERVATION_SEVERITIES.map((item) => item.value));
const statusValues = new Set(FIELD_VISIT_OBSERVATION_STATUSES.map((item) => item.value));

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function createFieldVisitObservation(id: string): FieldVisitObservation {
  return {
    id,
    category: 'other',
    location: '',
    description: '',
    severity: 'medium',
    required_action: '',
    responsible_party: '',
    due_date: '',
    status: 'open',
  };
}

/**
 * Fails closed to known enum values and strips unknown object keys. This keeps
 * historical visits compatible while ensuring the Phase 5B payload stays text-only.
 */
export function normalizeFieldVisitObservations(value: unknown): FieldVisitObservation[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const id = cleanText(raw.id) || `legacy-observation-${index + 1}`;
    const category = categoryValues.has(raw.category as FieldVisitObservationCategory)
      ? (raw.category as FieldVisitObservationCategory)
      : 'other';
    const severity = severityValues.has(raw.severity as FieldVisitObservationSeverity)
      ? (raw.severity as FieldVisitObservationSeverity)
      : 'medium';
    const status = statusValues.has(raw.status as FieldVisitObservationStatus)
      ? (raw.status as FieldVisitObservationStatus)
      : 'open';
    const dueDate = cleanText(raw.due_date);

    return [
      {
        id,
        category,
        location: cleanText(raw.location),
        description: cleanText(raw.description),
        severity,
        required_action: cleanText(raw.required_action),
        responsible_party: cleanText(raw.responsible_party),
        ...(dueDate ? { due_date: dueDate } : {}),
        status,
      },
    ];
  });
}

export function observationLabel(
  items: Array<{ value: string; label: string }>,
  value: string | null | undefined
): string {
  return items.find((item) => item.value === value)?.label || '—';
}
