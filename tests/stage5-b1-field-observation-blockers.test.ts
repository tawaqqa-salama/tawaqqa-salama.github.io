import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workflowBlockerMessage } from '@/lib/projects/engineering-workflow-transition';
import { getStage5ApprovalBlockers } from '@/lib/projects/gated-pipeline';
import { getBlockingStructuredObservationCases } from '@/lib/projects/field-visit-remediation';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type FieldVisitObservation,
  type FieldVisitReport,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';

const root = resolve(__dirname, '..');
const migration = readFileSync(
  resolve(root, 'scripts/sql/054_stage5_high_critical_field_observation_blockers.sql'),
  'utf8'
);

const observation = (
  id: string,
  partial: Partial<FieldVisitObservation> = {}
): FieldVisitObservation => ({
  id,
  category: 'fire_alarm',
  location: 'لوحة الإنذار',
  description: `ملاحظة ${id}`,
  severity: 'medium',
  required_action: 'معالجة موثقة',
  responsible_party: 'المقاول',
  status: 'open',
  ...partial,
});

const visit = (visit_number: number, observations: FieldVisitObservation[]): FieldVisitReport => ({
  visit_number,
  status: 'مكتمل',
  observations,
  evidence: [],
});

function project(field_visits: FieldVisitReport[]): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    technical_report: { ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report, status: 'مكتمل' },
    field_visits,
    supervision_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.supervision_report,
      status: 'مكتمل',
      tasks: [],
    },
    technical_notes: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_notes,
      status: 'مكتمل',
      deficiencies: [],
    },
  };
}

function fieldCodes(data: ProjectEngineeringData): string[] {
  return getStage5ApprovalBlockers(data)
    .map((item) => item.code)
    .filter((code) => code.includes('FIELD_OBSERVATION'));
}

const verified = (id: string, severity: FieldVisitObservation['severity']): FieldVisitObservation =>
  observation(id, {
    severity,
    status: 'verified',
    resolved_at: '2026-08-21T09:00:00.000Z',
    resolved_by: 'المقاول',
    verified_at: '2026-08-21T10:00:00.000Z',
    verified_by: 'المهندس',
  });

describe('Phase 5D-2 B1 direct structured field-observation blockers', () => {
  it('allows no structured observations and open low/medium observations when every pre-existing Stage 5 condition is satisfied', () => {
    expect(fieldCodes(project([visit(1, [])]))).toEqual([]);
    expect(fieldCodes(project([visit(1, [observation('low', { severity: 'low' })])]))).toEqual([]);
    expect(fieldCodes(project([visit(1, [observation('medium', { severity: 'medium' })])]))).toEqual([]);
  });

  it.each([
    ['high open', observation('high-open', { severity: 'high', status: 'open' }), 'OPEN_HIGH_FIELD_OBSERVATION'],
    ['critical open', observation('critical-open', { severity: 'critical', status: 'open' }), 'OPEN_CRITICAL_FIELD_OBSERVATION'],
    ['high in progress', observation('high-progress', { severity: 'high', status: 'in_progress' }), 'OPEN_HIGH_FIELD_OBSERVATION'],
    ['critical in progress', observation('critical-progress', { severity: 'critical', status: 'in_progress' }), 'OPEN_CRITICAL_FIELD_OBSERVATION'],
    ['high resolved without verification', observation('high-resolved', { severity: 'high', status: 'resolved', resolved_at: '2026-08-21T09:00:00.000Z' }), 'OPEN_HIGH_FIELD_OBSERVATION'],
    ['critical resolved without verification', observation('critical-resolved', { severity: 'critical', status: 'resolved', resolved_at: '2026-08-21T09:00:00.000Z' }), 'OPEN_CRITICAL_FIELD_OBSERVATION'],
  ])('blocks %s', (_name, item, code) => {
    expect(fieldCodes(project([visit(1, [item])]))).toContain(code);
  });

  it('removes B1 blockers only after a valid engineer-verified remediation', () => {
    expect(fieldCodes(project([visit(1, [verified('high-verified', 'high')])]))).toEqual([]);
    expect(fieldCodes(project([visit(1, [verified('critical-verified', 'critical')])]))).toEqual([]);

    // Raw data cannot bypass the lifecycle merely by claiming verified without a resolution.
    expect(
      fieldCodes(
        project([
          visit(1, [observation('critical-unsafe', { severity: 'critical', status: 'verified' })]),
        ])
      )
    ).toContain('OPEN_CRITICAL_FIELD_OBSERVATION');
  });

  it('allows a mixed set only when its high observation is verified and no other high/critical case remains', () => {
    const data = project([
      visit(1, [
        observation('low', { severity: 'low', status: 'open' }),
        observation('medium', { severity: 'medium', status: 'open' }),
        verified('high-verified', 'high'),
      ]),
    ]);
    expect(fieldCodes(data)).toEqual([]);
  });

  it('uses the latest valid explicit follow-up only, while preserving severity across the remediation chain', () => {
    const original = observation('original', { severity: 'critical', status: 'open' });
    const followUp = verified('follow-up', 'low');
    followUp.follow_up_of = { visit_number: 1, observation_id: 'original' };

    const data = project([visit(1, [original]), visit(2, [followUp])]);
    expect(getBlockingStructuredObservationCases({
      visits: data.field_visits,
      supervision: data.supervision_report,
      technicalNotes: data.technical_notes,
    })).toEqual([]);
    expect(fieldCodes(data)).toEqual([]);
  });

  it('does not let an invalid same-visit or future follow-up release a B1 blocker', () => {
    const original = observation('original', { severity: 'high', status: 'open' });
    const invalidFollowUp = verified('invalid-follow-up', 'low');
    invalidFollowUp.follow_up_of = { visit_number: 2, observation_id: 'invalid-follow-up' };
    const data = project([visit(1, [original]), visit(2, [invalidFollowUp])]);
    expect(fieldCodes(data)).toContain('OPEN_HIGH_FIELD_OBSERVATION');
  });

  it('keeps blocking where another high/critical case remains unresolved, regardless of evidence or manual links', () => {
    const critical = verified('critical-verified', 'critical');
    const high = observation('high-open', { severity: 'high', status: 'open' });
    const data = project([visit(1, [critical, high])]);
    data.field_visits[0].evidence = [{
      id: 'after-proof',
      kind: 'photo',
      title: 'بعد',
      description: '',
      engineer_note: '',
      observation_id: 'high-open',
      timing: 'after',
      category: 'corrective_action',
      file: {
        fileName: 'after.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        storageBucket: 'project-files',
        storagePath: 'client/field-visits/visit-1/evidence/after.jpg',
      },
      display_order: 1,
      include_in_visit_pdf: false,
      captured_at: null,
      created_at: '2026-08-21T09:00:00.000Z',
    }];
    data.supervision_report.tasks = [{
      id: 'task', category_id: 'alarm', category_label: 'إنذار', description: 'بند', work_type: 'تركيب', month_progress: {}, total_percent: null,
      related_observation_refs: [{ visit_number: 1, observation_id: 'high-open' }],
    }];
    data.technical_notes.deficiencies = [{
      id: 'linked-medium', description: 'رابط فقط', severity: 'medium', resolved: true,
      source_visit_ref: { visit_number: 1, observation_id: 'high-open' },
    }];

    expect(fieldCodes(data)).toEqual(['OPEN_HIGH_FIELD_OBSERVATION']);
  });

  it('keeps a resolved high observation blocked even with before/after evidence, supervision, and a Technical Deficiency source link', () => {
    const high = observation('high-resolved', {
      severity: 'high',
      status: 'resolved',
      resolved_at: '2026-08-21T09:00:00.000Z',
    });
    const data = project([visit(1, [high])]);
    data.field_visits[0].evidence = [
      {
        id: 'before', kind: 'photo', title: 'قبل', description: '', engineer_note: '', observation_id: 'high-resolved', timing: 'before', category: 'deficiency',
        file: { fileName: 'before.jpg', mimeType: 'image/jpeg', sizeBytes: 1, storageBucket: 'project-files', storagePath: 'client/field-visits/visit-1/evidence/before.jpg' },
        display_order: 1, include_in_visit_pdf: false, captured_at: null, created_at: '2026-08-21T09:00:00.000Z',
      },
      {
        id: 'after', kind: 'photo', title: 'بعد', description: '', engineer_note: '', observation_id: 'high-resolved', timing: 'after', category: 'corrective_action',
        file: { fileName: 'after.jpg', mimeType: 'image/jpeg', sizeBytes: 1, storageBucket: 'project-files', storagePath: 'client/field-visits/visit-1/evidence/after.jpg' },
        display_order: 2, include_in_visit_pdf: false, captured_at: null, created_at: '2026-08-21T09:00:00.000Z',
      },
    ];
    data.supervision_report.tasks = [{
      id: 'task-resolved', category_id: 'alarm', category_label: 'إنذار', description: 'بند', work_type: 'تركيب', month_progress: {}, total_percent: null,
      related_observation_refs: [{ visit_number: 1, observation_id: 'high-resolved' }],
    }];
    data.technical_notes.deficiencies = [{
      id: 'linked-only', description: 'رابط فقط', severity: 'medium', resolved: true,
      source_visit_ref: { visit_number: 1, observation_id: 'high-resolved' },
    }];
    expect(fieldCodes(data)).toEqual(['OPEN_HIGH_FIELD_OBSERVATION']);
  });

  it('preserves existing Technical Deficiency blockers independently from B1', () => {
    const data = project([visit(1, [observation('low', { severity: 'low' })])]);
    data.technical_notes.deficiencies = [{
      id: 'existing-high', description: 'ملاحظة فنية', severity: 'high', resolved: false,
    }];
    const codes = getStage5ApprovalBlockers(data).map((item) => item.code);
    expect(codes).toContain('OPEN_HIGH_DEFICIENCY');
    expect(codes).not.toContain('OPEN_HIGH_FIELD_OBSERVATION');
  });

  it('keeps legacy payloads without structured observations backward compatible', () => {
    const data = project([{
      visit_number: 1,
      status: 'مكتمل',
      findings: 'زيارة تاريخية',
      checklist: [],
      pdf_snapshots: [],
    }]);
    expect(fieldCodes(data)).toEqual([]);
  });

  it('maps race-time RPC B1 codes to the same user-facing client reasons', () => {
    expect(workflowBlockerMessage('OPEN_CRITICAL_FIELD_OBSERVATION')).toContain('حرجة');
    expect(workflowBlockerMessage('OPEN_HIGH_FIELD_OBSERVATION')).toContain('عالية');
  });

  it('keeps client blocker codes aligned with the B1 RPC contract and validates canonical state before mutation', () => {
    for (const code of ['OPEN_CRITICAL_FIELD_OBSERVATION', 'OPEN_HIGH_FIELD_OBSERVATION']) {
      expect(migration).toContain(`'${code}'`);
    }
    expect(migration).toContain('FROM public.project_engineering_live');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('WITH RECURSIVE observation_rows');
    expect(migration).toContain("COALESCE(latest_observation->>'status', '') = 'verified'");
    expect(migration).toContain("latest_observation->>'resolved_at'");
    expect(migration.indexOf('IF jsonb_array_length(v_blockers) > 0')).toBeLessThan(
      migration.indexOf('UPDATE public.field_visit_reports')
    );
    expect(migration).not.toContain('p_payload');
    expect(migration).not.toContain('p_pipeline_stage');
    expect(migration).not.toMatch(/UPDATE\s+public\.clients\s+SET\s+pipeline_stage/i);
    expect(migration).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+POLICY|DROP\s+POLICY/i);
    expect(migration).toContain('v_company_id := public.current_app_company_id();');
    expect(migration).toContain('c.company_id = v_company_id');
    expect(migration).toContain("'INVALID_STAGE_TRANSITION'");
    expect(migration).toContain("v_target NOT IN ('supervision_visits', 'transmittals')");
  });
});
