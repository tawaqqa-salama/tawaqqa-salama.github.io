import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getStage6ApprovalBlockers,
  isStage6ContractSatisfied,
} from '@/lib/projects/stage6-contract';
import {
  approveWorkflowStage,
  canUnlockStage,
  isStageApproved,
  stageApprovalBlockers,
} from '@/lib/projects/gated-pipeline';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { EMPTY_PROJECT_ENGINEERING_DATA, type ProjectEngineeringData } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const migration = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const modal = read('components/projects/ProjectReportModal.tsx');
const wrapper = read('lib/projects/engineering-workflow-transition.ts');

function client(): ClientRecord {
  return {
    id: 'stage6-contract-project',
    name: 'منشأة اختبار Stage 6',
    business_name: 'منشأة اختبار Stage 6',
    quotation_status: 'معتمد',
    financial_status: 'معتمد مالياً',
  } as ClientRecord;
}

function validStage6Data(): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    engineering_delivery: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.engineering_delivery,
      status: 'مكتمل',
      delivery_date: '2026-08-22',
      delivered_to: 'الإدارة العامة للدفاع المدني بمحافظة جدة',
      outgoing_number: 'OUT-2026-0001',
      safety_engineer_name: 'م. أحمد السلامة',
      manager_name: 'مدير المكتب',
    },
    cd_cover_letter: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.cd_cover_letter,
      status: 'مكتمل',
      letter_date: '2026-08-22',
      addressee: 'الإدارة العامة للدفاع المدني',
      outgoing_number: 'OUT-2026-0001',
      safety_engineer_name: 'م. أحمد السلامة',
      manager_name: 'مدير المكتب',
    },
  };
}

describe('Stage 6A singleton contract and server transition gate', () => {
  it('blocks empty default forms and keeps Stage 7 locked', () => {
    const data = { ...EMPTY_PROJECT_ENGINEERING_DATA };
    const codes = getStage6ApprovalBlockers(data).map((item) => item.code);

    expect(codes).toEqual([
      'STAGE6_ENGINEERING_DELIVERY_INCOMPLETE',
      'STAGE6_CD_COVER_LETTER_INCOMPLETE',
    ]);
    expect(isStageApproved('transmittals', client(), data)).toBe(false);
    expect(canUnlockStage('final_report', client(), data)).toBe(false);
  });

  it('blocks each singleton independently when the engineering delivery is incomplete', () => {
    const data = validStage6Data();
    data.engineering_delivery = {
      ...data.engineering_delivery,
      delivered_to: '',
    };

    const blockers = getStage6ApprovalBlockers(data);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].code).toBe('STAGE6_ENGINEERING_DELIVERY_INCOMPLETE');
    expect(blockers[0].missing).toContain('جهة التسليم');
    expect(stageApprovalBlockers('transmittals', client(), data)).toContain(blockers[0].message);
    expect(canUnlockStage('final_report', client(), data)).toBe(false);
  });

  it('blocks the CD cover letter independently when it is incomplete', () => {
    const data = validStage6Data();
    data.cd_cover_letter = {
      ...data.cd_cover_letter,
      addressee: '   ',
    };

    const blockers = getStage6ApprovalBlockers(data);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].code).toBe('STAGE6_CD_COVER_LETTER_INCOMPLETE');
    expect(blockers[0].missing).toContain('جهة التوجيه');
    expect(canUnlockStage('final_report', client(), data)).toBe(false);
  });

  it('rejects draft documents and approved status with missing content', () => {
    const draft = validStage6Data();
    draft.engineering_delivery = { ...draft.engineering_delivery, status: 'مسودة' };
    expect(getStage6ApprovalBlockers(draft)[0].missing).toContain('حالة الخطاب المكتملة');

    const fakeApproved = validStage6Data();
    fakeApproved.cd_cover_letter = {
      ...fakeApproved.cd_cover_letter,
      status: 'معتمد',
      outgoing_number: '',
    };
    const fakeBlockers = getStage6ApprovalBlockers(fakeApproved);
    expect(fakeBlockers).toHaveLength(1);
    expect(fakeBlockers[0].code).toBe('STAGE6_CD_COVER_LETTER_INCOMPLETE');
    expect(isStageApproved('transmittals', client(), fakeApproved)).toBe(false);
  });

  it('permits a server transition only after both current documents satisfy the contract', () => {
    const data = validStage6Data();
    expect(getStage6ApprovalBlockers(data)).toEqual([]);
    expect(isStage6ContractSatisfied(data)).toBe(true);
    // A browser-selected completed status alone is never a successful approval.
    expect(isStageApproved('transmittals', client(), data)).toBe(false);
    expect(canUnlockStage('final_report', client(), data)).toBe(false);

    const serverApproved = {
      ...data,
      engineering_delivery: { ...data.engineering_delivery, status: 'معتمد' as const },
      cd_cover_letter: { ...data.cd_cover_letter, status: 'معتمد' as const },
      workflow: {
        active_stage: 'final_report' as const,
        last_approved_stage: 'transmittals' as const,
        approved_at: { transmittals: '2026-08-22T10:00:00.000Z' },
      },
    };
    expect(isStageApproved('transmittals', client(), serverApproved)).toBe(true);
    expect(canUnlockStage('final_report', client(), serverApproved)).toBe(true);
  });

  it('loads legacy missing Stage 6 fields safely but leaves the project blocked', () => {
    const parsed = parseProjectEngineeringData({
      engineering_delivery: { status: 'معتمد' },
      cd_cover_letter: { status: 'معتمد' },
    } as ClientRecord['project_engineering_data']);

    expect(parsed.engineering_delivery.status).toBe('معتمد');
    expect(parsed.cd_cover_letter.status).toBe('معتمد');
    expect(getStage6ApprovalBlockers(parsed)).toHaveLength(2);
    expect(canUnlockStage('final_report', client(), parsed)).toBe(false);
  });

  it('keeps client blockers and approval predicates driven by one shared contract', () => {
    const pipeline = read('lib/projects/gated-pipeline.ts');
    expect(pipeline).toContain("import { getStage6ApprovalBlockers } from '@/lib/projects/stage6-contract'");
    expect(pipeline).toContain("case 'transmittals':\n      // Stage 6A is approved only by the server transition");
    expect(pipeline).toContain("case 'transmittals':\n      blockers.push(...getStage6ApprovalBlockers(data).map((item) => item.message));");
  });

  it('rejects direct local approval so only the server may mark Stage 6 approved', () => {
    const data = validStage6Data();
    data.technical_report = { ...data.technical_report, status: 'معتمد' };
    data.field_visits = [{ visit_number: 1, status: 'معتمد', checklist: [] }];
    data.supervision_report = { ...data.supervision_report, status: 'معتمد' };
    data.technical_notes = { ...data.technical_notes, status: 'معتمد', deficiencies: [] };

    const result = approveWorkflowStage({ stageId: 'transmittals', client: client(), data });
    expect(result.ok).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
    // No client path is allowed to mutate the two statuses before the RPC.
    expect(result.data.engineering_delivery.status).toBe('مكتمل');
    expect(result.data.cd_cover_letter.status).toBe('مكتمل');
    expect(read('lib/projects/gated-pipeline.ts')).toContain("if (stageId === 'transmittals') {");
    expect(read('lib/projects/gated-pipeline.ts')).toContain('يلزم اعتماد مرحلة الخطابات عبر الحاجز الخادمي.');
  });

  it('uses a server-authoritative Stage 6 to Stage 7 transition with stable semantic blockers', () => {
    expect(wrapper).toContain("'supervision_visits' | 'transmittals' | 'final_report'");
    expect(wrapper).toContain("STAGE6_ENGINEERING_DELIVERY_INCOMPLETE");
    expect(wrapper).toContain("STAGE6_CD_COVER_LETTER_INCOMPLETE");
    expect(modal).toContain("transitionProjectEngineeringStage(client.id, 'final_report')");
    expect(modal).toContain('const canonical = await loadEngineeringLive(client.id);');
    expect(migration).toContain("v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')");
    expect(migration).toContain("IF v_target = 'final_report' THEN");
    expect(migration).toContain("'STAGE6_ENGINEERING_DELIVERY_INCOMPLETE'");
    expect(migration).toContain("'STAGE6_CD_COVER_LETTER_INCOMPLETE'");
    expect(migration).toContain("'{workflow,active_stage}'");
    expect(migration).toContain("to_jsonb('final_report'::text)");
  });

  it('rejects cross-tenant and invalid or skipped transitions before the Stage 6 update', () => {
    expect(migration).toContain('v_company_id := public.current_app_company_id();');
    expect(migration).toContain("MESSAGE = 'PROJECT_NOT_FOUND_OR_FORBIDDEN'");
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain("'INVALID_STAGE_TRANSITION'");
    expect(migration).toContain("'STAGE6_NOT_ACTIVE'");
    expect(migration.indexOf("'STAGE6_ENGINEERING_DELIVERY_INCOMPLETE'")).toBeLessThan(
      migration.indexOf("to_jsonb('final_report'::text)")
    );
    expect(migration).not.toMatch(/UPDATE\s+public\.clients\s+SET\s+pipeline_stage/i);
    expect(migration).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+POLICY|DROP\s+POLICY|storage\.objects/i);
  });

  it('preserves the existing Stage 5/B1 transition contract in the replacement RPC', () => {
    for (const code of [
      'NO_FIELD_VISITS',
      'FIELD_VISIT_NOT_APPROVED',
      'SUPERVISION_NOT_APPROVED',
      'TECHNICAL_NOTES_NOT_APPROVED',
      'OPEN_CRITICAL_DEFICIENCY',
      'OPEN_HIGH_DEFICIENCY',
      'OPEN_CRITICAL_FIELD_OBSERVATION',
      'OPEN_HIGH_FIELD_OBSERVATION',
    ]) {
      expect(migration).toContain(`'${code}'`);
    }
    expect(migration).toContain("v_target = 'supervision_visits'");
    expect(migration).toContain("to_jsonb('transmittals'::text)");
  });
});
