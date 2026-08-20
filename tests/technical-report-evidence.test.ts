import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMock = vi.fn();
const createSignedUrlMock = vi.fn();
const removeMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        createSignedUrl: (...args: unknown[]) => createSignedUrlMock(...args),
        remove: (...args: unknown[]) => removeMock(...args),
      }),
    },
  },
}));

import {
  buildLegacyTechnicalEvidenceView,
  buildTechnicalReportEvidenceView,
  deleteTechnicalEvidenceSafely,
  emptyTechnicalEvidenceState,
  hydrateTechnicalEvidenceForDisplay,
  isTechnicalEvidenceStoragePath,
  normalizeTechnicalEvidenceState,
  retryPendingTechnicalEvidenceCleanup,
  sanitizeTechnicalEvidenceStateForPersist,
  uploadTechnicalEvidenceFile,
  validateTechnicalEvidenceFile,
  validateTechnicalEvidenceUpload,
} from '@/lib/projects/technical-report-evidence';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  EMPTY_TECHNICAL_REPORT,
  type TechnicalEvidenceItem,
} from '@/lib/types/project-reports';

const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const EVIDENCE_ID = 'evidence-001';

function evidenceItem(partial: Partial<TechnicalEvidenceItem> = {}): TechnicalEvidenceItem {
  return {
    id: EVIDENCE_ID,
    kind: 'safety_system',
    category: 'sprinkler',
    title: 'رشاشات',
    display_order: 1,
    include_in_report: false,
    association: null,
    file: {
      id: EVIDENCE_ID,
      fileName: 'sprinkler.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1234,
      storageBucket: 'project-files',
      storagePath: `${CLIENT_A}/technical-evidence/safety_system/${EVIDENCE_ID}-sprinkler.jpg`,
      dataUrl: null,
    },
    code_reference: null,
    created_at: '2026-08-20T00:00:00.000Z',
    ...partial,
  };
}

describe('technical evidence Phase 4A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ error: null });
    createSignedUrlMock.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed/sprinkler.jpg' },
      error: null,
    });
    removeMock.mockResolvedValue({ error: null });
  });

  it('normalizes missing evidence safely in memory without requiring persisted legacy data', () => {
    expect(normalizeTechnicalEvidenceState(undefined)).toEqual(emptyTechnicalEvidenceState());
    expect(normalizeTechnicalEvidenceState(null)).toEqual(emptyTechnicalEvidenceState());
  });

  it('loads an old project safely without backfilling evidence and preserves zero/override report data', () => {
    const oldProject = parseProjectEngineeringData({
      technical_report: {
        status: 'مسودة',
        source_overrides: {
          'spaces.space-1.estimated_occupants': { value: 0, note: 'قيمة مهندس' },
        },
      },
    } as never);
    expect(oldProject.technical_report.evidence).toBeUndefined();
    expect(oldProject.technical_report.source_overrides?.['spaces.space-1.estimated_occupants'].value).toBe(0);

    const persisted = sanitizeEngineeringDataForPersist(oldProject);
    expect(persisted.technical_report.evidence).toBeUndefined();
    expect(persisted.technical_report.source_overrides?.['spaces.space-1.estimated_occupants'].value).toBe(0);

    const storageBacked = sanitizeEngineeringDataForPersist({
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: {
        ...EMPTY_TECHNICAL_REPORT,
        evidence: {
          version: 1,
          civil_defense: null,
          items: [evidenceItem({ file: { ...evidenceItem().file, dataUrl: 'https://example.com/transient' } })],
        },
      },
    });
    const reloaded = parseProjectEngineeringData(storageBacked as never);
    expect(reloaded.technical_report.evidence?.items[0].file.storagePath).toContain('technical-evidence');
    expect(reloaded.technical_report.evidence?.items[0].file.dataUrl).toBeNull();
  });

  it('accepts only JPEG, PNG, and PDF evidence types', () => {
    expect(validateTechnicalEvidenceUpload({ name: 'photo.JPG', type: 'image/jpeg', size: 1 }).ok).toBe(true);
    expect(validateTechnicalEvidenceUpload({ name: 'map.png', type: 'image/png', size: 1 }).ok).toBe(true);
    expect(validateTechnicalEvidenceUpload({ name: 'excerpt.pdf', type: 'application/pdf', size: 1 }).ok).toBe(true);
    expect(validateTechnicalEvidenceUpload({ name: 'vector.svg', type: 'image/svg+xml', size: 1 }).ok).toBe(false);
    expect(validateTechnicalEvidenceUpload({ name: 'file.bin', type: 'application/octet-stream', size: 1 }).ok).toBe(false);
    expect(validateTechnicalEvidenceUpload({ name: 'spoofed.jpg', type: 'application/pdf', size: 1 }).ok).toBe(false);
  });

  it('verifies the binary signature in addition to the allowed extension and MIME type', async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'photo.jpg', { type: 'image/jpeg' });
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'map.png', { type: 'image/png' });
    const pdf = new File([new TextEncoder().encode('%PDF-1.7')], 'excerpt.pdf', { type: 'application/pdf' });
    const spoofed = new File([new TextEncoder().encode('<script>alert(1)</script>')], 'spoofed.jpg', { type: 'image/jpeg' });

    await expect(validateTechnicalEvidenceFile(jpeg)).resolves.toMatchObject({ ok: true, mimeType: 'image/jpeg' });
    await expect(validateTechnicalEvidenceFile(png)).resolves.toMatchObject({ ok: true, mimeType: 'image/png' });
    await expect(validateTechnicalEvidenceFile(pdf)).resolves.toMatchObject({ ok: true, mimeType: 'application/pdf' });
    await expect(validateTechnicalEvidenceFile(spoofed)).resolves.toMatchObject({ ok: false });
    await expect(uploadTechnicalEvidenceFile({
      clientId: CLIENT_A,
      evidenceId: EVIDENCE_ID,
      kind: 'unknown_kind' as never,
      file: jpeg,
    })).rejects.toThrow('نوع الدليل غير صالح');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('keeps a local preview when a Storage upload fails instead of silently dropping the evidence', async () => {
    const previousReader = globalThis.FileReader;
    class TestFileReader {
      result: string | null = 'data:image/jpeg;base64,AAAA';
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
      readAsDataURL() {
        this.onload?.({} as ProgressEvent<FileReader>);
      }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    uploadMock.mockResolvedValueOnce({ error: { message: 'network_offline' } });
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'fallback.jpg', { type: 'image/jpeg' });
    try {
      const outcome = await uploadTechnicalEvidenceFile({
        clientId: CLIENT_A,
        evidenceId: EVIDENCE_ID,
        kind: 'safety_system',
        file: jpeg,
      });
      expect(outcome.cloudPersisted).toBe(false);
      expect(outcome.file.storagePath).toBeNull();
      expect(outcome.file.dataUrl).toBe('data:image/jpeg;base64,AAAA');
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: previousReader });
    }
  });

  it('permits only the exact client-scoped Phase 4A storage path', () => {
    const item = evidenceItem();
    expect(isTechnicalEvidenceStoragePath({
      clientId: CLIENT_A,
      evidenceId: item.id,
      kind: item.kind,
      storageBucket: item.file.storageBucket,
      storagePath: item.file.storagePath,
    })).toBe(true);
    expect(isTechnicalEvidenceStoragePath({
      clientId: CLIENT_B,
      evidenceId: item.id,
      kind: item.kind,
      storageBucket: item.file.storageBucket,
      storagePath: item.file.storagePath,
    })).toBe(false);
    expect(isTechnicalEvidenceStoragePath({
      clientId: CLIENT_A,
      evidenceId: item.id,
      kind: item.kind,
      storageBucket: 'other-bucket',
      storagePath: item.file.storagePath,
    })).toBe(false);
    expect(isTechnicalEvidenceStoragePath({
      clientId: CLIENT_A,
      evidenceId: item.id,
      kind: item.kind,
      storageBucket: item.file.storageBucket,
      storagePath: `${CLIENT_A}/technical-evidence/safety_system/../${EVIDENCE_ID}-sprinkler.jpg`,
    })).toBe(false);
    expect(isTechnicalEvidenceStoragePath({
      clientId: CLIENT_A,
      evidenceId: item.id,
      kind: item.kind,
      storageBucket: item.file.storageBucket,
      storagePath: `${CLIENT_A}/technical-evidence/safety_system/%2e%2e/${EVIDENCE_ID}-sprinkler.jpg`,
    })).toBe(false);
    expect(isTechnicalEvidenceStoragePath({
      clientId: CLIENT_A,
      evidenceId: item.id,
      kind: item.kind,
      storageBucket: item.file.storageBucket,
      storagePath: `/${CLIENT_A}/technical-evidence/safety_system/${EVIDENCE_ID}-sprinkler.jpg`,
    })).toBe(false);
  });

  it('hydrates a signed URL transiently and sanitizes it before persistence', async () => {
    const state = {
      version: 1 as const,
      civil_defense: null,
      items: [evidenceItem()],
    };
    const hydrated = await hydrateTechnicalEvidenceForDisplay(CLIENT_A, state);
    expect(hydrated.items[0].file.dataUrl).toBe('https://example.com/signed/sprinkler.jpg');

    const crossTenant = await hydrateTechnicalEvidenceForDisplay(CLIENT_B, state);
    expect(crossTenant.items[0].file.dataUrl).toBeNull();
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);

    const persisted = sanitizeTechnicalEvidenceStateForPersist(hydrated);
    expect(persisted.items[0].file.dataUrl).toBeNull();
    const objectUrl = sanitizeTechnicalEvidenceStateForPersist({
      ...state,
      items: [evidenceItem({ file: { ...evidenceItem().file, storagePath: null, storageBucket: null, dataUrl: 'blob:temporary-preview' } })],
    });
    expect(objectUrl.items[0].file.dataUrl).toBeNull();
    expect(persisted.items[0].file.storagePath).toContain('technical-evidence');
    expect(persisted.items[0].file.fileName).toBe('sprinkler.jpg');
  });

  it('removes large inline bytes while retaining complete evidence metadata', () => {
    const bulky = `data:image/jpeg;base64,${'A'.repeat(180_100)}`;
    const state = sanitizeTechnicalEvidenceStateForPersist({
      version: 1,
      civil_defense: null,
      items: [
        evidenceItem({
          file: {
            id: EVIDENCE_ID,
            fileName: 'local.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 900_000,
            storageBucket: null,
            storagePath: null,
            dataUrl: bulky,
          },
        }),
      ],
    });
    expect(state.items[0].file.dataUrl).toBeNull();
    expect(state.items[0].file.fileName).toBe('local.jpg');
    expect(state.items[0].kind).toBe('safety_system');
    expect(state.items[0].display_order).toBe(1);
  });

  it('exposes legacy image fields through a read-only view without persisted conversion', () => {
    const legacyReport = {
      ...EMPTY_TECHNICAL_REPORT,
      facade_photo: { id: 'legacy-facade-file', caption: 'واجهة', dataUrl: 'data:image/jpeg;base64,AA' },
      code_proof_photos: [{ id: 'legacy-code-file', caption: 'بند كود', dataUrl: 'data:image/png;base64,BB' }],
      firefighting_items: [{ id: 'ff_piping', enabled: true, notes: '', selectedOptions: [], photos: [{ id: 'legacy-system', dataUrl: 'data:image/jpeg;base64,CC' }] }],
    };
    const view = buildLegacyTechnicalEvidenceView(legacyReport);
    expect(view).toHaveLength(3);
    expect(view.every((item) => item.source === 'legacy')).toBe(true);
    expect(view.every((item) => item.include_in_report === false)).toBe(true);
    expect(legacyReport.evidence).toBeUndefined();

    const combined = buildTechnicalReportEvidenceView(legacyReport);
    expect(combined).toHaveLength(3);
    expect(combined.map((item) => item.id)).not.toContain(EVIDENCE_ID);
  });

  it('persists metadata removal before deleting the Storage object', async () => {
    const persistMetadata = vi.fn().mockResolvedValue(undefined);
    const result = await deleteTechnicalEvidenceSafely({
      clientId: CLIENT_A,
      raw: { version: 1, civil_defense: null, items: [evidenceItem()] },
      evidenceId: EVIDENCE_ID,
      persistMetadata,
    });
    expect(persistMetadata).toHaveBeenCalledTimes(1);
    expect(persistMetadata.mock.invocationCallOrder[0]).toBeLessThan(removeMock.mock.invocationCallOrder[0]);
    expect(removeMock).toHaveBeenCalledWith([
      `${CLIENT_A}/technical-evidence/safety_system/${EVIDENCE_ID}-sprinkler.jpg`,
    ]);
    expect(result.metadataPersisted).toBe(true);
    expect(result.storageDeleted).toBe(true);
    expect(result.state.items).toHaveLength(0);
  });

  it('does not delete Storage when metadata persistence fails', async () => {
    const persistMetadata = vi.fn().mockRejectedValue(new Error('metadata_failed'));
    const result = await deleteTechnicalEvidenceSafely({
      clientId: CLIENT_A,
      raw: { version: 1, civil_defense: null, items: [evidenceItem()] },
      evidenceId: EVIDENCE_ID,
      persistMetadata,
    });
    expect(removeMock).not.toHaveBeenCalled();
    expect(result.metadataPersisted).toBe(false);
    expect(result.storageDeleteAttempted).toBe(false);
    expect(result.state.items).toHaveLength(1);
  });

  it('keeps the project valid and queues cleanup if Storage deletion fails', async () => {
    removeMock.mockResolvedValue({ error: { message: 'storage_delete_failed' } });
    const persistMetadata = vi.fn().mockResolvedValue(undefined);
    const result = await deleteTechnicalEvidenceSafely({
      clientId: CLIENT_A,
      raw: { version: 1, civil_defense: null, items: [evidenceItem()] },
      evidenceId: EVIDENCE_ID,
      persistMetadata,
    });
    expect(persistMetadata).toHaveBeenCalledTimes(2);
    expect(result.metadataPersisted).toBe(true);
    expect(result.storageDeleted).toBe(false);
    expect(result.cleanupPending).toBe(true);
    expect(result.state.items).toHaveLength(0);
    expect(result.state.cleanup_pending?.[0].storage_path).toContain('technical-evidence');
  });

  it('revalidates the tenant, bucket, and full path before retrying cleanup', async () => {
    const state = {
      version: 1 as const,
      civil_defense: null,
      items: [],
      cleanup_pending: [{
        id: 'cleanup-001',
        evidence_id: EVIDENCE_ID,
        kind: 'safety_system' as const,
        storage_bucket: 'project-files',
        storage_path: `${CLIENT_A}/technical-evidence/safety_system/${EVIDENCE_ID}-sprinkler.jpg`,
        attempts: 1,
        created_at: '2026-08-20T00:00:00.000Z',
      }],
    };
    const blocked = await retryPendingTechnicalEvidenceCleanup({ clientId: CLIENT_B, raw: state });
    expect(removeMock).not.toHaveBeenCalled();
    expect(blocked.cleanup_pending).toHaveLength(1);
    expect(blocked.cleanup_pending?.[0].attempts).toBe(2);

    const cleaned = await retryPendingTechnicalEvidenceCleanup({ clientId: CLIENT_A, raw: state });
    expect(removeMock).toHaveBeenCalledWith([
      `${CLIENT_A}/technical-evidence/safety_system/${EVIDENCE_ID}-sprinkler.jpg`,
    ]);
    expect(cleaned.cleanup_pending).toEqual([]);
    const idempotent = await retryPendingTechnicalEvidenceCleanup({ clientId: CLIENT_A, raw: cleaned });
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(idempotent.cleanup_pending).toEqual([]);
  });

  it('never deletes an evidence path that belongs to another client', async () => {
    const persistMetadata = vi.fn().mockResolvedValue(undefined);
    const result = await deleteTechnicalEvidenceSafely({
      clientId: CLIENT_B,
      raw: { version: 1, civil_defense: null, items: [evidenceItem()] },
      evidenceId: EVIDENCE_ID,
      persistMetadata,
    });
    expect(persistMetadata).toHaveBeenCalledTimes(2);
    expect(removeMock).not.toHaveBeenCalled();
    expect(result.storageDeleted).toBe(false);
    expect(result.cleanupPending).toBe(true);
  });
});
