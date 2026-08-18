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
import { seedSpaceSafetyFromClient } from '@/lib/projects/design-center/space-safety';
import { runPlanAnalysis } from '@/lib/projects/design-center/engine';
import { runKnowledgeBackedSystemDesign } from '@/lib/projects/design-center/knowledge-engine';
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
  it('uses eight consecutively numbered visible stages without a project contract stage', () => {
    expect(WORKFLOW_STAGE_IDS).toEqual([
      'designs',
      'plan_info',
      'boq_schedule',
      'technical_report',
      'visits_supervision',
      'transmittals',
      'final_report',
      'completion',
    ]);
    expect(WORKFLOW_STAGES.map((stage) => stage.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(WORKFLOW_STAGES.find((stage) => stage.id === 'plan_info')?.label_ar).toBe('معلومات المخطط');
    expect(WORKFLOW_STAGE_IDS).not.toContain('contract');
    expect(WORKFLOW_STAGES.find((stage) => stage.id === 'visits_supervision')?.label_ar).toBe(
      'الزيارات والإشراف'
    );
  });

  it('normalizes legacy project stage ids into the visible workflow', () => {
    expect(normalizeWorkflowStageId('plans')).toBe('plan_info');
    expect(normalizeWorkflowStageId('contract')).toBe('designs');
    expect(normalizeWorkflowStageId('inspections')).toBe('visits_supervision');
    expect(normalizeWorkflowStageId('deficiencies')).toBe('visits_supervision');
    expect(normalizeWorkflowStageId('designs')).toBe('designs');
    expect(normalizeWorkflowStageId('unknown')).toBeNull();
  });

  it('locks designs until contract is approved', () => {
    const c = client();
    const data = baseData();
    expect(canUnlockStage('designs', c, data)).toBe(false);
    expect(resolveActiveStage(c, data)).toBe('designs');
  });

  it('requires the project space copy and drawings before approving designs', async () => {
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

    const withSpaceSafety: ProjectEngineeringData = {
      ...data,
      design_center: {
        ...data.design_center,
        space_safety: seedSpaceSafetyFromClient(c),
      },
    };
    expect(stageApprovalBlockers('designs', c, withSpaceSafety).some((b) => /مخطط/.test(b))).toBe(true);

    const withFile = addDrawingVersion(withSpaceSafety.design_center, {
      id: 'f1',
      fileName: 'plan.pdf',
      format: 'pdf',
      sizeBytes: 1000,
      uploadedAt: new Date().toISOString(),
      kind: 'engineering_drawing',
    });
    const withDrawing = { ...withSpaceSafety, design_center: withFile };
    expect(stageApprovalBlockers('designs', c, withDrawing).some((b) => /READY FOR ENGINEER REVIEW|جاهزية/.test(b))).toBe(true);

    const analysis = await runPlanAnalysis({
      projectId: c.id,
      context: { client: c, data: withDrawing },
    });
    const system = await runKnowledgeBackedSystemDesign({
      projectId: c.id,
      kind: 'fire_alarm',
      context: { client: c, data: withDrawing },
    });
    const readyForApproval = {
      ...withDrawing,
      design_center: {
        ...withDrawing.design_center,
        analysis,
        systems: withDrawing.design_center.systems.map((candidate) =>
          candidate.kind === 'fire_alarm' ? system : candidate
        ),
      },
    };
    expect(stageApprovalBlockers('designs', c, readyForApproval)).toEqual([]);

    const approved = approveWorkflowStage({ stageId: 'designs', client: c, data: readyForApproval });
    expect(approved.ok).toBe(true);
    expect(approved.nextStage).toBe('plan_info');
    expect(isStageApproved('designs', c, approved.data)).toBe(true);
    expect(approved.data.design_center.status).toBe('معتمد');
  });

  it('keeps a legacy approved design valid when it has historical floor data', () => {
    const c = client({
      floor_levels: [
        {
          id: 'legacy-floor',
          kind: 'ground',
          label: 'أرضي',
          area_m2: 100,
          repeat_count: 1,
          usages: [{ id: 'legacy-usage', area_m2: 100, label: 'محل' }],
        },
      ],
    });
    const data = baseData({
      design_center: {
        ...mergeDesignCenterDefaults(EMPTY_PROJECT_ENGINEERING_DATA.design_center),
        status: 'معتمد',
      },
      plan_attachments: {
        engineering_drawings: [
          { id: 'legacy-drawing', fileName: 'legacy.pdf', format: 'pdf', sizeBytes: 1, uploadedAt: '2024-01-01', kind: 'engineering_drawing' },
        ],
        hydraulic_calculations: [],
      },
    });
    expect(isStageApproved('designs', c, data)).toBe(true);
  });

  it('treats legacy approved_at.plans as the separate plan-info gate', () => {
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
    expect(isStageApproved('plan_info', c, data)).toBe(true);
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
    // Without browser vision payload, CAD steps stay pending (not fabricated completed)
    expect(job.steps.find((s) => s.id === 'detect_rooms')?.status).toBe('pending');
    expect(job.steps.find((s) => s.id === 'analyze_plan')?.status).toBe('pending');
    expect(job.result?.rooms).toEqual([]);
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
