import {
  TECHNICAL_RECOMMENDATION_LIBRARY,
  TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
  type RecommendationLibraryItem,
} from '@/lib/constants/technical-report-recommendations';
import {
  buildRecommendationCoverageSummary,
  buildTechnicalReportRecommendationCandidates,
  normalizeTechnicalRecommendationState,
  type RecommendationBuildInput,
  type RecommendationCandidate,
} from '@/lib/projects/technical-report-recommendations';
import type {
  TechnicalEvidenceItem,
  TechnicalProjectRecommendation,
  TechnicalRecommendationAffectedScope,
  TechnicalRecommendationSourceSnapshot,
  TechnicalRecommendationStatus,
  TechnicalRecommendationState,
  TechnicalReport,
} from '@/lib/types/project-reports';

export type RecommendationReviewGroup = TechnicalRecommendationStatus;

export type RecommendationRefreshSummary = {
  new_suggestions: number;
  preserved_engineer_decisions: number;
  preserved_rejections: number;
  preserved_manual: number;
};

export type RecommendationReviewItem = TechnicalProjectRecommendation & {
  domain: string | null;
  trigger: RecommendationLibraryItem['trigger'] | 'manual';
  is_manual: boolean;
  is_new: boolean;
  source_snapshot: TechnicalRecommendationSourceSnapshot;
  reason_lines: string[];
};

export type RecommendationReviewModel = {
  items: RecommendationReviewItem[];
  groups: Record<RecommendationReviewGroup, RecommendationReviewItem[]>;
  counts: Record<RecommendationReviewGroup, number>;
  coverage_gap: boolean;
};

const ENGINEER_SOURCE: TechnicalRecommendationSourceSnapshot = {
  source_type: 'engineer_manual',
  source_document_key: null,
  source_section: null,
  source_page: null,
  source_text_marker: 'engineer_manual',
};

function now() {
  return new Date().toISOString();
}

function manualId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `manual-rec-${crypto.randomUUID()}`;
  }
  return `manual-rec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.map(String).map((value) => value.trim()).filter(Boolean))];
}

function libraryById(library: readonly RecommendationLibraryItem[]) {
  return new Map(library.map((item) => [item.id, item]));
}

function isManual(item: Pick<TechnicalProjectRecommendation, 'library_item_id' | 'source'>): boolean {
  return item.source === 'engineer_manual' || item.library_item_id.startsWith('manual-rec-');
}

function asSnapshot(
  item: Pick<TechnicalProjectRecommendation, 'source' | 'source_snapshot'>,
  libraryItem?: RecommendationLibraryItem
): TechnicalRecommendationSourceSnapshot {
  if (item.source_snapshot) return item.source_snapshot;
  if (libraryItem) {
    return {
      source_type: libraryItem.source.source_type,
      source_document_key: libraryItem.source.source_document_key,
      source_section: libraryItem.source.source_section,
      source_page: libraryItem.source.source_page ?? null,
      source_text_marker: libraryItem.source.source_text_marker,
    };
  }
  return ENGINEER_SOURCE;
}

function reasonLines(params: {
  item: Pick<TechnicalProjectRecommendation, 'affected_scopes' | 'source'>;
  libraryItem?: RecommendationLibraryItem;
  manual: boolean;
}): string[] {
  if (params.manual) return ['توصية أدخلها المهندس يدويًا؛ لا تستند إلى اقتراح تلقائي.'];
  const lines: string[] = [];
  const scopes = params.item.affected_scopes || [];
  const conditions = dedupeStrings(scopes.map((scope) => scope.condition_key || ''));
  const systems = dedupeStrings(scopes.map((scope) => scope.system_key || ''));
  const occupancies = dedupeStrings(scopes.map((scope) => scope.occupancy_code || ''));
  const activities = dedupeStrings(scopes.map((scope) => scope.activity_id || ''));

  if (conditions.length) lines.push(`استند الاقتراح إلى ملاحظة هندسية موثقة: ${conditions.join('، ')}.`);
  if (systems.length) lines.push(`ينطبق الاقتراح على النظام المرتبط: ${systems.join('، ')}.`);
  if (occupancies.length) lines.push(`انطبق على إشغال موثق: ${occupancies.join('، ')}.`);
  if (activities.length) lines.push(`انطبق على نشاط موثق: ${activities.join('، ')}.`);
  if (!lines.length && params.libraryItem?.trigger === 'manual_review') {
    lines.push('هذه توصية مرجعية تحتاج مراجعة المهندس؛ لا يفترض النظام وجود مخالفة.');
  }
  if (!lines.length) {
    lines.push('توصية عامة من المكتبة الحالية؛ لا يستنتج النظام نقصًا أو عدم مطابقة من بيانات غير مدخلة.');
  }
  return lines;
}

function toReviewItem(params: {
  item: TechnicalProjectRecommendation;
  libraryItem?: RecommendationLibraryItem;
  trigger?: RecommendationLibraryItem['trigger'];
  isNew?: boolean;
}): RecommendationReviewItem {
  const manual = isManual(params.item);
  return {
    ...params.item,
    domain: params.item.domain || params.libraryItem?.domain || null,
    trigger: manual ? 'manual' : params.trigger || params.libraryItem?.trigger || 'manual_review',
    is_manual: manual,
    is_new: Boolean(params.isNew),
    source_snapshot: asSnapshot(params.item, params.libraryItem),
    reason_lines: reasonLines({ item: params.item, libraryItem: params.libraryItem, manual }),
  };
}

function uniqueByFingerprint(items: TechnicalProjectRecommendation[]): TechnicalProjectRecommendation[] {
  const byFingerprint = new Map<string, TechnicalProjectRecommendation>();
  for (const item of items) {
    const current = byFingerprint.get(item.fingerprint);
    const shouldReplace = !current ||
      (current.status === 'suggested' && item.status !== 'suggested') ||
      (current.status === 'approved' && item.status === 'edited');
    if (shouldReplace) byFingerprint.set(item.fingerprint, item);
  }
  return [...byFingerprint.values()];
}

function nextSortOrder(state: TechnicalRecommendationState): number {
  return Math.max(0, ...state.items.map((item) => item.sort_order || 0)) + 1;
}

export function emptyRecommendationState(): TechnicalRecommendationState {
  return { version: 1, items: [] };
}

export function recommendationState(report: Pick<TechnicalReport, 'recommendations_v2'>): TechnicalRecommendationState {
  return report.recommendations_v2
    ? normalizeTechnicalRecommendationState(report.recommendations_v2)
    : emptyRecommendationState();
}

export function updateRecommendationState(
  report: TechnicalReport,
  state: TechnicalRecommendationState
): TechnicalReport {
  return { ...report, recommendations_v2: normalizeTechnicalRecommendationState(state) };
}

/**
 * Reconciles only generated candidates. Explicit decisions and manual entries are retained even
 * when current source data changes, so a refresh cannot erase the engineer's decision.
 */
export function refreshTechnicalRecommendationState(input: RecommendationBuildInput): {
  state: TechnicalRecommendationState;
  summary: RecommendationRefreshSummary;
} {
  const previous = recommendationState(input.report);
  const candidates = buildTechnicalReportRecommendationCandidates(input);
  const generated = candidates.map((candidate) => ({ ...candidate }));
  const decisions = previous.items.filter((item) => item.status !== 'suggested' || isManual(item));
  const merged = uniqueByFingerprint([...generated, ...decisions]);
  const state: TechnicalRecommendationState = { version: 1, items: merged };
  return {
    state,
    summary: {
      new_suggestions: generated.filter((item) => item.status === 'suggested' && item.is_new).length,
      preserved_engineer_decisions: decisions.filter((item) => item.status === 'approved' || item.status === 'edited').length,
      preserved_rejections: decisions.filter((item) => item.status === 'rejected').length,
      preserved_manual: decisions.filter(isManual).length,
    },
  };
}

export function buildRecommendationReviewModel(input: RecommendationBuildInput): RecommendationReviewModel {
  const library = input.library || TECHNICAL_RECOMMENDATION_LIBRARY;
  const byId = libraryById(library);
  const refreshed = refreshTechnicalRecommendationState(input).state;
  const currentCandidates = buildTechnicalReportRecommendationCandidates(input);
  const candidateByFingerprint = new Map(currentCandidates.map((item) => [item.fingerprint, item]));
  const items = refreshed.items
    .map((item) => {
      const candidate = candidateByFingerprint.get(item.fingerprint) as RecommendationCandidate | undefined;
      return toReviewItem({
        item,
        libraryItem: byId.get(item.library_item_id),
        trigger: candidate?.trigger,
        isNew: candidate?.is_new,
      });
    })
    .sort((left, right) => left.sort_order - right.sort_order || left.effective_text_ar.localeCompare(right.effective_text_ar, 'ar'));
  const groups: Record<RecommendationReviewGroup, RecommendationReviewItem[]> = {
    suggested: items.filter((item) => item.status === 'suggested'),
    approved: items.filter((item) => item.status === 'approved'),
    edited: items.filter((item) => item.status === 'edited'),
    rejected: items.filter((item) => item.status === 'rejected'),
  };
  const coverage = buildRecommendationCoverageSummary(library);
  return {
    items,
    groups,
    counts: {
      suggested: groups.suggested.length,
      approved: groups.approved.length,
      edited: groups.edited.length,
      rejected: groups.rejected.length,
    },
    coverage_gap: Object.values(coverage.activity_coverage).some((value) => value === 'GAP'),
  };
}

function replaceItem(
  state: TechnicalRecommendationState,
  next: TechnicalProjectRecommendation
): TechnicalRecommendationState {
  const hasItem = state.items.some((item) => item.id === next.id || item.fingerprint === next.fingerprint);
  return {
    version: 1,
    items: hasItem
      ? state.items.map((item) => item.id === next.id || item.fingerprint === next.fingerprint ? next : item)
      : [...state.items, next],
  };
}

export function approveRecommendation(
  report: Pick<TechnicalReport, 'recommendations_v2'>,
  recommendation: TechnicalProjectRecommendation
): TechnicalRecommendationState {
  const state = recommendationState(report);
  return replaceItem(state, {
    ...recommendation,
    status: 'approved',
    approved_at: recommendation.approved_at || now(),
    rejection_reason: null,
  });
}

export function editRecommendation(
  report: Pick<TechnicalReport, 'recommendations_v2'>,
  recommendation: TechnicalProjectRecommendation,
  text: string
): TechnicalRecommendationState {
  const effective = text.trim();
  if (!effective) return recommendationState(report);
  const state = recommendationState(report);
  return replaceItem(state, {
    ...recommendation,
    status: 'edited',
    effective_text_ar: effective,
    manual_override: true,
    approved_at: recommendation.approved_at || now(),
    rejection_reason: null,
  });
}

export function rejectRecommendation(
  report: Pick<TechnicalReport, 'recommendations_v2'>,
  recommendation: TechnicalProjectRecommendation,
  rejectionReason?: string | null
): TechnicalRecommendationState {
  const state = recommendationState(report);
  return replaceItem(state, {
    ...recommendation,
    status: 'rejected',
    rejection_reason: rejectionReason?.trim() || null,
  });
}

export function reconsiderRecommendation(
  report: Pick<TechnicalReport, 'recommendations_v2'>,
  recommendation: TechnicalProjectRecommendation
): TechnicalRecommendationState {
  const state = recommendationState(report);
  return replaceItem(state, {
    ...recommendation,
    status: 'suggested',
    rejection_reason: null,
  });
}

export function addManualRecommendation(params: {
  report: Pick<TechnicalReport, 'recommendations_v2'>;
  text: string;
  domain?: string | null;
  affected_scopes?: TechnicalRecommendationAffectedScope[];
  evidence_ids?: string[];
  code_evidence_ids?: string[];
}): TechnicalRecommendationState {
  const text = params.text.trim();
  const state = recommendationState(params.report);
  if (!text) return state;
  const id = manualId();
  return {
    version: 1,
    items: [
      ...state.items,
      {
        id,
        library_item_id: id,
        library_version: `manual-${TECHNICAL_RECOMMENDATION_LIBRARY_VERSION}`,
        status: 'suggested',
        effective_text_ar: text,
        manual_override: true,
        sort_order: nextSortOrder(state),
        fingerprint: `manual:${id}`,
        domain: params.domain?.trim() || null,
        affected_scopes: params.affected_scopes || [],
        evidence_ids: dedupeStrings(params.evidence_ids || []),
        code_evidence_ids: dedupeStrings(params.code_evidence_ids || []),
        source: 'engineer_manual',
        source_snapshot: ENGINEER_SOURCE,
        approved_at: null,
        rejection_reason: null,
      },
    ],
  };
}

export function setRecommendationEvidenceLinks(params: {
  report: Pick<TechnicalReport, 'recommendations_v2'>;
  recommendation: TechnicalProjectRecommendation;
  evidence: readonly TechnicalEvidenceItem[];
  evidence_ids?: string[];
  code_evidence_ids?: string[];
}): TechnicalRecommendationState {
  const allowedEvidence = new Set(params.evidence.map((item) => item.id));
  const allowedCode = new Set(params.evidence.filter((item) => item.kind === 'code_excerpt').map((item) => item.id));
  const state = recommendationState(params.report);
  return replaceItem(state, {
    ...params.recommendation,
    evidence_ids: dedupeStrings(params.evidence_ids || []).filter((id) => allowedEvidence.has(id)),
    code_evidence_ids: dedupeStrings(params.code_evidence_ids || []).filter((id) => allowedCode.has(id)),
  });
}

export function reorderApprovedRecommendations(
  report: Pick<TechnicalReport, 'recommendations_v2'>,
  recommendationId: string,
  direction: -1 | 1
): TechnicalRecommendationState {
  const state = recommendationState(report);
  const ordered = state.items
    .filter((item) => item.status === 'approved' || item.status === 'edited')
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
  const index = ordered.findIndex((item) => item.id === recommendationId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return state;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  const sortById = new Map(ordered.map((item, position) => [item.id, position + 1]));
  return {
    version: 1,
    items: state.items.map((item) => sortById.has(item.id) ? { ...item, sort_order: sortById.get(item.id)! } : item),
  };
}

export function isEvidenceLinkValid(
  evidence: readonly TechnicalEvidenceItem[],
  id: string,
  codeOnly = false
): boolean {
  return evidence.some((item) => item.id === id && (!codeOnly || item.kind === 'code_excerpt'));
}
