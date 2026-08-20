import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  addManualRecommendation,
  approveRecommendation,
  buildRecommendationReviewModel,
  editRecommendation,
  isEvidenceLinkValid,
  recommendationState,
  reconsiderRecommendation,
  refreshTechnicalRecommendationState,
  rejectRecommendation,
  reorderApprovedRecommendations,
  setRecommendationEvidenceLinks,
  updateRecommendationState,
} from '@/lib/projects/technical-report-recommendation-review';
import type { RecommendationLibraryItem } from '@/lib/constants/technical-report-recommendations';
import type { TechnicalEvidenceItem, TechnicalProjectRecommendation, TechnicalReport, TechnicalRecommendationState } from '@/lib/types/project-reports';
import type { TechnicalReportSourceData, TechnicalReportSourceField, TechnicalReportSourceSpace } from '@/lib/projects/technical-report-source-data';

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

function space(id: string, activity: string, occupancy: string, sprinklers = 0): TechnicalReportSourceSpace {
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
      sprinklers: field(sprinklers), smoke_detectors: field(0), heat_detectors: field(0), fire_alarm_panels: field(0), alarm_panel_locations: field(null), signs: field(0), emergency_lights: field(0), emergency_exits: field(0), alarm_bells: field(0), emergency_stairs: field(0), manual_extinguishers: field(0), manual_extinguisher_type: field(null), manual_extinguisher_size: field(null),
    },
  };
}

function sourceData(spaces: TechnicalReportSourceSpace[]): TechnicalReportSourceData {
  return {
    version: 1,
    project: {} as TechnicalReportSourceData['project'],
    plan: {} as TechnicalReportSourceData['plan'],
    floors: [{ id: 'floor-1', name: field('الأرضي'), base_area_m2: field(300), repeat_count: field(1), total_area_m2: field(300), occupants: field(0), exits: field(0), travel_distance_m: field(null), spaces }],
    aggregates: {} as TechnicalReportSourceData['aggregates'],
    precedence: {},
  };
}

const libraryItem = (overrides: Partial<RecommendationLibraryItem> = {}): RecommendationLibraryItem => ({
  id: 'office-rec', version: '2026.08.20.1', text_ar: 'توصية مكتب مصدرية.', domain: 'general_safety', activity_ids: ['office'], occupancy_codes: [], hazard_classes: [], system_keys: [], condition_keys: [], trigger: 'data_based', priority: 'medium', active: true,
  source: { source_type: 'office_template', source_document_key: 'office-template', source_section: 'التوصيات', source_page: null, source_text_marker: 'office-rec' },
  ...overrides,
});

const evidence = (id: string, kind: TechnicalEvidenceItem['kind']): TechnicalEvidenceItem => ({
  id, kind, category: kind, title: id, caption: null, engineering_observation: null, taken_at: null, display_order: 1, include_in_report: false, association: null,
  file: { id: `file-${id}`, fileName: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes: 1, storagePath: `technical-evidence/${id}.pdf`, storageBucket: 'project-files', dataUrl: null },
  code_reference: kind === 'code_excerpt' ? { source_standard: 'SBC 801', clause: '1.2', page_number: 4 } : null,
  created_at: '2026-08-20T00:00:00Z',
});

function recommendation(overrides: Partial<TechnicalProjectRecommendation> = {}): TechnicalProjectRecommendation {
  return {
    id: 'rec-1', library_item_id: 'office-rec', library_version: '2026.08.20.1', status: 'suggested', effective_text_ar: 'توصية مكتب مصدرية.', manual_override: false, sort_order: 1, fingerprint: 'office-rec|global', domain: 'general_safety', affected_scopes: [{ scope_type: 'space', floor_id: 'floor-1', space_id: 'office', activity_id: 'office', occupancy_code: 'business', system_key: null, condition_key: null }], evidence_ids: [], code_evidence_ids: [], source: 'office_template', source_snapshot: { source_type: 'office_template', source_document_key: 'office-template', source_section: 'التوصيات', source_page: null, source_text_marker: 'office-rec' }, approved_at: null, rejection_reason: null,
    ...overrides,
  };
}

const report = (state?: TechnicalRecommendationState): Pick<TechnicalReport, 'recommendations_v2'> => ({ recommendations_v2: state });

describe('Phase 4D recommendation review', () => {
  it('renders the review section after observations and before approval without importing PDF or storage components', () => {
    const section = readFileSync('components/projects/TechnicalReportSection.tsx', 'utf8');
    const ui = readFileSync('lib/projects/technical-report-ui.ts', 'utf8');
    const review = readFileSync('components/projects/TechnicalRecommendationReview.tsx', 'utf8');
    expect(ui.indexOf("id: 'observations'")).toBeLessThan(ui.indexOf("id: 'recommendation_review'"));
    expect(ui.indexOf("id: 'recommendation_review'")).toBeLessThan(ui.indexOf("id: 'approval'"));
    expect(section).toContain('TechnicalRecommendationReview');
    expect(review).toContain('سبب الاقتراح');
    expect(review).toContain('ربط دليل / مقتطف كودي');
    expect(review).toContain('dir="rtl"');
    expect(review).not.toContain('TechnicalReportPrint');
    expect(review).not.toContain('uploadTechnicalEvidenceFile');
  });

  it('shows separate suggested/approved/edited/rejected groups with source, scope, and a documented coverage gap', () => {
    const state: TechnicalRecommendationState = { version: 1, items: [
      recommendation({ status: 'approved', id: 'approved' }),
      recommendation({ status: 'edited', id: 'edited', fingerprint: 'office-rec|edited', effective_text_ar: 'نص محرر.', manual_override: true }),
      recommendation({ status: 'rejected', id: 'rejected', fingerprint: 'office-rec|rejected' }),
    ] };
    const model = buildRecommendationReviewModel({ source_data: sourceData([space('office', 'office', 'business')]), report: report(state), library: [libraryItem()] });
    expect(model.counts).toMatchObject({ suggested: 1, approved: 1, edited: 1, rejected: 1 });
    expect(model.groups.approved[0].source_snapshot.source_document_key).toBe('office-template');
    expect(model.groups.approved[0].affected_scopes[0].space_id).toBe('office');
    expect(model.coverage_gap).toBe(true);
  });

  it('approves, edits, rejects, and reconsiders without automatic engineer approval', () => {
    const original = recommendation();
    const approved = approveRecommendation(report(), original);
    expect(approved.items[0]).toMatchObject({ status: 'approved', manual_override: false });
    expect(approved.items[0].approved_at).toBeTruthy();

    const edited = editRecommendation(report(approved), approved.items[0], 'نص اعتمده المهندس.');
    expect(edited.items[0]).toMatchObject({ status: 'edited', manual_override: true, effective_text_ar: 'نص اعتمده المهندس.' });

    const rejected = rejectRecommendation(report(edited), edited.items[0], 'غير منطبق');
    expect(rejected.items[0]).toMatchObject({ status: 'rejected', rejection_reason: 'غير منطبق' });

    const reconsidered = reconsiderRecommendation(report(rejected), rejected.items[0]);
    expect(reconsidered.items[0]).toMatchObject({ status: 'suggested', rejection_reason: null });
  });

  it('adds manual recommendations as suggested review items and preserves original legacy recommendations when state is attached', () => {
    const state = addManualRecommendation({ report: report(), text: 'توصية مدخلة من المهندس', domain: 'maintenance' });
    expect(state.items[0]).toMatchObject({ status: 'suggested', source: 'engineer_manual', manual_override: true });
    const updated = updateRecommendationState({ ...report(), general_recommendations: [{ id: 'rec_follow_design', checked: true }] } as TechnicalReport, state);
    expect(updated.general_recommendations).toEqual([{ id: 'rec_follow_design', checked: true }]);
    expect(updated.recommendations_v2?.items).toHaveLength(1);
  });

  it('links only local current-project evidence IDs, filters code evidence, and unlinking does not alter evidence items', () => {
    const rawEvidence = [evidence('photo-1', 'existing_condition'), evidence('code-1', 'code_excerpt')];
    const linked = setRecommendationEvidenceLinks({ report: report(), recommendation: recommendation(), evidence: rawEvidence, evidence_ids: ['photo-1', 'missing'], code_evidence_ids: ['code-1', 'photo-1', 'missing'] });
    expect(linked.items[0].evidence_ids).toEqual(['photo-1']);
    expect(linked.items[0].code_evidence_ids).toEqual(['code-1']);
    const unlinked = setRecommendationEvidenceLinks({ report: report(linked), recommendation: linked.items[0], evidence: rawEvidence, evidence_ids: [], code_evidence_ids: [] });
    expect(unlinked.items[0].evidence_ids).toEqual([]);
    expect(rawEvidence).toHaveLength(2);
    expect(isEvidenceLinkValid(rawEvidence, 'code-1', true)).toBe(true);
    expect(isEvidenceLinkValid(rawEvidence, 'photo-1', true)).toBe(false);
  });

  it('reorders approved/edited decisions while leaving suggestions untouched', () => {
    const state: TechnicalRecommendationState = { version: 1, items: [
      recommendation({ id: 'suggested', fingerprint: 's', status: 'suggested', sort_order: 99 }),
      recommendation({ id: 'approved', fingerprint: 'a', status: 'approved', sort_order: 1 }),
      recommendation({ id: 'edited', fingerprint: 'e', status: 'edited', sort_order: 2 }),
    ] };
    const moved = reorderApprovedRecommendations(report(state), 'edited', -1);
    expect(moved.items.find((item) => item.id === 'edited')?.sort_order).toBe(1);
    expect(moved.items.find((item) => item.id === 'approved')?.sort_order).toBe(2);
    expect(moved.items.find((item) => item.id === 'suggested')?.sort_order).toBe(99);
  });

  it('refreshes candidates without overwriting approved, edited, rejected, manual, or mixed-occupancy decisions', () => {
    const state: TechnicalRecommendationState = { version: 1, items: [
      recommendation({ id: 'approved', status: 'approved' }),
      recommendation({ id: 'edited', status: 'edited', fingerprint: 'office-rec|edited', effective_text_ar: 'لا تستبدل هذا النص.', manual_override: true }),
      recommendation({ id: 'rejected', status: 'rejected', fingerprint: 'office-rec|rejected' }),
      recommendation({ id: 'manual', library_item_id: 'manual-rec-1', fingerprint: 'manual:manual-rec-1', source: 'engineer_manual', source_snapshot: { source_type: 'engineer_manual' }, status: 'suggested', effective_text_ar: 'يدوية', manual_override: true }),
    ] };
    const outcome = refreshTechnicalRecommendationState({
      source_data: sourceData([
        space('office', 'office', 'business'),
        space('warehouse', 'warehouse', 'storage_moderate'),
        space('assembly', 'restaurant', 'assembly'),
      ]),
      report: report(state),
      library: [libraryItem()],
    });
    expect(outcome.state.items.find((item) => item.id === 'approved')?.status).toBe('approved');
    expect(outcome.state.items.find((item) => item.id === 'edited')?.effective_text_ar).toBe('لا تستبدل هذا النص.');
    expect(outcome.state.items.find((item) => item.id === 'rejected')?.status).toBe('rejected');
    expect(outcome.state.items.find((item) => item.id === 'manual')?.effective_text_ar).toBe('يدوية');
    expect(outcome.summary).toMatchObject({ preserved_engineer_decisions: 2, preserved_rejections: 1, preserved_manual: 1 });
  });

  it('preserves decision state, source snapshot, scope, links, and sort order through normalize-style reload', () => {
    const state: TechnicalRecommendationState = { version: 1, items: [recommendation({
      status: 'edited', effective_text_ar: 'نص محرر محفوظ.', manual_override: true, domain: 'means_of_egress', evidence_ids: ['photo-1'], code_evidence_ids: ['code-1'], sort_order: 7,
      source_snapshot: { source_type: 'office_template', source_document_key: 'office-template', source_section: 'المخارج', source_page: 3, source_text_marker: 'ex_routes' },
    })] };
    const reloaded = recommendationState({ recommendations_v2: JSON.parse(JSON.stringify(state)) });
    expect(reloaded.items[0]).toMatchObject({
      status: 'edited', effective_text_ar: 'نص محرر محفوظ.', manual_override: true, domain: 'means_of_egress', evidence_ids: ['photo-1'], code_evidence_ids: ['code-1'], sort_order: 7,
      source_snapshot: { source_document_key: 'office-template', source_section: 'المخارج', source_page: 3 },
    });
    expect(reloaded.items[0].affected_scopes[0]).toMatchObject({ floor_id: 'floor-1', space_id: 'office' });
  });

  it('does not infer a defect from missing or zero data during recommendation refresh', () => {
    const outcome = refreshTechnicalRecommendationState({
      source_data: sourceData([space('unknown', 'office', '', 0)]),
      report: report(),
      library: [libraryItem({ activity_ids: [], system_keys: ['sprinkler'], text_ar: 'توصية نظام اختبارية.' })],
    });
    expect(outcome.state.items).toEqual([]);
  });
});
