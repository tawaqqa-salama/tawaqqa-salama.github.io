import { TECH_REPORT_GENERAL_RECOMMENDATIONS } from '@/lib/constants/technical-report';
import { normalizeTechnicalEvidenceState } from '@/lib/projects/technical-report-evidence';
import {
  canRenderEvidenceMedia,
  EVIDENCE_MEDIA_FALLBACK_AR,
  inspectEvidenceMediaPresentation,
  type EvidenceMediaPresentation,
} from '@/lib/projects/technical-report-media-presentation';
import { normalizeTechnicalRecommendationState } from '@/lib/projects/technical-report-recommendations';
import type {
  CivilDefenseLocationEvidence,
  CodeEvidenceReference,
  TechnicalEvidenceItem,
  TechnicalEvidenceKind,
  TechnicalProjectRecommendation,
  TechnicalReport,
} from '@/lib/types/project-reports';

export type TechnicalReportPdfEvidenceGroup =
  | 'site_access'
  | 'existing_condition'
  | 'safety_system'
  | 'code_evidence';

export type TechnicalReportPdfRecommendation = {
  id: string;
  text: string;
  sort_order: number;
  source: 'phase4d' | 'legacy';
};

export type TechnicalReportPdfEvidence = {
  id: string;
  kind: TechnicalEvidenceKind;
  title: string;
  caption: string;
  engineering_note: string;
  display_order: number;
  image_src: string | null;
  mime_type: string | null;
  /** Presentation-only result; never persisted back to evidence metadata. */
  media_presentation: EvidenceMediaPresentation;
  code_reference: CodeEvidenceReference | null;
};

export type TechnicalReportPdfEvidenceGroupContent = {
  group: TechnicalReportPdfEvidenceGroup;
  title_ar: string;
  paragraphs: string[];
  items: TechnicalReportPdfEvidence[];
};

export type TechnicalReportPdfContent = {
  recommendations: TechnicalReportPdfRecommendation[];
  evidence_groups: TechnicalReportPdfEvidenceGroupContent[];
};

const LEGACY_RECOMMENDATION_LABELS = new Map(
  TECH_REPORT_GENERAL_RECOMMENDATIONS.map((item) => [item.id, item.label])
);

const SITE_KINDS = new Set<TechnicalEvidenceKind>([
  'site_general',
  'satellite_image',
  'civil_defense_map',
  'civil_defense_route',
]);

function compact(value: unknown): string {
  return String(value ?? '').trim();
}

function safePresentationSource(value: string | null | undefined): string | null {
  const source = compact(value);
  if (!source) return null;
  return source.startsWith('data:') || /^https:\/\//i.test(source) ? source : null;
}

function evidenceGroupFor(kind: TechnicalEvidenceKind): TechnicalReportPdfEvidenceGroup {
  if (SITE_KINDS.has(kind)) return 'site_access';
  if (kind === 'existing_condition') return 'existing_condition';
  if (kind === 'safety_system') return 'safety_system';
  return 'code_evidence';
}

function groupTitle(group: TechnicalReportPdfEvidenceGroup): string {
  if (group === 'site_access') return 'الموقع العام والوصول';
  if (group === 'existing_condition') return 'توثيق الوضع الراهن';
  if (group === 'safety_system') return 'توثيق أنظمة السلامة';
  return 'المراجع والمقتطفات الفنية';
}

function isFinalEngineerRecommendation(item: TechnicalProjectRecommendation): boolean {
  return item.status === 'approved' || item.status === 'edited';
}

function recommendationText(item: TechnicalProjectRecommendation): string {
  return compact(item.effective_text_ar);
}

function recommendationKey(item: Pick<TechnicalReportPdfRecommendation, 'text'>): string {
  return item.text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ar');
}

/**
 * Reads final Phase 4D decisions only. The `edited` state is a final decision
 * because Phase 4D records an approval timestamp when the engineer saves it.
 */
export function selectTechnicalReportPdfRecommendations(
  report: Pick<TechnicalReport, 'general_recommendations' | 'recommendations_v2'>
): TechnicalReportPdfRecommendation[] {
  const v2 = normalizeTechnicalRecommendationState(report.recommendations_v2);
  const finalV2 = v2.items
    .filter(isFinalEngineerRecommendation)
    .map((item) => ({
      id: item.id,
      text: recommendationText(item),
      sort_order: Number.isFinite(item.sort_order) && item.sort_order > 0 ? item.sort_order : Number.MAX_SAFE_INTEGER,
      source: 'phase4d' as const,
    }))
    .filter((item) => Boolean(item.text))
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));

  const seen = new Set<string>();
  const output: TechnicalReportPdfRecommendation[] = [];
  for (const item of finalV2) {
    const key = recommendationKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  // Historical projects have no Phase 4D decision state. Preserve their explicit
  // legacy checkboxes only when no final modern decision exists for the same text.
  for (const legacy of report.general_recommendations || []) {
    if (!legacy.checked) continue;
    const text = LEGACY_RECOMMENDATION_LABELS.get(legacy.id);
    if (!text) continue;
    const candidate: TechnicalReportPdfRecommendation = {
      id: `legacy-${legacy.id}`,
      text,
      sort_order: Number.MAX_SAFE_INTEGER,
      source: 'legacy',
    };
    const key = recommendationKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }

  return output.sort(
    (left, right) =>
      left.sort_order - right.sort_order ||
      left.source.localeCompare(right.source) ||
      left.id.localeCompare(right.id)
  );
}

function civilDefenseParagraphs(value: CivilDefenseLocationEvidence | null): string[] {
  if (!value) return [];
  const result: string[] = [];
  const center = compact(value.center_name);
  const source = compact(value.source_label);
  const distance = value.distance_value == null ? '' : compact(value.distance_value);
  const distanceUnit = value.distance_unit === 'km' ? 'كم' : value.distance_unit === 'm' ? 'م' : '';
  const travel = value.travel_time_minutes == null ? '' : compact(value.travel_time_minutes);

  if (center) result.push(`مركز الدفاع المدني المرتبط بالدراسة: ${center}.`);
  if (distance) result.push(`المسافة المسجلة: ${distance}${distanceUnit ? ` ${distanceUnit}` : ''}.`);
  if (travel) result.push(`زمن الوصول المسجل: ${travel} دقيقة.`);
  if (source) result.push(`مصدر المعلومة المسجل: ${source}.`);
  return result;
}

function neutralFallback(item: TechnicalEvidenceItem, presentation: EvidenceMediaPresentation): string {
  const title = compact(item.title) || 'مرفق فني';
  if (item.file.mimeType === 'application/pdf') {
    return `${title}: ملف PDF مرفق بالدراسة دون معاينة مرئية ضمن التقرير.`;
  }
  if (presentation.state === 'tiny' || presentation.state === 'unavailable') {
    return `${title}: ${EVIDENCE_MEDIA_FALLBACK_AR}`;
  }
  return `${title}: تعذر تحميل المرفق للمعاينة.`;
}

function mapEvidence(
  item: TechnicalEvidenceItem,
  presentationByEvidenceId?: Readonly<Record<string, EvidenceMediaPresentation>>
): TechnicalReportPdfEvidence {
  const title = compact(item.title) || 'دليل فني مرفق';
  const caption = compact(item.caption) || title;
  const mime_type = compact(item.file.mimeType) || null;
  const source = /^image\/(jpeg|png)$/i.test(mime_type || '')
    ? safePresentationSource(item.file.dataUrl)
    : null;
  const media_presentation = presentationByEvidenceId?.[item.id] || inspectEvidenceMediaPresentation(source, mime_type);
  return {
    id: item.id,
    kind: item.kind,
    title,
    caption,
    engineering_note: compact(item.engineering_observation),
    display_order: item.display_order,
    image_src: canRenderEvidenceMedia(media_presentation) ? source : null,
    mime_type,
    media_presentation,
    code_reference: item.code_reference ? { ...item.code_reference } : null,
  };
}

/**
 * Selects only explicitly report-included Phase 4A/4B evidence. It never imports
 * legacy attachments, modifies evidence state, resolves routes, or generates text
 * beyond neutral display fallbacks for unavailable media.
 */
export function selectTechnicalReportPdfEvidence(
  report: Pick<TechnicalReport, 'evidence'>,
  presentationByEvidenceId?: Readonly<Record<string, EvidenceMediaPresentation>>
): TechnicalReportPdfEvidenceGroupContent[] {
  const state = normalizeTechnicalEvidenceState(report.evidence);
  const selected = state.items
    .filter((item) => item.include_in_report)
    .sort((left, right) => left.display_order - right.display_order || left.id.localeCompare(right.id));

  const groups: TechnicalReportPdfEvidenceGroup[] = [
    'site_access',
    'existing_condition',
    'safety_system',
    'code_evidence',
  ];

  return groups
    .map((group) => {
      const sourceItems = selected.filter((item) => evidenceGroupFor(item.kind) === group);
      const items = sourceItems.map((item) => mapEvidence(item, presentationByEvidenceId));
      const paragraphs = [
        ...(group === 'site_access' ? civilDefenseParagraphs(state.civil_defense) : []),
        ...items
          .filter((item) => !item.image_src)
          .map((item) => {
            const source = sourceItems.find((candidate) => candidate.id === item.id);
            return source ? neutralFallback(source, item.media_presentation) : '';
          })
          .filter(Boolean),
      ];
      return { group, title_ar: groupTitle(group), paragraphs, items };
    })
    .filter((group) => group.items.length > 0 || group.paragraphs.length > 0);
}

export function selectTechnicalReportPdfContent(
  report: Pick<TechnicalReport, 'general_recommendations' | 'recommendations_v2' | 'evidence'>,
  presentationByEvidenceId?: Readonly<Record<string, EvidenceMediaPresentation>>
): TechnicalReportPdfContent {
  return {
    recommendations: selectTechnicalReportPdfRecommendations(report),
    evidence_groups: selectTechnicalReportPdfEvidence(report, presentationByEvidenceId),
  };
}

/** Returns only user-stored metadata that is appropriate for a neutral PDF reference. */
export function codeEvidenceReferenceLines(reference: CodeEvidenceReference | null): string[] {
  if (!reference) return [];
  const entries: Array<[string, unknown]> = [
    ['المرجع', reference.source_standard],
    ['الإصدار', reference.edition],
    ['الفصل', reference.chapter],
    ['البند', reference.clause],
    ['الجدول / الشكل', reference.table_or_figure],
    ['الصفحة', reference.page_number],
    ['القسم المرتبط', reference.related_report_section],
  ];
  return entries
    .map(([label, value]) => {
      const text = compact(value);
      return text ? `${label}: ${text}` : '';
    })
    .filter(Boolean);
}
