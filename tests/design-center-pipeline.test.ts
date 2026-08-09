import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_STAGE_IDS,
  WORKFLOW_STAGES,
  approveWorkflowStage,
  canUnlockStage,
  isStageApproved,
  normalizeWorkflowStageId,
  resolveActiveStage,
  stageApprovalBlockers,
} from '@/lib/projects/gated-pipeline';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { mergeDesignCenterDefaults, addDrawingVersion } from '@/lib/projects/design-center/state';
import { runPlanAnalysis } from '@/lib/projects/design-center/engine';
import type { ClientRecord } from '@/lib/types/client';

function client(partial?: Partial<ClientRecord>): ClientRecord {
  return Object.assign(
    {
      id: 'proj-1',
      name: 'عميل تجريبي',
      business_name: 'منشأة تجريبية',
    },
    partial
  ) as ClientRecord;
}

function baseData(partial?: Partial<ProjectEngineeringData>): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    design_center: mergeDesignCenterDefaults(EMPTY_PROJECT_ENGINEERING_DATA.design_center),
    ...partial,
  };
}

describe('designs stage pipeline', () => {
  it('orders designs as stage 2 after contract', () => {
    expect(WORKFLOW_STAGE_IDS).toEqual([
      'contract',
      'designs',
      'boq_schedule',
      'technical_report',
      'inspections',
      'deficiencies',
      'transmittals',
      'final_report',
      'completion',
    ]);
    expect(WORKFLOW_STAGES[1].id).toBe('designs');
    expect(WORKFLOW_STAGES[1].label_ar).toContain('التصاميم');
  });

  it('normalizes legacy plans stage id to designs', () => {
    expect(normalizeWorkflowStageId('plans')).toBe('designs');
    expect(normalizeWorkflowStageId('designs')).toBe('designs');
    expect(normalizeWorkflowStageId('unknown')).toBeNull();
  });

  it('locks designs until contract is approved', () => {
    const c = client();
    const data = baseData();
    expect(canUnlockStage('designs', c, data)).toBe(false);
    expect(resolveActiveStage(c, data)).toBe('contract');
  });

  it('requires occupancy + drawings + Design Readiness before approving designs', async () => {
    const c = client({
      quotation_status: 'معتمد',
      financial_status: 'معتمد مالياً',
      activity_type: 'office',
      building_area: 2500,
      floors_count: 3,
      quotation_services: ['alarm_plans'],
    });
    const data = baseData({
      contract_onboarding: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.contract_onboarding,
        status: 'معتمد',
        contract_status: 'signed',
      },
    });
    expect(canUnlockStage('designs', c, data)).toBe(true);
    expect(stageApprovalBlockers('designs', c, data).length).toBeGreaterThan(0);

    const withOcc: ProjectEngineeringData = {
      ...data,
      building_plan: {
        ...data.building_plan,
        occupancy_classification: 'Mercantile',
        floors_description: 'Retail · Storage',
        stairs_count: '2',
        exits_count: '3',
        building_height_m: '12',
        fire_alarm_system: 'نعم' as const,
      },
    };
    expect(stageApprovalBlockers('designs', c, withOcc).some((b) => /مخطط/.test(b))).toBe(true);

    const withFile = addDrawingVersion(withOcc.design_center, {
      id: 'f1',
      fileName: 'plan.pdf',
      format: 'pdf',
      sizeBytes: 1000,
      uploadedAt: new Date().toISOString(),
      kind: 'engineering_drawing',
    });
    const withDrawing = { ...withOcc, design_center: withFile };
    // Drawing + occupancy alone is not enough — need READY_FOR_ENGINEER_REVIEW
    expect(
      stageApprovalBlockers('designs', c, withDrawing).some((b) => /جاهزية|READY/.test(b))
    ).toBe(true);

    const { runPlanAnalysis } = await import('@/lib/projects/design-center/engine');
    const { runKnowledgeBackedSystemDesign } = await import(
      '@/lib/projects/design-center/knowledge-engine'
    );
    const analysis = await runPlanAnalysis({
      projectId: c.id,
      context: { client: c, data: withDrawing },
    });
    const system = await runKnowledgeBackedSystemDesign({
      projectId: c.id,
      kind: 'fire_alarm',
      context: { client: c, data: withDrawing },
    });
    const ready = {
      ...withDrawing,
      design_center: {
        ...withDrawing.design_center,
        analysis,
        systems: withDrawing.design_center.systems.map((s) =>
          s.kind === 'fire_alarm' ? system : s
        ),
      },
    };
    expect(stageApprovalBlockers('designs', c, ready)).toEqual([]);

    const approved = approveWorkflowStage({ stageId: 'designs', client: c, data: ready });
    expect(approved.ok).toBe(true);
    expect(approved.nextStage).toBe('boq_schedule');
    expect(isStageApproved('designs', c, approved.data)).toBe(true);
    expect(approved.data.design_center.status).toBe('معتمد');
  });

  it('treats legacy approved_at.plans as designs gate', () => {
    const c = client();
    const data = baseData({
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        occupancy_classification: 'Business',
        status: 'مسودة',
      },
      plan_attachments: {
        engineering_drawings: [
          {
            id: 'd1',
            fileName: 'a.pdf',
            format: 'pdf',
            sizeBytes: 10,
            uploadedAt: '2020-01-01',
            kind: 'engineering_drawing',
          },
        ],
        hydraulic_calculations: [],
      },
      workflow: { approved_at: { plans: '2024-01-01T00:00:00.000Z' } },
    });
    expect(isStageApproved('designs', c, data)).toBe(true);
  });
});

describe('design center engine boundary', () => {
  it('requires project context when no client/data is passed', async () => {
    const job = await runPlanAnalysis({ projectId: 'proj-1' });
    expect(job.status).toBe('unavailable');
    expect(job.error_code).toBe('PROJECT_CONTEXT_REQUIRED');
    expect(job.result).toBeNull();
    expect(job.progress).toBe(0);
  });

  it('analyzes real project fields + drawings without inventing CAD rooms', async () => {
    const data = baseData({
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        occupancy_classification: 'تجاري',
        stairs_count: '2',
        exits_count: '3',
        building_height_m: '18',
        total_site_area_m2: '1200',
      },
    });
    const withFile = addDrawingVersion(data.design_center, {
      id: 'att-1',
      fileName: 'floor.pdf',
      format: 'pdf',
      sizeBytes: 2048,
      uploadedAt: '2026-01-01T00:00:00.000Z',
      kind: 'engineering_drawing',
    });
    const job = await runPlanAnalysis({
      projectId: 'proj-1',
      context: {
        client: client({
          activity_type: 'mall',
          building_area: 2500,
          floors_count: 3,
          quotation_services: ['firefighting_plans', 'alarm_plans'],
        }),
        data: { ...data, design_center: withFile },
      },
    });
    expect(['completed', 'needs_engineer_review']).toContain(job.status);
    expect(job.progress).toBeGreaterThan(0);
    expect(job.result?.occupancy).toBeTruthy();
    expect(job.result?.rooms).toEqual([]);
    expect(job.result?.walls).toEqual([]);
    expect(job.steps.find((s) => s.id === 'occupancy_type')?.status).toBe('completed');
    expect(job.steps.find((s) => s.id === 'detect_rooms')?.status).toBe('not_available');
    expect(job.steps.find((s) => s.id === 'analyze_plan')?.status).toBe('not_available');
    expect((job.result?.raw as { source?: string })?.source).toBe('project_knowledge_bridge');
  });

  it('versions drawings without inventing content', () => {
    const empty = mergeDesignCenterDefaults(null);
    const next = addDrawingVersion(empty, {
      id: 'att-1',
      fileName: 'floor.dwg',
      format: 'dwg',
      sizeBytes: 2048,
      uploadedAt: '2026-01-01T00:00:00.000Z',
      kind: 'engineering_drawing',
    });
    expect(next.sheets).toHaveLength(1);
    expect(next.sheets[0].versions).toHaveLength(1);
    expect(next.sheets[0].versions[0].label).toBe('v1');
    const v2 = addDrawingVersion(next, {
      id: 'att-2',
      fileName: 'floor-rev2.dwg',
      format: 'dwg',
      sizeBytes: 3000,
      uploadedAt: '2026-01-02T00:00:00.000Z',
      kind: 'engineering_drawing',
    }, { sheetId: next.sheets[0].id });
    expect(v2.sheets[0].versions).toHaveLength(2);
    expect(v2.sheets[0].activeVersionId).toBe(v2.sheets[0].versions[1].id);
  });
});
