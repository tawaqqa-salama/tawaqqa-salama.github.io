import { describe, expect, it } from 'vitest';
import {
  isFieldVisitEvidenceStoragePath,
  normalizeFieldVisitEvidenceForVisit,
  prepareFieldVisitEvidenceDeletion,
  reorderFieldVisitEvidence,
  sanitizeFieldVisitEvidenceForPersist,
} from '@/lib/projects/field-visit-evidence';
import { buildFieldVisitReportHtml } from '@/components/projects/FieldVisitReportPrint';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { FieldVisitEvidence, FieldVisitReport } from '@/lib/types/project-reports';

const CLIENT_ID = 'client-01';

function evidence(id: string, order: number, partial: Partial<FieldVisitEvidence> = {}): FieldVisitEvidence {
  return {
    id,
    kind: 'photo',
    title: `دليل ${id}`,
    description: 'وصف آمن',
    engineer_note: '',
    observation_id: 'obs-01',
    timing: 'general',
    category: 'general_site',
    file: {
      fileName: `${id}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 1200,
      storageBucket: 'project-files',
      storagePath: `${CLIENT_ID}/field-visits/visit-1/evidence/${id}-${id}.jpg`,
    },
    display_order: order,
    include_in_visit_pdf: false,
    captured_at: null,
    created_at: '2026-08-21T00:00:00.000Z',
    ...partial,
  };
}

function visit(partial: Partial<FieldVisitReport> = {}): FieldVisitReport {
  return {
    visit_number: 1,
    status: 'مسودة',
    findings: 'نتائج الزيارة',
    recommendations: 'توصية',
    observations: [
      {
        id: 'obs-01',
        category: 'fire_alarm',
        location: 'المدخل',
        description: 'وصف الملاحظة',
        severity: 'high',
        required_action: 'تنفيذ المعالجة',
        responsible_party: 'المقاول',
        status: 'open',
      },
    ],
    ...partial,
  };
}

const client = {
  id: CLIENT_ID,
  client_code: 'T-01',
  name: 'مشروع اختبار',
  business_name: 'مشروع اختبار',
  owner_name: 'المالك',
  city: 'الرياض',
} as never;

describe('field visit evidence contract', () => {
  it('keeps legacy visits with no evidence valid and empty', () => {
    expect(normalizeFieldVisitEvidenceForVisit(visit()).evidence).toEqual([]);
    expect(EMPTY_PROJECT_ENGINEERING_DATA.field_visits || []).toEqual([]);
  });

  it('persists only allow-listed metadata and strips URLs, raw file-like keys, and unknown properties', () => {
    const raw = visit({
      evidence: [
        {
          ...evidence('evidence-01', 1),
          signedUrl: 'https://secret.example/signed',
          dataUrl: 'data:image/png;base64,forbidden',
          previewUrl: 'blob:forbidden',
          objectURL: 'blob:forbidden',
          rawFile: { name: 'forbidden.jpg' },
          file: {
            ...evidence('evidence-01', 1).file,
            signedUrl: 'https://secret.example/signed',
            dataUrl: 'data:image/png;base64,forbidden',
          },
        } as unknown as FieldVisitEvidence,
      ],
    });
    const result = sanitizeFieldVisitEvidenceForPersist({ clientId: CLIENT_ID, visit: raw });
    const serialized = JSON.stringify(result.evidence);
    expect(serialized).not.toContain('signedUrl');
    expect(serialized).not.toContain('dataUrl');
    expect(serialized).not.toContain('previewUrl');
    expect(serialized).not.toContain('rawFile');
    expect(result.evidence?.[0].file.storagePath).toContain('/field-visits/visit-1/evidence/');
  });

  it('allows only the exact client + visit + evidence namespace and rejects traversal/cross-tenant paths', () => {
    expect(isFieldVisitEvidenceStoragePath({
      clientId: CLIENT_ID,
      visitNumber: 1,
      evidenceId: 'evidence-01',
      storageBucket: 'project-files',
      storagePath: `${CLIENT_ID}/field-visits/visit-1/evidence/evidence-01-photo.jpg`,
    })).toBe(true);
    expect(isFieldVisitEvidenceStoragePath({
      clientId: CLIENT_ID,
      visitNumber: 1,
      evidenceId: 'evidence-01',
      storageBucket: 'project-files',
      storagePath: `other-client/field-visits/visit-1/evidence/evidence-01-photo.jpg`,
    })).toBe(false);
    expect(isFieldVisitEvidenceStoragePath({
      clientId: CLIENT_ID,
      visitNumber: 1,
      evidenceId: 'evidence-01',
      storageBucket: 'project-files',
      storagePath: `${CLIENT_ID}/field-visits/visit-1/evidence/../evidence-01-photo.jpg`,
    })).toBe(false);
  });

  it('clears a stale observation link but preserves the visit-level evidence after an observation is removed', () => {
    const normalized = normalizeFieldVisitEvidenceForVisit(visit({
      observations: [],
      evidence: [evidence('evidence-01', 1)],
    }));
    expect(normalized.evidence).toHaveLength(1);
    expect(normalized.evidence?.[0].observation_id).toBeNull();
  });

  it('reorders metadata only and never changes its stored object path', () => {
    const first = evidence('evidence-01', 1);
    const second = evidence('evidence-02', 2);
    const next = reorderFieldVisitEvidence([first, second], second.id, -1);
    expect(next.map((item) => item.id)).toEqual(['evidence-02', 'evidence-01']);
    expect(next[0].file.storagePath).toBe(second.file.storagePath);
    expect(next[1].file.storagePath).toBe(first.file.storagePath);
  });

  it('prepares metadata-first deletion without touching Storage and leaves a cleanup token', () => {
    const prepared = prepareFieldVisitEvidenceDeletion(visit({ evidence: [evidence('evidence-01', 1)] }), 'evidence-01');
    expect(prepared?.nextVisit.evidence).toEqual([]);
    expect(prepared?.cleanup?.storage_path).toContain('evidence-01');
    expect(prepared?.cleanup?.storage_bucket).toBe('project-files');
  });
});

describe('field visit evidence PDF', () => {
  it('hides the evidence section completely when no evidence is selected', () => {
    const html = buildFieldVisitReportHtml({ client, visit: visit({ evidence: [evidence('evidence-01', 1)] }) });
    expect(html).not.toContain('التوثيق المصور والمرفقات');
  });

  it('renders only selected visual photos with sequential figure numbers and escaped captions', () => {
    const image = evidence('evidence-01', 1, {
      include_in_visit_pdf: true,
      title: '<script>unsafe</script>',
      timing: 'before',
    });
    const hidden = evidence('evidence-02', 2, { include_in_visit_pdf: false });
    const html = buildFieldVisitReportHtml({
      client,
      visit: visit({ evidence: [image, hidden] }),
      evidenceSources: { 'evidence-01': 'https://example.test/signed.jpg' },
    });
    expect(html).toContain('التوثيق المصور والمرفقات');
    expect(html).toContain('شكل (1)');
    expect(html).not.toContain('شكل (2)');
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).not.toContain('<script>unsafe</script>');
  });

  it('renders PDF evidence as a compact textual attachment without consuming a figure number', () => {
    const document = evidence('evidence-03', 1, {
      kind: 'document',
      include_in_visit_pdf: true,
      file: {
        fileName: 'inspection.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2400,
        storageBucket: 'project-files',
        storagePath: `${CLIENT_ID}/field-visits/visit-1/evidence/evidence-03-inspection.pdf`,
      },
    });
    const html = buildFieldVisitReportHtml({ client, visit: visit({ evidence: [document] }) });
    expect(html).toContain('مرفق PDF:');
    expect(html).toContain('inspection.pdf');
    expect(html).not.toContain('شكل (1)');
  });
});
