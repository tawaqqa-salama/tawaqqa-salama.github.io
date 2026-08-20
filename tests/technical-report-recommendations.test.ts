import { describe, expect, it } from 'vitest';
import { TECHNICAL_RECOMMENDATION_LIBRARY, TECHNICAL_RECOMMENDATION_LIBRARY_VERSION, type RecommendationLibraryItem } from '@/lib/constants/technical-report-recommendations';
import {
  buildRecommendationCoverageSummary,
  buildTechnicalReportRecommendationCandidates,
  buildTechnicalReportRecommendationView,
  normalizeTechnicalRecommendationState,
  validateTechnicalRecommendationLibrary,
} from '@/lib/projects/technical-report-recommendations';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import type { TechnicalReportSourceData, TechnicalReportSourceField, TechnicalReportSourceSpace } from '@/lib/projects/technical-report-source-data';
import type { TechnicalRecommendationState } from '@/lib/types/project-reports';

const field = <T extends string | number | boolean | null>(value: T): TechnicalReportSourceField<T> => ({
  value,
  final_value: value,
  auto_value: value,
  source: value == null ? 'missing' : 'space_safety',
  source_stage: value == null ? 'missing' : 'space_safety',
  source_key: null,
  status: value == null ? 'missing' : 'inherited',
  classification: 'AUTO_SUGGEST',
  engineer_override: false,
});

function space(id: string, occupancy: string | null, systems: { sprinklers?: number; smoke?: number; extinguishers?: number } = {}, activity: string | null = null): TechnicalReportSourceSpace {
  return {
    id,
    source_usage_id: null,
    name: field(`مساحة ${id}`),
    activity_use: field(activity),
    area_m2: field(100),
    occupancy: field(occupancy),
    hazard_classification: field(null),
    occupants: field(0),
    exits: field(0),
    travel_distance_m: field(null),
    suggestion_overrides: null,
    quantities: {
      sprinklers: field(systems.sprinklers ?? 0), smoke_detectors: field(systems.smoke ?? 0), heat_detectors: field(0),
      fire_alarm_panels: field(0), alarm_panel_locations: field(null), signs: field(0), emergency_lights: field(0),
      emergency_exits: field(0), alarm_bells: field(0), emergency_stairs: field(0),
      manual_extinguishers: field(systems.extinguishers ?? 0), manual_extinguisher_type: field(null), manual_extinguisher_size: field(null),
    },
  };
}

function sourceData(spaces: TechnicalReportSourceSpace[]): TechnicalReportSourceData {
  return {
    version: 1,
    project: {} as TechnicalReportSourceData['project'],
    plan: {} as TechnicalReportSourceData['plan'],
    floors: [{ id: 'floor-1', name: field('الأرضي'), base_area_m2: field(100), repeat_count: field(1), total_area_m2: field(100), occupants: field(0), exits: field(0), travel_distance_m: field(null), spaces }],
    aggregates: {} as TechnicalReportSourceData['aggregates'],
    precedence: {},
  };
}

const customItem = (overrides: Partial<RecommendationLibraryItem>): RecommendationLibraryItem => ({
  id: 'test-item', version: TECHNICAL_RECOMMENDATION_LIBRARY_VERSION, text_ar: 'توصية اختبار مصدرها قالب مكتبي.', domain: 'general_safety',
  activity_ids: [], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [], trigger: 'data_based', priority: 'medium', active: true,
  source: { source_type: 'office_template', source_document_key: 'test-office-template', source_section: 'اختبار', source_page: null, source_text_marker: 'test' },
  ...overrides,
});

describe('Phase 4C recommendation library', () => {
  it('has a versioned, source-supported manifest with no invalid IDs, sources, systems, or code claims', () => {
    expect(TECHNICAL_RECOMMENDATION_LIBRARY_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}\.\d+$/);
    expect(TECHNICAL_RECOMMENDATION_LIBRARY.length).toBeGreaterThan(0);
    expect(validateTechnicalRecommendationLibrary()).toEqual([]);
    expect(TECHNICAL_RECOMMENDATION_LIBRARY.every((item) => item.source.source_type === 'office_template')).toBe(true);
    expect(TECHNICAL_RECOMMENDATION_LIBRARY.every((item) => item.text_ar.trim().length > 0)).toBe(true);
  });

  it('reports coverage gaps rather than inventing activity-specific content', () => {
    const summary = buildRecommendationCoverageSummary();
    expect(summary.total_items).toBe(TECHNICAL_RECOMMENDATION_LIBRARY.length);
    expect(summary.code_backed_items).toBe(0);
    expect(summary.activity_specific_items).toBe(0);
    expect(summary.activity_coverage.office).toBe('GAP');
    expect(summary.activity_coverage.warehouse).toBe('GAP');
  });

  it('suggests only applicable data-based global/office candidates and never auto-approves', () => {
    const candidates = buildTechnicalReportRecommendationCandidates({ source_data: sourceData([space('office', 'business')]), report: {}, project_activity_id: 'office' });
    expect(candidates.some((item) => item.library_item_id === 'rec-lib-follow-approved-design')).toBe(true);
    expect(candidates.every((item) => item.status === 'suggested')).toBe(true);
    expect(candidates.every((item) => item.manual_override === false)).toBe(true);
  });

  it('supports storage-scoped candidates only when a source-supported item explicitly maps to storage', () => {
    const library = [customItem({ id: 'storage-review', activity_ids: ['warehouse'], occupancy_codes: ['storage_moderate'], text_ar: 'مراجعة تخزين اختبارية من مصدر معتمد.' })];
    const candidates = buildTechnicalReportRecommendationCandidates({ source_data: sourceData([space('storage', 'storage_moderate')]), report: {}, project_activity_id: 'warehouse', library });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].affected_scopes[0].activity_id).toBe('warehouse');
  });

  it('preserves candidates from every space in a mixed-occupancy project', () => {
    const library = [
      customItem({ id: 'office-item', activity_ids: ['office'], text_ar: 'توصية مكتب اختبارية.' }),
      customItem({ id: 'warehouse-item', activity_ids: ['warehouse'], text_ar: 'توصية مستودع اختبارية.' }),
      customItem({ id: 'assembly-item', activity_ids: ['restaurant'], text_ar: 'توصية تجمع اختبارية.' }),
    ];
    const results = buildTechnicalReportRecommendationCandidates({
      source_data: sourceData([
        space('space-office', 'business', {}, 'office'),
        space('space-warehouse', 'storage_moderate', {}, 'warehouse'),
        space('space-assembly', 'assembly', {}, 'restaurant'),
      ]),
      report: {},
      library,
    });
    expect(results.map((item) => item.library_item_id).sort()).toEqual(['assembly-item', 'office-item', 'warehouse-item']);
  });

  it('does not create a defect candidate from missing or zero data', () => {
    const results = buildTechnicalReportRecommendationCandidates({ source_data: sourceData([space('missing', null, { sprinklers: 0, smoke: 0 })]), report: {}, observations: [] });
    expect(results.some((item) => item.trigger === 'observation_based')).toBe(false);
    expect(results.every((item) => item.status === 'suggested')).toBe(true);
  });

  it('matches explicit observations, merges five matching scopes, and keeps different conditions separate', () => {
    const spaces = Array.from({ length: 5 }, (_, index) => space(`egress-${index}`, 'business'));
    const obstructed = buildTechnicalReportRecommendationCandidates({
      source_data: sourceData(spaces), report: {}, observations: spaces.map((item) => ({ condition_key: 'obstructed', space_id: item.id })),
    });
    const obstructedCandidate = obstructed.filter((item) => item.library_item_id === 'rec-lib-egress-obstruction');
    expect(obstructedCandidate).toHaveLength(1);
    expect(obstructedCandidate[0].affected_scopes).toHaveLength(5);
    const split = buildTechnicalReportRecommendationCandidates({
      source_data: sourceData([space('egress', 'business')]), report: {}, observations: [
        { condition_key: 'obstructed', space_id: 'egress' },
        { condition_key: 'inaccessible', space_id: 'egress' },
      ],
    });
    expect(split.filter((item) => ['rec-lib-egress-obstruction', 'rec-lib-fdc-access'].includes(item.library_item_id)).map((item) => item.library_item_id).sort()).toEqual(['rec-lib-egress-obstruction', 'rec-lib-fdc-access']);
  });

  it('preserves approved, edited, rejected, and library-version snapshot decisions across refresh', () => {
    const base = buildTechnicalReportRecommendationCandidates({ source_data: sourceData([space('office', 'business')]), report: {} })[0];
    const state: TechnicalRecommendationState = {
      version: 1,
      items: [
        { ...base, id: 'approved', status: 'approved', approved_at: '2026-08-20T00:00:00Z', library_version: '2025.01.01.1' },
      ],
    };
    const approved = buildTechnicalReportRecommendationCandidates({ source_data: sourceData([space('office', 'business')]), report: { recommendations_v2: state } });
    expect(approved[0].status).toBe('approved');
    expect(approved[0].library_version).toBe('2025.01.01.1');

    const editedState: TechnicalRecommendationState = { version: 1, items: [{ ...base, id: 'edited', status: 'edited', manual_override: true, effective_text_ar: 'نص مهندس معتمد.', library_version: '2025.01.01.1' }] };
    const edited = buildTechnicalReportRecommendationCandidates({ source_data: sourceData([space('office', 'business')]), report: { recommendations_v2: editedState } });
    expect(edited[0].effective_text_ar).toBe('نص مهندس معتمد.');
    expect(edited[0].manual_override).toBe(true);

    const viewLibrary = [
      customItem({ id: 'view-approved', text_ar: 'توصية اعتماد اختبارية.' }),
      customItem({ id: 'view-edited', text_ar: 'توصية تعديل اختبارية.' }),
    ];
    const viewCandidates = buildTechnicalReportRecommendationCandidates({ source_data: sourceData([space('office', 'business')]), report: {}, library: viewLibrary });
    const stateView = buildTechnicalReportRecommendationView({ source_data: sourceData([space('office', 'business')]), library: viewLibrary, report: { recommendations_v2: { version: 1, items: [
      { ...viewCandidates[0], id: 'approved-view', status: 'approved' },
      { ...viewCandidates[1], id: 'edited-view', status: 'edited', manual_override: true, effective_text_ar: 'نص محرر.' },
    ] } } });
    expect(stateView.approved).toHaveLength(1);
    expect(stateView.edited).toHaveLength(1);

    const rejectedState: TechnicalRecommendationState = { version: 1, items: [{ ...base, id: 'rejected', status: 'rejected', rejection_reason: 'غير منطبق' }] };
    const view = buildTechnicalReportRecommendationView({ source_data: sourceData([space('office', 'business')]), report: { recommendations_v2: rejectedState } });
    expect(view.suggested.some((item) => item.fingerprint === base.fingerprint)).toBe(false);
    expect(view.rejected).toHaveLength(1);
  });

  it('normalizes present recommendation state but leaves legacy projects without recommendations_v2 unmodified', () => {
    const normalized = normalizeTechnicalRecommendationState({ version: 4, items: [{ library_item_id: 'rec-lib-follow-approved-design', fingerprint: 'rec-lib-follow-approved-design|global', status: 'approved', effective_text_ar: 'نص', source: 'office_template' }] });
    expect(normalized.version).toBe(1);
    expect(normalized.items).toHaveLength(1);
    const legacy = parseProjectEngineeringData({ technical_report: { general_recommendations: [{ id: 'rec_follow_design', checked: true }] } } as never);
    expect(legacy.technical_report.general_recommendations).toEqual([{ id: 'rec_follow_design', checked: true }]);
    expect(legacy.technical_report.recommendations_v2).toBeUndefined();
  });
});
