import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_STAGE_IDS,
  approveWorkflowStage,
  canUnlockStage,
  getStage5ApprovalBlockers,
  isStageApproved,
  normalizeWorkflowState,
  stageApprovalBlockers,
  workflowProgressPercent,
} from '@/lib/projects/gated-pipeline';
import { buildFieldVisits, parseProjectEngineeringData } from '@/lib/business/project-reports';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const projectModal = read('components/projects/ProjectReportModal.tsx');
const projectsPage = read('app/projects/page.tsx');
const salesPage = read('app/sales/page.tsx');
const gatedPipeline = read('lib/projects/gated-pipeline.ts');

function client(partial: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'project-visit-1',
    name: 'مشروع تجريبي',
    business_name: 'منشأة تجريبية',
    quotation_status: 'معتمد',
    financial_status: 'معتمد مالياً',
    ...partial,
  } as ClientRecord;
}

function approvedVisitData(): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    field_visits: [
      {
        visit_number: 1,
        status: 'مكتمل',
        visit_date: '2026-08-18',
        engineer_name: 'م. أحمد',
        findings: 'ملاحظة ضمن تقرير الزيارة',
        recommendations: 'تنفيذ المعالجة',
        pdf_snapshots: [],
      },
    ],
    supervision_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.supervision_report,
      status: 'مكتمل',
      months: [],
      tasks: [],
    },
    technical_notes: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_notes,
      status: 'مكتمل',
      deficiencies: [
        { id: 'legacy-note', description: 'ملاحظة تاريخية', severity: 'medium', resolved: false },
      ],
      recommendations: 'توصية تاريخية',
    },
    technical_report: { ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report, status: 'مكتمل' },
  };
}

describe('project visits and supervision unified workflow', () => {
  it('removes the project contract form while leaving the contract system available in Sales', () => {
    expect(projectModal).not.toContain("import ContractOnboardingSection");
    expect(projectModal).not.toContain("activeStage === 'contract'");
    expect(projectsPage).not.toContain('كل مشروع يحتوي: العقد');
    expect(salesPage).toContain("const ContractModal");
  });

  it('renders legacy technical notes inside the unified visits and supervision stage', () => {
    expect(projectModal).toContain("activeStage === 'visits_supervision'");
    expect(projectModal).toContain('ملاحظات الموقع والتوصيات جزء من تقرير الزيارة والإشراف');
    expect(projectModal).toContain('technical_notes');
    expect(projectModal).toContain('field_visits');
    expect(projectModal).toContain('+ إضافة زيارة جديدة');
    expect(projectModal).toContain('الإجراء المطلوب أو التوصية');
  });

  it('keeps multiple visit reports as distinct records instead of replacing earlier visits', () => {
    const visits = buildFieldVisits(3, [
      { visit_number: 1, status: 'مكتمل', findings: 'الزيارة الأولى', checklist: [] },
      { visit_number: 2, status: 'مسودة', findings: 'الزيارة الثانية', checklist: [] },
    ]);
    expect(visits).toHaveLength(3);
    expect(visits.map((visit) => visit.visit_number)).toEqual([1, 2, 3]);
    expect(visits[0].findings).toBe('الزيارة الأولى');
    expect(visits[1].findings).toBe('الزيارة الثانية');
  });

  it('preserves legacy stage 5 visits and stage 6 notes under the same normalized stage', () => {
    const raw = {
      ...approvedVisitData(),
      workflow: {
        active_stage: 'deficiencies',
        last_approved_stage: 'inspections',
        approved_at: {
          inspections: '2026-01-01T00:00:00.000Z',
          deficiencies: '2026-02-01T00:00:00.000Z',
        },
      },
    };
    const parsed = parseProjectEngineeringData(raw);

    expect(parsed.field_visits[0].findings).toBe('ملاحظة ضمن تقرير الزيارة');
    expect(parsed.technical_notes.deficiencies[0].description).toBe('ملاحظة تاريخية');
    expect(parsed.technical_notes.recommendations).toBe('توصية تاريخية');
    expect(parsed.workflow?.active_stage).toBe('visits_supervision');
    expect(parsed.workflow?.last_approved_stage).toBe('visits_supervision');
    expect(parsed.workflow?.approved_at?.visits_supervision).toBe('2026-02-01T00:00:00.000Z');
  });

  it('approves visits, supervision, and technical notes together before unlocking the next stage', () => {
    const c = client();
    const data = approvedVisitData();

    expect(canUnlockStage('visits_supervision', c, data)).toBe(true);
    const approved = approveWorkflowStage({
      stageId: 'visits_supervision',
      client: c,
      data,
    });

    expect(approved.ok).toBe(true);
    expect(approved.nextStage).toBe('transmittals');
    expect(approved.data.field_visits[0].status).toBe('معتمد');
    expect(approved.data.supervision_report.status).toBe('معتمد');
    expect(approved.data.technical_notes.status).toBe('معتمد');
  });

  it('keeps Stage 5 blockers and approval semantics aligned for every required condition', () => {
    const c = client();
    const cases: Array<{ name: string; mutate: (data: ProjectEngineeringData) => ProjectEngineeringData; code: string }> = [
      {
        name: 'no visits',
        mutate: (data) => ({ ...data, field_visits: [] }),
        code: 'NO_FIELD_VISITS',
      },
      {
        name: 'draft visit',
        mutate: (data) => ({ ...data, field_visits: [{ ...data.field_visits[0], status: 'مسودة' }] }),
        code: 'FIELD_VISIT_NOT_APPROVED',
      },
      {
        name: 'draft supervision',
        mutate: (data) => ({ ...data, supervision_report: { ...data.supervision_report, status: 'مسودة' } }),
        code: 'SUPERVISION_NOT_APPROVED',
      },
      {
        name: 'draft technical notes',
        mutate: (data) => ({ ...data, technical_notes: { ...data.technical_notes, status: 'مسودة' } }),
        code: 'TECHNICAL_NOTES_NOT_APPROVED',
      },
      {
        name: 'open critical deficiency',
        mutate: (data) => ({ ...data, technical_notes: { ...data.technical_notes, deficiencies: [{ id: 'critical', description: 'حرج', severity: 'critical', resolved: false }] } }),
        code: 'OPEN_CRITICAL_DEFICIENCY',
      },
      {
        name: 'open high deficiency',
        mutate: (data) => ({ ...data, technical_notes: { ...data.technical_notes, deficiencies: [{ id: 'high', description: 'عالي', severity: 'high', resolved: false }] } }),
        code: 'OPEN_HIGH_DEFICIENCY',
      },
    ];

    for (const scenario of cases) {
      const data = scenario.mutate(approvedVisitData());
      const codes = getStage5ApprovalBlockers(data).map((item) => item.code);
      expect(codes, scenario.name).toContain(scenario.code);
      expect(isStageApproved('visits_supervision', c, data), scenario.name).toBe(false);
      expect(stageApprovalBlockers('visits_supervision', c, data)).not.toHaveLength(0);
      expect(approveWorkflowStage({ stageId: 'visits_supervision', client: c, data }).ok).toBe(false);
    }
  });

  it('returns no Stage 5 blocker only when the canonical approval predicate is true', () => {
    const c = client();
    const data = approvedVisitData();
    expect(getStage5ApprovalBlockers(data)).toEqual([]);
    expect(stageApprovalBlockers('visits_supervision', c, data)).toEqual([]);
    expect(isStageApproved('visits_supervision', c, data)).toBe(true);
  });

  it('derives workflow progress from the current stage collection, not a hardcoded count', () => {
    const c = client();
    const data = approvedVisitData();
    expect(WORKFLOW_STAGE_IDS).toHaveLength(8);
    expect(gatedPipeline).toContain('WORKFLOW_STAGE_IDS.length');
    expect(workflowProgressPercent(c, data)).toBeGreaterThanOrEqual(0);
    expect(workflowProgressPercent(c, data)).toBeLessThanOrEqual(100);
  });

  it('normalizes legacy stage ids without a schema migration', () => {
    const workflow = normalizeWorkflowState({
      active_stage: 'inspections',
      last_approved_stage: 'deficiencies',
      approved_at: { inspections: '2026-01-01', deficiencies: '2026-02-01' },
    })!;
    expect(workflow.active_stage).toBe('visits_supervision');
    expect(workflow.last_approved_stage).toBe('visits_supervision');
    expect(workflow.approved_at?.visits_supervision).toBe('2026-02-01');
  });
});
