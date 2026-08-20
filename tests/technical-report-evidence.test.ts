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
  sanitizeTechnicalEvidenceStateForPersist,
  validateTechnicalEvidenceUpload,
} from '@/lib/projects/technical-report-evidence';
import { EMPTY_TECHNICAL_REPORT, type TechnicalEvidenceItem } from '@/lib/types/project-reports';

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

  it('accepts only JPEG, PNG, and PDF evidence types', () => {
    expect(validateTechnicalEvidenceUpload({ name: 'photo.JPG', type: 'image/jpeg', size: 1 }).ok).toBe(true);
    expect(validateTechnicalEvidenceUpload({ name: 'map.png', type: 'image/png', size: 1 }).ok).toBe(true);
    expect(validateTechnicalEvidenceUpload({ name: 'excerpt.pdf', type: 'application/pdf', size: 1 }).ok).toBe(true);
    expect(validateTechnicalEvidenceUpload({ name: 'vector.svg', type: 'image/svg+xml', size: 1 }).ok).toBe(false);
    expect(validateTechnicalEvidenceUpload({ name: 'file.bin', type: 'application/octet-stream', size: 1 }).ok).toBe(false);
    expect(validateTechnicalEvidenceUpload({ name: 'spoofed.jpg', type: 'application/pdf', size: 1 }).ok).toBe(false);
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
  });

  it('hydrates a signed URL transiently and sanitizes it before persistence', async () => {
    const state = {
      version: 1 as const,
      civil_defense: null,
      items: [evidenceItem()],
    };
    const hydrated = await hydrateTechnicalEvidenceForDisplay(CLIENT_A, state);
    expect(hydrated.items[0].file.dataUrl).toBe('https://example.com/signed/sprinkler.jpg');

    const persisted = sanitizeTechnicalEvidenceStateForPersist(hydrated);
    expect(persisted.items[0].file.dataUrl).toBeNull();
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
