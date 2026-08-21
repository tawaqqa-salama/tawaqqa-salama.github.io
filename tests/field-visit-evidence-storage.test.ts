import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMock = vi.fn();
const signedMock = vi.fn();
const removeMock = vi.fn();
const validateMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: {
    storage: {
      from: () => ({ upload: uploadMock, createSignedUrl: signedMock, remove: removeMock }),
    },
  },
}));

vi.mock('@/lib/projects/technical-report-evidence', () => ({
  validateTechnicalEvidenceFile: (...args: unknown[]) => validateMock(...args),
}));

import {
  deleteFieldVisitEvidenceSafely,
  resolveFieldVisitEvidenceSrc,
  uploadFieldVisitEvidenceFile,
} from '@/lib/projects/field-visit-evidence';
import type { FieldVisitEvidence, FieldVisitReport } from '@/lib/types/project-reports';

const CLIENT = 'client-01';
const file = { name: 'photo.jpg', type: 'image/jpeg', size: 1234 } as File;

function item(): FieldVisitEvidence {
  return {
    id: 'evidence-01',
    kind: 'photo',
    title: 'صورة اختبار',
    description: '',
    engineer_note: '',
    observation_id: null,
    timing: 'general',
    category: 'general_site',
    file: {
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1234,
      storageBucket: 'project-files',
      storagePath: `${CLIENT}/field-visits/visit-1/evidence/evidence-01-photo.jpg`,
    },
    display_order: 1,
    include_in_visit_pdf: false,
    captured_at: null,
    created_at: '2026-08-21T00:00:00.000Z',
  };
}

function visit(): FieldVisitReport {
  return { visit_number: 1, status: 'مسودة', observations: [], evidence: [item()] };
}

describe('field visit evidence storage adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateMock.mockResolvedValue({ ok: true, mimeType: 'image/jpeg' });
    uploadMock.mockResolvedValue({ error: null });
    signedMock.mockResolvedValue({ data: { signedUrl: 'https://example.test/transient.jpg' }, error: null });
    removeMock.mockResolvedValue({ error: null });
  });

  it('uploads only after shared MIME/signature validation and returns metadata with no display URL', async () => {
    const result = await uploadFieldVisitEvidenceFile({ clientId: CLIENT, visitNumber: 1, evidenceId: 'evidence-01', file });
    expect(validateMock).toHaveBeenCalledWith(file);
    expect(uploadMock).toHaveBeenCalledWith(
      `${CLIENT}/field-visits/visit-1/evidence/evidence-01-photo.jpg`,
      file,
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false })
    );
    expect(JSON.stringify(result)).not.toContain('signedUrl');
    expect(result.file.storagePath).toContain('/field-visits/visit-1/evidence/');
  });

  it('rejects invalid MIME/signature before any storage upload', async () => {
    validateMock.mockResolvedValue({ ok: false, error: 'محتوى ملف الدليل لا يطابق نوعه المسموح.' });
    await expect(uploadFieldVisitEvidenceFile({ clientId: CLIENT, visitNumber: 1, evidenceId: 'evidence-01', file })).rejects.toThrow('محتوى ملف الدليل');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('reports a clear Arabic error when the configured Storage limit rejects a large file', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'Payload too large' } });
    await expect(uploadFieldVisitEvidenceFile({ clientId: CLIENT, visitNumber: 1, evidenceId: 'evidence-01', file })).rejects.toThrow('يتجاوز الحد المسموح');
  });

  it('uses a transient signed URL only after exact path validation and blocks a cross-tenant path', async () => {
    const src = await resolveFieldVisitEvidenceSrc({ clientId: CLIENT, visitNumber: 1, item: item() });
    expect(src).toBe('https://example.test/transient.jpg');
    expect(signedMock).toHaveBeenCalledTimes(1);
    const forged = { ...item(), file: { ...item().file, storagePath: `other-client/field-visits/visit-1/evidence/evidence-01-photo.jpg` } };
    await expect(resolveFieldVisitEvidenceSrc({ clientId: CLIENT, visitNumber: 1, item: forged })).resolves.toBeNull();
    expect(signedMock).toHaveBeenCalledTimes(1);
  });

  it('returns no preview URL when signed URL minting fails', async () => {
    signedMock.mockResolvedValue({ data: null, error: { message: 'expired' } });
    await expect(resolveFieldVisitEvidenceSrc({ clientId: CLIENT, visitNumber: 1, item: item() })).resolves.toBeNull();
  });

  it('does not delete storage when metadata persistence fails', async () => {
    const result = await deleteFieldVisitEvidenceSafely({
      clientId: CLIENT,
      visitNumber: 1,
      visit: visit(),
      evidenceId: 'evidence-01',
      persistVisitMetadata: async () => { throw new Error('metadata failed'); },
    });
    expect(result.metadataPersisted).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('records safe cleanup metadata when storage cleanup fails after metadata persistence', async () => {
    removeMock.mockResolvedValue({ error: { message: 'storage unavailable' } });
    const persisted: FieldVisitReport[] = [];
    const result = await deleteFieldVisitEvidenceSafely({
      clientId: CLIENT,
      visitNumber: 1,
      visit: visit(),
      evidenceId: 'evidence-01',
      persistVisitMetadata: async (next) => { persisted.push(next); },
    });
    expect(result.metadataPersisted).toBe(true);
    expect(result.cleanupPending).toBe(true);
    expect(result.visit.evidence).toEqual([]);
    expect(result.visit.evidence_cleanup_pending?.[0].storage_path).toContain('evidence-01');
    expect(persisted).toHaveLength(2);
  });
});
