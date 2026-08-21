import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveStage5Traceability } from '@/lib/projects/stage5-traceability';
import type {
  FieldVisitEvidence,
  FieldVisitObservation,
  FieldVisitReport,
  SupervisionReport,
  TechnicalNotesReport,
} from '@/lib/types/project-reports';
import type { ReportPdfSnapshot } from '@/lib/types/report-pdf-snapshot';

const baseObservation = (overrides: Partial<FieldVisitObservation> = {}): FieldVisitObservation => ({
  id: 'obs-root',
  category: 'fire_alarm',
  location: 'غرفة المضخات',
  description: 'لوحة الإنذار تحتاج معالجة.',
  severity: 'medium',
  required_action: 'تصحيح التوصيل واختبار النظام.',
  responsible_party: 'المقاول',
  status: 'open',
  ...overrides,
});

const baseEvidence = (overrides: Partial<FieldVisitEvidence> = {}): FieldVisitEvidence => ({
  id: 'evidence-1',
  kind: 'photo',
  title: 'دليل ميداني',
  description: '',
  engineer_note: '',
  observation_id: 'obs-root',
  timing: 'general',
  category: 'fire_alarm',
  file: {
    fileName: 'evidence.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    storageBucket: 'project-files',
    storagePath: 'client/field-visits/visit-1/evidence/evidence.jpg',
  },
  display_order: 1,
  include_in_visit_pdf: true,
  created_at: '2026-08-01T10:00:00.000Z',
  ...overrides,
});

const baseVisit = (overrides: Partial<FieldVisitReport> = {}): FieldVisitReport => ({
  visit_number: 1,
  visit_date: '2026-08-01',
  location: 'الموقع الرئيسي',
  status: 'معتمد',
  observations: [baseObservation()],
  evidence: [baseEvidence()],
  ...overrides,
});

const supervision: SupervisionReport = {
  status: 'مسودة',
  tasks: [],
  months: [],
};

const technicalNotes: TechnicalNotesReport = {
  status: 'مسودة',
  deficiencies: [],
};

const snapshot = (overrides: Partial<ReportPdfSnapshot> = {}): ReportPdfSnapshot => ({
  id: 'visit-pdf-1',
  kind: 'field_visit',
  visit_number: 1,
  report_date: '2026-08-01',
  title_ar: 'تقرير زيارة #1',
  fileName: 'visit-1.pdf',
  sizeBytes: 1000,
  mimeType: 'application/pdf',
  storageBucket: 'project-files',
  storagePath: 'client/reports/visit-1.pdf',
  dataUrl: null,
  created_at: '2026-08-01T12:00:00.000Z',
  ...overrides,
});

describe('deriveStage5Traceability', () => {
  it('returns a safe empty workspace for an empty Stage 5 state', () => {
    expect(deriveStage5Traceability({ today: '2026-08-15' })).toEqual({
      items: [],
      visitSummaries: [],
      supervisionPdfSnapshots: [],
      unassignedPdfSnapshots: [],
    });
  });

  it('supports a historical visit without observations or evidence without inventing a traceability row', () => {
    const result = deriveStage5Traceability({
      fieldVisits: [{ visit_number: 7, visit_date: '2020-01-01', status: 'معتمد' }],
      today: '2026-08-15',
    });

    expect(result.items).toEqual([]);
    expect(result.visitSummaries).toEqual([
      expect.objectContaining({ visitNumber: 7, observationCount: 0, evidenceCount: 0 }),
    ]);
  });

  it('derives one structured observation with deterministic key, current state, and due metadata', () => {
    const result = deriveStage5Traceability({
      fieldVisits: [baseVisit()],
      supervision,
      technicalNotes,
      today: '2026-08-15',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      key: '1:obs-root',
      observationRef: { visit_number: 1, observation_id: 'obs-root' },
      visitNumber: 1,
      firstVisitNumber: 1,
      currentStatus: 'open',
      severity: 'medium',
      responsibleParty: 'المقاول',
      dueState: 'not_set',
      verificationState: 'pending',
      followUpCount: 0,
    });
  });

  it('uses the latest valid follow-up for status and verification while retaining root severity and first-visit context', () => {
    const root = baseVisit({
      visit_number: 1,
      visit_date: '2026-08-01',
      observations: [baseObservation({ id: 'root', severity: 'critical', status: 'open' })],
    });
    const followUp = baseVisit({
      visit_number: 2,
      visit_date: '2026-08-05',
      observations: [
        baseObservation({
          id: 'follow-1',
          status: 'resolved',
          due_date: '2026-08-07',
          resolved_at: '2026-08-06T09:00:00.000Z',
          follow_up_of: { visit_number: 1, observation_id: 'root' },
        }),
      ],
      evidence: [],
    });
    const verified = baseVisit({
      visit_number: 3,
      visit_date: '2026-08-10',
      observations: [
        baseObservation({
          id: 'follow-2',
          severity: 'high',
          status: 'verified',
          resolved_at: '2026-08-09T09:00:00.000Z',
          verified_at: '2026-08-10T09:00:00.000Z',
          verified_by: 'م. أحمد',
          follow_up_of: { visit_number: 2, observation_id: 'follow-1' },
        }),
      ],
      evidence: [],
    });

    const result = deriveStage5Traceability({ fieldVisits: [verified, root, followUp], supervision, technicalNotes, today: '2026-08-15' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      key: '1:root',
      severity: 'critical',
      firstVisitNumber: 1,
      visitNumber: 3,
      latestFollowUp: { visit_number: 3, observation_id: 'follow-2' },
      followUpCount: 2,
      chainVisitNumbers: [1, 2, 3],
      currentStatus: 'verified',
      verificationState: 'verified',
      dueState: 'verified',
      resolvedAt: '2026-08-09T09:00:00.000Z',
      verifiedAt: '2026-08-10T09:00:00.000Z',
      verifiedBy: 'م. أحمد',
    });
  });

  it('counts before, after, general, selected, and excluded evidence without treating excluded evidence as absent', () => {
    const result = deriveStage5Traceability({
      fieldVisits: [
        baseVisit({
          evidence: [
            baseEvidence({ id: 'before', timing: 'before', include_in_visit_pdf: true }),
            baseEvidence({ id: 'after', timing: 'after', include_in_visit_pdf: false }),
            baseEvidence({ id: 'general', timing: 'general', include_in_visit_pdf: true }),
          ],
        }),
      ],
      today: '2026-08-15',
    });

    expect(result.items[0]).toMatchObject({
      beforeEvidenceCount: 1,
      afterEvidenceCount: 1,
      generalEvidenceCount: 1,
      selectedEvidenceCount: 2,
      excludedEvidenceCount: 1,
    });
  });

  it('exposes supervision and technical-deficiency links only when they explicitly reference the observation chain', () => {
    const linkedSupervision: SupervisionReport = {
      ...supervision,
      tasks: [
        {
          id: 'task-1',
          category_id: 'manual',
          category_label: 'إنذار',
          description: 'متابعة لوحة الإنذار',
          work_type: 'تركيب',
          month_progress: {},
          total_percent: null,
          related_observation_refs: [{ visit_number: 1, observation_id: 'obs-root' }],
        },
      ],
    };
    const linkedTechnicalNotes: TechnicalNotesReport = {
      status: 'مسودة',
      deficiencies: [
        { id: 'def-1', description: 'عجز مرتبط', severity: 'high', resolved: false, source_visit_ref: { visit_number: 1, observation_id: 'obs-root' } },
        { id: 'def-2', description: 'غير مرتبط', severity: 'low', resolved: false, source_visit_ref: null },
      ],
    };

    const result = deriveStage5Traceability({
      fieldVisits: [baseVisit()],
      supervision: linkedSupervision,
      technicalNotes: linkedTechnicalNotes,
      today: '2026-08-15',
    });

    expect(result.items[0].supervisionTaskIds).toEqual(['task-1']);
    expect(result.items[0].technicalDeficiencyIds).toEqual(['def-1']);
  });

  it('associates visit and supervision PDF snapshots, exposes storage availability, and preserves snapshots without usable storage paths', () => {
    const supervisionPdf = snapshot({
      id: 'supervision-pdf',
      kind: 'supervision',
      visit_number: null,
      title_ar: 'تقرير الإشراف',
      fileName: 'supervision.pdf',
      storagePath: null,
      dataUrl: null,
      created_at: '2026-08-02T12:00:00.000Z',
    });
    const orphan = snapshot({
      id: 'old-orphan',
      kind: 'field_visit',
      visit_number: 99,
      fileName: 'old.pdf',
      created_at: '2026-07-01T12:00:00.000Z',
    });
    const result = deriveStage5Traceability({
      fieldVisits: [baseVisit({ pdf_snapshots: [snapshot()] })],
      supervision: { ...supervision, pdf_snapshots: [supervisionPdf] },
      reportPdfArchive: [snapshot(), supervisionPdf, orphan],
      today: '2026-08-15',
    });

    expect(result.items[0].pdfSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'visit-pdf-1', storageAvailable: true }),
        expect.objectContaining({ id: 'supervision-pdf', storageAvailable: false }),
      ])
    );
    expect(result.supervisionPdfSnapshots).toEqual([
      expect.objectContaining({ id: 'supervision-pdf', storageAvailable: false }),
    ]);
    expect(result.unassignedPdfSnapshots).toEqual([
      expect.objectContaining({ id: 'old-orphan', storageAvailable: true }),
    ]);
  });

  it('is deterministic and does not mutate canonical input arrays or objects', () => {
    const input = {
      fieldVisits: [baseVisit({ pdf_snapshots: [snapshot()] })],
      supervision,
      technicalNotes,
      reportPdfArchive: [snapshot()],
      today: '2026-08-15',
    };
    const before = JSON.stringify(input);
    const first = deriveStage5Traceability(input);
    const second = deriveStage5Traceability(input);

    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('Phase 5F read-only boundary', () => {
  it('does not import persistence, deletion, upload, workflow, or approval mutation paths', () => {
    const moduleSource = readFileSync(
      resolve(process.cwd(), 'lib/projects/stage5-traceability.ts'),
      'utf8'
    );
    const panelPath = resolve(process.cwd(), 'components/projects/Stage5TraceabilityPanel.tsx');
    const panelSource = readFileSync(panelPath, 'utf8');
    const prohibited = [
      'saveStage5',
      'saveReport',
      'saveEngineering',
      'deleteFieldVisit',
      'uploadFieldVisit',
      'deleteFieldVisitEvidence',
      'uploadFieldVisitEvidence',
      'approveWorkflowStage',
      'transitionEngineeringWorkflow',
      '.rpc(',
      '.insert(',
      '.update(',
      '.delete(',
    ];

    for (const fragment of prohibited) {
      expect(moduleSource).not.toContain(fragment);
      expect(panelSource).not.toContain(fragment);
    }
    expect(panelSource).not.toContain('min-w-[920px]');
    expect(panelSource).not.toContain('overflow-x-auto');
  });
});
