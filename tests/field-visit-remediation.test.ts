import { describe, expect, it } from 'vitest';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { getStage5ApprovalBlockers } from '@/lib/projects/gated-pipeline';
import {
  addObservationRefToTask,
  buildRemediationCases,
  removeObservationRefFromTask,
} from '@/lib/projects/field-visit-remediation';
import {
  canVerifyFieldVisitObservation,
  normalizeFieldVisitObservations,
} from '@/lib/projects/field-visit-observations';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type FieldVisitObservation,
  type FieldVisitReport,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';

const baseObservation = (id: string, partial: Partial<FieldVisitObservation> = {}): FieldVisitObservation => ({
  id,
  category: 'fire_alarm',
  location: 'مدخل المبنى',
  description: `ملاحظة ${id}`,
  severity: 'high',
  required_action: 'معالجة الملاحظة',
  responsible_party: 'المقاول',
  due_date: '2026-09-10',
  status: 'open',
  ...partial,
});

const visit = (visit_number: number, observations: FieldVisitObservation[]): FieldVisitReport => ({
  visit_number,
  status: 'معتمد',
  observations,
  evidence: [],
});

function project(field_visits: FieldVisitReport[]): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    field_visits,
    supervision_report: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.supervision_report,
      status: 'معتمد',
      tasks: [],
    },
    technical_notes: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_notes,
      status: 'معتمد',
      deficiencies: [],
    },
  };
}

describe('Phase 5D remediation lifecycle and explicit links', () => {
  it('keeps legacy observations compatible without fabricating remediation fields', () => {
    const result = normalizeFieldVisitObservations([
      {
        id: 'legacy',
        category: 'other',
        location: 'الموقع',
        description: 'ملاحظة تاريخية',
        severity: 'medium',
        required_action: 'مراجعة',
        responsible_party: 'المقاول',
        status: 'open',
      },
    ]);

    expect(result[0]).toMatchObject({ id: 'legacy', status: 'open' });
    expect(result[0]).not.toHaveProperty('follow_up_of');
    expect(result[0]).not.toHaveProperty('verified_at');
  });

  it('preserves open → in_progress → resolved → verified through save and reload', () => {
    const resolvedAt = '2026-09-02T10:00:00.000Z';
    const input = {
      ...project([
        visit(1, [baseObservation('open', { status: 'open' })]),
        visit(2, [baseObservation('progress', { status: 'in_progress' })]),
        visit(3, [baseObservation('resolved', { status: 'resolved', resolved_at: resolvedAt, resolved_by: 'المقاول' })]),
        visit(4, [baseObservation('verified', { status: 'verified', resolved_at: resolvedAt, resolved_by: 'المقاول', verified_at: '2026-09-05T10:00:00.000Z', verified_by: 'المهندس' })]),
      ]),
    };
    const reloaded = parseProjectEngineeringData(JSON.parse(JSON.stringify(input)));

    expect(reloaded.field_visits.map((item) => item.observations?.[0]?.status)).toEqual([
      'open', 'in_progress', 'resolved', 'verified',
    ]);
    expect(reloaded.field_visits[3].observations?.[0]).toMatchObject({
      resolved_by: 'المقاول',
      verified_by: 'المهندس',
    });
  });

  it('fails closed when raw persisted data claims verified without a recorded resolution', () => {
    const [result] = normalizeFieldVisitObservations([
      { ...baseObservation('unsafe'), status: 'verified', verified_at: '2026-09-05T10:00:00.000Z' },
    ]);
    expect(result.status).toBe('open');
    expect(canVerifyFieldVisitObservation(result)).toBe(false);
  });

  it('permits engineer verification only after the remediation is recorded', () => {
    expect(canVerifyFieldVisitObservation(baseObservation('open'))).toBe(false);
    expect(canVerifyFieldVisitObservation(baseObservation('resolved', {
      status: 'resolved',
      resolved_at: '2026-09-02T10:00:00.000Z',
    }))).toBe(true);
  });

  it('builds an explicit original → follow-up chain with evidence metadata and preserves source visits', () => {
    const original = visit(1, [baseObservation('obs-original')]);
    original.evidence = [{
      id: 'evidence-before', kind: 'photo', title: 'قبل', description: '', engineer_note: '', observation_id: 'obs-original', timing: 'before', category: 'deficiency',
      file: { fileName: 'before.jpg', mimeType: 'image/jpeg', sizeBytes: 1, storageBucket: 'project-files', storagePath: 'client-01/field-visits/visit-1/evidence/evidence-before-before.jpg' },
      display_order: 1, include_in_visit_pdf: false, captured_at: null, created_at: '2026-09-01T00:00:00.000Z',
    }];
    const followUp = visit(2, [baseObservation('obs-follow-up', {
      status: 'resolved',
      resolved_at: '2026-09-03T00:00:00.000Z',
      follow_up_of: { visit_number: 1, observation_id: 'obs-original' },
    })]);
    followUp.evidence = [{
      id: 'evidence-after', kind: 'photo', title: 'بعد', description: '', engineer_note: '', observation_id: 'obs-follow-up', timing: 'after', category: 'corrective_action',
      file: { fileName: 'after.jpg', mimeType: 'image/jpeg', sizeBytes: 1, storageBucket: 'project-files', storagePath: 'client-01/field-visits/visit-2/evidence/evidence-after-after.jpg' },
      display_order: 1, include_in_visit_pdf: false, captured_at: null, created_at: '2026-09-03T00:00:00.000Z',
    }];
    const before = JSON.stringify([original, followUp]);
    const cases = buildRemediationCases({ visits: [original, followUp], supervision: project([]).supervision_report, technicalNotes: project([]).technical_notes });

    expect(cases).toHaveLength(1);
    expect(cases[0].root.ref).toEqual({ visit_number: 1, observation_id: 'obs-original' });
    expect(cases[0].followUps.map((item) => item.ref)).toEqual([{ visit_number: 2, observation_id: 'obs-follow-up' }]);
    expect(cases[0].beforeEvidenceCount).toBe(1);
    expect(cases[0].afterEvidenceCount).toBe(1);
    expect(JSON.stringify([original, followUp])).toBe(before);
  });

  it('does not use text, severity, or location heuristics to create follow-up links', () => {
    const cases = buildRemediationCases({
      visits: [
        visit(1, [baseObservation('a', { description: 'نفس النص', location: 'نفس الموقع', severity: 'critical' })]),
        visit(2, [baseObservation('b', { description: 'نفس النص', location: 'نفس الموقع', severity: 'critical' })]),
      ],
      supervision: project([]).supervision_report,
      technicalNotes: project([]).technical_notes,
    });
    expect(cases).toHaveLength(2);
    expect(cases.every((item) => item.followUps.length === 0)).toBe(true);
  });

  it('unlinks a follow-up without deleting a visit, observation, or evidence', () => {
    const original = visit(1, [baseObservation('original')]);
    const follow = visit(2, [baseObservation('follow', { follow_up_of: { visit_number: 1, observation_id: 'original' } })]);
    const unlinked = { ...follow, observations: follow.observations?.map((observation) => ({ ...observation, follow_up_of: null })) };
    const cases = buildRemediationCases({ visits: [original, unlinked], supervision: project([]).supervision_report, technicalNotes: project([]).technical_notes });
    expect(unlinked.observations).toHaveLength(1);
    expect(cases).toHaveLength(2);
  });

  it('keeps supervision task references unique and removable without changing the visit or Sales-shaped input', () => {
    const ref = { visit_number: 2, observation_id: 'obs-follow-up' };
    const taskRefs = addObservationRefToTask(addObservationRefToTask([], ref), ref);
    expect(taskRefs).toEqual([ref]);
    expect(removeObservationRefFromTask(taskRefs, ref)).toEqual([]);
  });

  it('links a technical deficiency only when the engineer has explicitly set a source reference', () => {
    const data = project([visit(1, [baseObservation('source')])]);
    const unlinked = buildRemediationCases({ visits: data.field_visits, supervision: data.supervision_report, technicalNotes: data.technical_notes });
    const linked = buildRemediationCases({
      visits: data.field_visits,
      supervision: data.supervision_report,
      technicalNotes: {
        ...data.technical_notes,
        deficiencies: [{ id: 'def-1', description: 'ملاحظة فنية', severity: 'high', resolved: false, source_visit_ref: { visit_number: 1, observation_id: 'source' } }],
      },
    });
    expect(unlinked[0].linkedDeficiencies).toHaveLength(0);
    expect(linked[0].linkedDeficiencies.map((item) => item.id)).toEqual(['def-1']);
  });

  it('sanitizes invalid references without fabricating links and preserves valid manual refs through canonical save payload', () => {
    const data = project([
      visit(1, [baseObservation('original')]),
      visit(2, [baseObservation('follow', { follow_up_of: { visit_number: 1, observation_id: 'original' } })]),
    ]);
    data.supervision_report.tasks = [{
      id: 'task-1', category_id: 'alarm', category_label: 'إنذار', description: 'بند', work_type: 'تركيب', month_progress: {}, total_percent: null,
      related_observation_refs: [{ visit_number: 2, observation_id: 'follow' }, { visit_number: 7, observation_id: 'missing' }],
    }];
    data.technical_notes.deficiencies = [
      { id: 'valid', description: 'صحيح', severity: 'high', resolved: false, source_visit_ref: { visit_number: 1, observation_id: 'original' } },
      { id: 'invalid', description: 'غير صحيح', severity: 'high', resolved: false, source_visit_ref: { visit_number: 9, observation_id: 'missing' } },
    ];
    const persisted = sanitizeEngineeringDataForPersist(data, { clientId: 'client-01', aggressive: true });

    expect(persisted.field_visits[1].observations?.[0].follow_up_of).toEqual({ visit_number: 1, observation_id: 'original' });
    expect(persisted.supervision_report.tasks[0].related_observation_refs).toEqual([{ visit_number: 2, observation_id: 'follow' }]);
    expect(persisted.technical_notes.deficiencies[0].source_visit_ref).toEqual({ visit_number: 1, observation_id: 'original' });
    expect(persisted.technical_notes.deficiencies[1]).not.toHaveProperty('source_visit_ref');
  });

  it('keeps the Stage 5 blocker contract unchanged: structured high/critical observations are not direct blockers in Path A', () => {
    const data = project([visit(1, [baseObservation('critical', { severity: 'critical', status: 'open' })])]);
    expect(getStage5ApprovalBlockers(data)).toEqual([]);
  });
});
