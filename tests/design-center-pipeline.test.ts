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
import { ENGINE_NOT_CONFIGURED } from '@/lib/projects/design-center/types';
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

  it('requires occupancy + drawings to approve designs', () => {
    const c = client({
      quotation_status: 'معتمد',
      financial_status: 'معتمد مالياً',
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

    const withOcc = {
      ...data,
      building_plan: {
        ...data.building_plan,
        occupancy_classification: 'Mercantile',
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
    const ready = { ...withOcc, design_center: withFile };
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
  it('does not fabricate analysis results when engine is offline', async () => {
    const job = await runPlanAnalysis({ projectId: 'proj-1' });
    expect(job.status).toBe('unavailable');
    expect(job.error_code).toBe(ENGINE_NOT_CONFIGURED);
    expect(job.result).toBeNull();
    expect(job.progress).toBe(0);
    expect(job.steps.every((s) => s.status === 'unavailable')).toBe(true);
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
