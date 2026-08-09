import { describe, expect, it } from 'vitest';
import {
  computeDesignReadiness,
  knowledgeAvailabilityLabel,
  canCreateSystemDesign,
  systemDesignInputGate,
  readinessAllowsStageApproval,
  formatUnknownValue,
} from '@/lib/projects/design-center/readiness';
import { runPlanAnalysis } from '@/lib/projects/design-center/engine';
import {
  runKnowledgeBackedSystemDesign,
} from '@/lib/projects/design-center/knowledge-engine';
import {
  resolveApplicableStandards,
  buildProjectDesignStandardsContext,
} from '@/lib/projects/design-center/standards';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type BuildingPlanReport,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import {
  mergeDesignCenterDefaults,
  addDrawingVersion,
  createEmptyAnalysisJob,
} from '@/lib/projects/design-center/state';
import type { ClientRecord } from '@/lib/types/client';
import { stageApprovalBlockers } from '@/lib/projects/gated-pipeline';

function client(partial?: Partial<ClientRecord>): ClientRecord {
  return Object.assign(
    {
      id: 'proj-ready-1',
      name: 'عميل',
      business_name: 'منشأة',
      activity_type: 'office',
      building_area: 2500,
      floors_count: 4,
      quotation_services: ['alarm_plans', 'firefighting_plans'],
    },
    partial
  ) as ClientRecord;
}

function richPlan(partial?: Partial<BuildingPlanReport>): BuildingPlanReport {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
    occupancy_classification: 'تجاري',
    floors_description: 'Lobby · Office · Storage',
    stairs_count: '2',
    exits_count: '4',
    building_height_m: '18',
    total_site_area_m2: '3000',
    fire_alarm_system: 'نعم',
    sprinkler_system: 'نعم',
    ...partial,
  };
}

function withDrawing(data: ProjectEngineeringData): ProjectEngineeringData {
  return {
    ...data,
    design_center: addDrawingVersion(data.design_center, {
      id: 'f1',
      fileName: 'plan.pdf',
      format: 'pdf',
      sizeBytes: 1000,
      uploadedAt: '2026-01-01T00:00:00.000Z',
      kind: 'engineering_drawing',
    }),
  };
}

describe('knowledgeAvailabilityLabel — KB ≠ applicable', () => {
  it('never says applicable / مطبقة for KB document counts', () => {
    const ar = knowledgeAvailabilityLabel(8, true);
    const en = knowledgeAvailabilityLabel(8, false);
    expect(ar).toBe('8 مراجع متاحة في قاعدة المعرفة');
    expect(en).toBe('8 references available in the knowledge base');
    expect(ar).not.toMatch(/مطبقة/);
    expect(en.toLowerCase()).not.toMatch(/applicable/);
  });
});

describe('formatUnknownValue', () => {
  it('uses Unknown / Not Available / Needs Engineer Input', () => {
    expect(formatUnknownValue(null, false, 'unknown')).toBe('Unknown');
    expect(formatUnknownValue('', false, 'not_available')).toBe('Not Available');
    expect(formatUnknownValue(undefined, false, 'needs_engineer_input')).toBe(
      'Needs Engineer Input'
    );
    expect(formatUnknownValue('Mercantile', false)).toBe('Mercantile');
  });
});

describe('systemDesignInputGate', () => {
  it('blocks Sprinkler without area / spaces / design inputs', () => {
    const c = client({ building_area: undefined as unknown as number });
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        occupancy_classification: 'تجاري',
      },
    };
    const gate = systemDesignInputGate('sprinkler', c, data);
    expect(gate.ok).toBe(false);
    expect(gate.missing.some((m) => m.key === 'area')).toBe(true);
    expect(canCreateSystemDesign('sprinkler', c, data)).toBe(false);
  });

  it('blocks Fire Alarm without egress or drawing', () => {
    const c = client();
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        occupancy_classification: 'تجاري',
        floors_description: 'Office floor',
        // no stairs/exits, no drawing
      },
    };
    const gate = systemDesignInputGate('fire_alarm', c, data);
    expect(gate.ok).toBe(false);
    expect(gate.missing.some((m) => m.key === 'egress')).toBe(true);
  });

  it('allows Sprinkler when geometry, spaces, occupancy, area, design inputs exist', () => {
    const data = withDrawing({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: richPlan(),
    });
    expect(systemDesignInputGate('sprinkler', client(), data).ok).toBe(true);
  });

  it('allows Fire Alarm when geometry, spaces, occupancy, egress exist', () => {
    const data = withDrawing({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: richPlan(),
    });
    expect(systemDesignInputGate('fire_alarm', client(), data).ok).toBe(true);
  });
});

describe('runKnowledgeBackedSystemDesign gate', () => {
  it('fails incomplete Sprinkler design with SYSTEM_INPUTS_INCOMPLETE', async () => {
    const result = await runKnowledgeBackedSystemDesign({
      projectId: 'proj-ready-1',
      kind: 'sprinkler',
      context: {
        client: client({ building_area: undefined as unknown as number, floors_count: undefined as unknown as number }),
        data: {
          ...EMPTY_PROJECT_ENGINEERING_DATA,
          design_center: mergeDesignCenterDefaults(null),
          building_plan: {
            ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
            occupancy_classification: 'تجاري',
          },
        },
      },
    });
    expect(result.status).toBe('failed');
    expect(result.error_code).toBe('SYSTEM_INPUTS_INCOMPLETE');
    expect(result.standards).toBeNull();
  });
});

describe('analysis honesty — no fake CAD completion', () => {
  it('does not invent rooms without local vision payload; ceiling/MEP stay unavailable', async () => {
    const data = withDrawing({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: richPlan(),
    });
    const job = await runPlanAnalysis({
      projectId: 'proj-ready-1',
      context: { client: client(), data },
    });
    expect(['completed', 'needs_engineer_review']).toContain(job.status);
    expect(job.steps.find((s) => s.id === 'analyze_plan')?.status).toBe('pending');
    expect(job.steps.find((s) => s.id === 'detect_rooms')?.status).toBe('pending');
    expect(job.steps.find((s) => s.id === 'detect_walls')?.status).toBe('pending');
    expect(job.steps.find((s) => s.id === 'ceiling_analysis')?.status).toBe('not_available');
    expect(job.steps.find((s) => s.id === 'mep_coordination')?.status).toBe('not_available');
    expect(job.steps.find((s) => s.id === 'occupancy_type')?.status).toBe('completed');
    expect(job.result?.rooms).toEqual([]);
    expect((job.result?.raw as { cad_vision?: string })?.cad_vision).toBe('not_run');
    expect((job.result?.raw as { applicable_standards_count?: unknown })?.applicable_standards_count).toBeNull();
  });

  it('does not mark analysis completed when only KB docs exist without project fields', async () => {
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults({
        knowledge_links: {
          applicable_codes: [],
          project_references: [],
          sales_services: [],
          linked_document_ids: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'],
          linked_document_titles: Array.from({ length: 8 }, (_, i) => `Doc ${i}`),
          citations: [],
        },
      }),
    };
    const job = await runPlanAnalysis({
      projectId: 'proj-ready-1',
      context: {
        client: client({
          activity_type: undefined as unknown as string,
          building_area: undefined as unknown as number,
          floors_count: undefined as unknown as number,
          quotation_services: [],
        }),
        data,
      },
    });
    // No drawing + no occupancy → failed / incomplete — never pretend AI finished
    expect(job.status).not.toBe('completed');
    expect(job.result == null || job.status === 'failed').toBe(true);
  });
});

describe('standards isolation — non-applicable not shown as primary', () => {
  it('Fire Alarm primary does not include NFPA-13/20', () => {
    const ctx = buildProjectDesignStandardsContext(
      client(),
      withDrawing({
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        design_center: mergeDesignCenterDefaults(null),
        building_plan: richPlan(),
      })
    );
    const alarm = resolveApplicableStandards(ctx, 'fire_alarm');
    expect(alarm.primary.map((r) => r.reference.code)).toContain('NFPA-72');
    expect(alarm.primary.map((r) => r.reference.code)).not.toContain('NFPA-13');
    expect(alarm.primary.map((r) => r.reference.code)).not.toContain('NFPA-20');
  });

  it('Sprinkler primary includes NFPA-13 and not NFPA-72 as primary', () => {
    const ctx = buildProjectDesignStandardsContext(
      client(),
      withDrawing({
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        design_center: mergeDesignCenterDefaults(null),
        building_plan: richPlan(),
      })
    );
    const sp = resolveApplicableStandards(ctx, 'sprinkler');
    expect(sp.primary.map((r) => r.reference.code)).toContain('NFPA-13');
    expect(sp.primary.map((r) => r.reference.code)).not.toContain('NFPA-72');
  });
});

describe('Design Readiness + stage gate', () => {
  it('starts NOT_READY or READY_FOR_AI_ANALYSIS without analysis', () => {
    const level = computeDesignReadiness(client(), {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: richPlan(),
    }).level;
    expect(['NOT_READY', 'READY_FOR_AI_ANALYSIS']).toContain(level);
    expect(readinessAllowsStageApproval(level)).toBe(false);
  });

  it('reaches READY_FOR_ENGINEER_REVIEW after honest analysis + one system resolved', async () => {
    let data = withDrawing({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: richPlan(),
    });
    const analysis = await runPlanAnalysis({
      projectId: 'proj-ready-1',
      context: { client: client(), data },
    });
    const system = await runKnowledgeBackedSystemDesign({
      projectId: 'proj-ready-1',
      kind: 'fire_alarm',
      context: { client: client(), data },
    });
    expect(system.status).toBe('completed');
    data = {
      ...data,
      design_center: {
        ...data.design_center,
        analysis,
        systems: data.design_center.systems.map((s) =>
          s.kind === 'fire_alarm' ? system : s
        ),
      },
    };
    const readiness = computeDesignReadiness(client(), data);
    expect(readiness.level).toBe('READY_FOR_ENGINEER_REVIEW');
    expect(readinessAllowsStageApproval(readiness.level)).toBe(true);
  });

  it('blocks designs stage approval before READY_FOR_ENGINEER_REVIEW', () => {
    const c = client({
      quotation_status: 'معتمد',
      financial_status: 'معتمد مالياً',
    });
    const data = withDrawing({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: richPlan(),
      contract_onboarding: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.contract_onboarding,
        status: 'معتمد',
        contract_status: 'signed',
      },
    });
    const blockers = stageApprovalBlockers('designs', c, data);
    expect(blockers.some((b) => /READY FOR ENGINEER REVIEW|جاهزية/.test(b))).toBe(true);
  });

  it('APPROVED when design_center status is معتمد', () => {
    const data: ProjectEngineeringData = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults({
        status: 'معتمد',
        analysis: createEmptyAnalysisJob({ status: 'needs_engineer_review', progress: 40 }),
      }),
      building_plan: richPlan(),
    };
    expect(computeDesignReadiness(client(), data).level).toBe('APPROVED');
  });
});
