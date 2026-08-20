import { ACTIVITY_RULES } from '@/lib/constants/activity-rules';
import {
  TECHNICAL_RECOMMENDATION_LIBRARY,
  TECHNICAL_RECOMMENDATION_LIBRARY_VERSION,
  type RecommendationLibraryItem,
  type TechnicalRecommendationDomain,
} from '@/lib/constants/technical-report-recommendations';
import { SBC_OCCUPANCIES, type SbcOccupancyCode } from '@/lib/constants/sbc801';
import { FIRE_SYSTEM_DEFS } from '@/lib/projects/design-center/types';
import type { TechnicalReportSourceData, TechnicalReportSourceSpace } from '@/lib/projects/technical-report-source-data';
import type {
  TechnicalRecommendationAffectedScope,
  TechnicalRecommendationState,
  TechnicalProjectRecommendation,
  TechnicalRecommendationStatus,
  TechnicalRecommendationSourceType,
  TechnicalReport,
} from '@/lib/types/project-reports';

export type RecommendationObservation = {
  condition_key: string;
  floor_id?: string | null;
  space_id?: string | null;
  system_key?: string | null;
  /** Explicit structured engineer observation only. Missing data never creates this input. */
  source_key?: string | null;
};

export type RecommendationCandidate = TechnicalProjectRecommendation & {
  domain: TechnicalRecommendationDomain;
  trigger: RecommendationLibraryItem['trigger'];
  is_new: boolean;
};

export type TechnicalRecommendationView = {
  suggested: RecommendationCandidate[];
  approved: RecommendationCandidate[];
  edited: RecommendationCandidate[];
  rejected: TechnicalProjectRecommendation[];
};

export type RecommendationCoverageSummary = {
  total_items: number;
  by_domain: Record<string, number>;
  by_source_document: Record<string, number>;
  global_items: number;
  activity_specific_items: number;
  system_specific_items: number;
  manual_review_items: number;
  code_backed_items: number;
  duplicates_removed: number;
  activity_coverage: Record<string, 'PASS' | 'GAP'>;
};

export type RecommendationBuildInput = {
  source_data: TechnicalReportSourceData;
  report: Pick<TechnicalReport, 'recommendations_v2'>;
  /** Optional stable project activity ID from the already loaded client record. */
  project_activity_id?: string | null;
  /** Explicit structured observations supplied by a future review surface. */
  observations?: RecommendationObservation[];
  library?: readonly RecommendationLibraryItem[];
};

const VALID_SYSTEM_KEYS: Set<string> = new Set(FIRE_SYSTEM_DEFS.map((item) => item.kind));
const VALID_ACTIVITY_IDS = new Set(Object.keys(ACTIVITY_RULES));
const VALID_OCCUPANCIES = new Set(Object.keys(SBC_OCCUPANCIES));

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function numberAboveZero(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function stableHash(input: string): string {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}

function uniqueScopes(scopes: TechnicalRecommendationAffectedScope[]): TechnicalRecommendationAffectedScope[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = [
      scope.scope_type,
      scope.floor_id || '',
      scope.space_id || '',
      scope.activity_id || '',
      scope.occupancy_code || '',
      scope.system_key || '',
      scope.condition_key || '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveOccupancyCode(raw: string | null): string | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (VALID_OCCUPANCIES.has(text)) return text;
  const normalized = text.toLowerCase();
  for (const [code, occupancy] of Object.entries(SBC_OCCUPANCIES)) {
    if (
      normalized.includes(code.toLowerCase()) ||
      normalized.includes(occupancy.group_letter.toLowerCase()) ||
      normalized.includes(occupancy.label_ar.toLowerCase())
    ) return code;
  }
  return null;
}

function inferredSystemKeys(space: TechnicalReportSourceSpace): string[] {
  const quantities = space.quantities;
  const keys: string[] = [];
  if (numberAboveZero(quantities.sprinklers.value)) keys.push('sprinkler');
  if (
    numberAboveZero(quantities.smoke_detectors.value) ||
    numberAboveZero(quantities.heat_detectors.value) ||
    numberAboveZero(quantities.fire_alarm_panels.value) ||
    numberAboveZero(quantities.alarm_bells.value)
  ) keys.push('fire_alarm');
  if (numberAboveZero(quantities.manual_extinguishers.value)) keys.push('fire_extinguisher');
  return keys;
}

function scopeFromSpace(params: {
  floor_id: string;
  space: TechnicalReportSourceSpace;
  system_key?: string | null;
  condition_key?: string | null;
  activity_id?: string | null;
}): TechnicalRecommendationAffectedScope {
  return {
    scope_type: 'space',
    floor_id: params.floor_id,
    space_id: params.space.id,
    activity_id: params.activity_id || null,
    occupancy_code: resolveOccupancyCode(params.space.occupancy.value),
    system_key: params.system_key || null,
    condition_key: params.condition_key || null,
  };
}

function projectScope(activity_id?: string | null): TechnicalRecommendationAffectedScope {
  return {
    scope_type: 'project',
    activity_id: activity_id || null,
    occupancy_code: null,
    system_key: null,
    condition_key: null,
  };
}

function resolveActivityId(raw: string | null, fallback: string | null): string | null {
  const value = String(raw || '').trim();
  if (VALID_ACTIVITY_IDS.has(value)) return value;
  const matched = Object.entries(ACTIVITY_RULES).find(([, rule]) => rule.label === value);
  return matched?.[0] || fallback;
}

function itemSupportsScope(item: RecommendationLibraryItem, scope: TechnicalRecommendationAffectedScope): boolean {
  if (item.activity_ids.length && (!scope.activity_id || !item.activity_ids.includes(scope.activity_id))) return false;
  if (item.occupancy_codes.length && (!scope.occupancy_code || !item.occupancy_codes.includes(scope.occupancy_code))) return false;
  if (item.system_keys.length && (!scope.system_key || !item.system_keys.includes(scope.system_key))) return false;
  if (item.condition_keys.length && (!scope.condition_key || !item.condition_keys.includes(scope.condition_key))) return false;
  return true;
}

function candidateFingerprint(item: RecommendationLibraryItem, scopes: TechnicalRecommendationAffectedScope[]): string {
  const variants = scopes
    .map((scope) => `${scope.system_key || ''}:${scope.condition_key || ''}`)
    .sort()
    .join(',');
  return `${item.id}|${variants || 'global'}`;
}

function normalizeStatus(value: unknown): TechnicalRecommendationStatus {
  return value === 'approved' || value === 'edited' || value === 'rejected' || value === 'suggested'
    ? value
    : 'suggested';
}

function normalizeSource(value: unknown): TechnicalRecommendationSourceType {
  return value === 'approved_reference_report' || value === 'engineer_manual' || value === 'code_backed' || value === 'system_suggestion'
    ? value
    : 'office_template';
}

export function normalizeTechnicalRecommendationState(raw: unknown): TechnicalRecommendationState {
  const value = raw && typeof raw === 'object' ? raw as Partial<TechnicalRecommendationState> : {};
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    version: 1,
    items: items
      .filter((item): item is TechnicalProjectRecommendation => Boolean(item && typeof item === 'object'))
      .map((item) => ({
        id: String(item.id || `legacy-${stableHash(String(item.library_item_id || 'recommendation'))}`),
        library_item_id: String(item.library_item_id || ''),
        library_version: String(item.library_version || TECHNICAL_RECOMMENDATION_LIBRARY_VERSION),
        status: normalizeStatus(item.status),
        effective_text_ar: String(item.effective_text_ar || ''),
        manual_override: Boolean(item.manual_override),
        sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : 0,
        fingerprint: String(item.fingerprint || item.library_item_id || ''),
        domain: typeof item.domain === 'string' && item.domain.trim() ? item.domain : null,
        affected_scopes: uniqueScopes(Array.isArray(item.affected_scopes) ? item.affected_scopes : []),
        evidence_ids: Array.isArray(item.evidence_ids) ? item.evidence_ids.map(String).filter(Boolean) : [],
        code_evidence_ids: Array.isArray(item.code_evidence_ids) ? item.code_evidence_ids.map(String).filter(Boolean) : [],
        source: normalizeSource(item.source),
        source_snapshot: item.source_snapshot && typeof item.source_snapshot === 'object'
          ? {
              source_type: normalizeSource(item.source_snapshot.source_type),
              source_document_key: typeof item.source_snapshot.source_document_key === 'string' ? item.source_snapshot.source_document_key : null,
              source_section: typeof item.source_snapshot.source_section === 'string' ? item.source_snapshot.source_section : null,
              source_page: Number.isFinite(item.source_snapshot.source_page) ? Number(item.source_snapshot.source_page) : null,
              source_text_marker: typeof item.source_snapshot.source_text_marker === 'string' ? item.source_snapshot.source_text_marker : null,
            }
          : null,
        approved_at: item.approved_at || null,
        rejection_reason: item.rejection_reason || null,
      }))
      .filter((item) => item.library_item_id && item.fingerprint),
  };
}

function previousByFingerprint(report: Pick<TechnicalReport, 'recommendations_v2'>): Map<string, TechnicalProjectRecommendation> {
  const state = report.recommendations_v2 ? normalizeTechnicalRecommendationState(report.recommendations_v2) : null;
  return new Map((state?.items || []).map((item) => [item.fingerprint, item]));
}

function toCandidate(params: {
  item: RecommendationLibraryItem;
  fingerprint: string;
  scopes: TechnicalRecommendationAffectedScope[];
  prior?: TechnicalProjectRecommendation;
}): RecommendationCandidate | null {
  const { item, fingerprint, scopes, prior } = params;
  if (prior?.status === 'rejected') return null;
  const preserved = prior && (prior.status === 'approved' || prior.status === 'edited' || prior.manual_override);
  return {
    id: prior?.id || `recommendation-${stableHash(fingerprint)}`,
    library_item_id: item.id,
    library_version: prior?.library_version || item.version,
    status: prior ? normalizeStatus(prior.status) : 'suggested',
    effective_text_ar: preserved && prior.effective_text_ar ? prior.effective_text_ar : item.text_ar,
    manual_override: Boolean(prior?.manual_override),
    sort_order: prior?.sort_order ?? 0,
    fingerprint,
    affected_scopes: uniqueScopes(scopes),
    evidence_ids: prior?.evidence_ids || [],
    code_evidence_ids: prior?.code_evidence_ids || [],
    source: prior?.source || item.source.source_type,
    source_snapshot: prior?.source_snapshot || {
      source_type: item.source.source_type,
      source_document_key: item.source.source_document_key,
      source_section: item.source.source_section,
      source_page: item.source.source_page ?? null,
      source_text_marker: item.source.source_text_marker,
    },
    approved_at: prior?.approved_at || null,
    rejection_reason: prior?.rejection_reason || null,
    domain: item.domain,
    trigger: item.trigger,
    is_new: !prior,
  };
}

/**
 * Pure matching/aggregation only. It performs no persistence, no PDF work, no
 * Storage lookup, and no inference of a defect from absent data.
 */
export function buildTechnicalReportRecommendationCandidates(input: RecommendationBuildInput): RecommendationCandidate[] {
  const library = (input.library || TECHNICAL_RECOMMENDATION_LIBRARY).filter((item) => item.active);
  const previous = previousByFingerprint(input.report);
  const byFingerprint = new Map<string, { item: RecommendationLibraryItem; scopes: TechnicalRecommendationAffectedScope[] }>();
  const activity_id = input.project_activity_id && VALID_ACTIVITY_IDS.has(input.project_activity_id)
    ? input.project_activity_id
    : null;

  const add = (item: RecommendationLibraryItem, scope: TechnicalRecommendationAffectedScope) => {
    if (!itemSupportsScope(item, scope)) return;
    const fingerprint = candidateFingerprint(item, [scope]);
    const found = byFingerprint.get(fingerprint);
    if (found) found.scopes.push(scope);
    else byFingerprint.set(fingerprint, { item, scopes: [scope] });
  };

  for (const item of library) {
    if (item.trigger === 'observation_based') continue;
    const needsSpaceScope = item.activity_ids.length > 0 || item.occupancy_codes.length > 0 || item.system_keys.length > 0;
    if (!needsSpaceScope) {
      add(item, projectScope(activity_id));
      continue;
    }
    for (const floor of input.source_data.floors) {
      for (const space of floor.spaces) {
        const spaceActivityId = resolveActivityId(space.activity_use.value, activity_id);
        const systemKeys = item.system_keys.length ? inferredSystemKeys(space) : [null];
        for (const system_key of systemKeys) {
          add(item, scopeFromSpace({ floor_id: floor.id, space, system_key, activity_id: spaceActivityId }));
        }
      }
    }
  }

  for (const observation of input.observations || []) {
    if (!present(observation.condition_key)) continue;
    const scopes = observation.space_id
      ? input.source_data.floors.flatMap((floor) => floor.spaces
        .filter((space) => space.id === observation.space_id)
        .map((space) => scopeFromSpace({ floor_id: floor.id, space, system_key: observation.system_key, condition_key: observation.condition_key, activity_id: resolveActivityId(space.activity_use.value, activity_id) })))
      : [{ ...projectScope(activity_id), system_key: observation.system_key || null, condition_key: observation.condition_key }];
    for (const item of library.filter((entry) => entry.trigger === 'observation_based')) {
      for (const scope of scopes) add(item, scope);
    }
  }

  return [...byFingerprint.entries()]
    .map(([fingerprint, candidate]) => toCandidate({
      item: candidate.item,
      fingerprint,
      scopes: candidate.scopes,
      prior: previous.get(fingerprint),
    }))
    .filter((candidate): candidate is RecommendationCandidate => Boolean(candidate))
    .sort((left, right) => left.sort_order - right.sort_order || left.library_item_id.localeCompare(right.library_item_id));
}

export function buildTechnicalReportRecommendationView(input: RecommendationBuildInput): TechnicalRecommendationView {
  const candidates = buildTechnicalReportRecommendationCandidates(input);
  const rejected = input.report.recommendations_v2
    ? normalizeTechnicalRecommendationState(input.report.recommendations_v2).items.filter((item) => item.status === 'rejected')
    : [];
  return {
    suggested: candidates.filter((item) => item.status === 'suggested'),
    approved: candidates.filter((item) => item.status === 'approved'),
    edited: candidates.filter((item) => item.status === 'edited'),
    rejected,
  };
}

export function buildRecommendationCoverageSummary(
  library: readonly RecommendationLibraryItem[] = TECHNICAL_RECOMMENDATION_LIBRARY
): RecommendationCoverageSummary {
  const by_domain: Record<string, number> = {};
  const by_source_document: Record<string, number> = {};
  for (const item of library) {
    by_domain[item.domain] = (by_domain[item.domain] || 0) + 1;
    by_source_document[item.source.source_document_key] = (by_source_document[item.source.source_document_key] || 0) + 1;
  }
  const activity_coverage = Object.fromEntries(Object.keys(ACTIVITY_RULES).map((activity) => [
    activity,
    library.some((item) => item.activity_ids.includes(activity)) ? 'PASS' : 'GAP',
  ])) as Record<string, 'PASS' | 'GAP'>;
  return {
    total_items: library.length,
    by_domain,
    by_source_document,
    global_items: library.filter((item) => !item.activity_ids.length && !item.occupancy_codes.length && !item.system_keys.length).length,
    activity_specific_items: library.filter((item) => item.activity_ids.length > 0).length,
    system_specific_items: library.filter((item) => item.system_keys.length > 0).length,
    manual_review_items: library.filter((item) => item.trigger === 'manual_review').length,
    code_backed_items: library.filter((item) => item.source.source_type === 'code_backed').length,
    duplicates_removed: 0,
    activity_coverage,
  };
}

export function validateTechnicalRecommendationLibrary(
  library: readonly RecommendationLibraryItem[] = TECHNICAL_RECOMMENDATION_LIBRARY
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of library) {
    if (!item.id || ids.has(item.id)) errors.push(`duplicate_or_empty_id:${item.id}`);
    ids.add(item.id);
    if (!item.text_ar.trim()) errors.push(`empty_text:${item.id}`);
    if (!item.source.source_document_key || !item.source.source_section || !item.source.source_text_marker) errors.push(`missing_provenance:${item.id}`);
    if (item.source.source_type === 'code_backed' && !item.source.source_page) errors.push(`untraceable_code_backed:${item.id}`);
    for (const activity of item.activity_ids) if (!VALID_ACTIVITY_IDS.has(activity)) errors.push(`invalid_activity:${item.id}:${activity}`);
    for (const occupancy of item.occupancy_codes) if (!VALID_OCCUPANCIES.has(occupancy)) errors.push(`invalid_occupancy:${item.id}:${occupancy}`);
    for (const system of item.system_keys) if (!VALID_SYSTEM_KEYS.has(system)) errors.push(`invalid_system:${item.id}:${system}`);
  }
  return errors;
}
