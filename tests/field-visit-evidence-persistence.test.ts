import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveEngineeringMock = vi.fn();
const saveStage5Mock = vi.fn();
const removeMock = vi.fn();

vi.mock('@/lib/projects/engineering-live-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/projects/engineering-live-store')>();
  return { ...actual, saveEngineeringLive: (...args: unknown[]) => saveEngineeringMock(...args) };
});

vi.mock('@/lib/projects/stage5-live-store', () => ({
  saveStage5LiveBundle: (...args: unknown[]) => saveStage5Mock(...args),
}));

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: { storage: { from: () => ({ remove: removeMock }) } },
}));

import { hydrateEngineeringWithLive } from '@/lib/projects/engineering-live-store';
import { deleteFieldVisitEvidenceSafely } from '@/lib/projects/field-visit-evidence';
import { persistFieldVisitEvidenceMetadata } from '@/lib/projects/field-visit-evidence-persistence';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { FieldVisitEvidence, FieldVisitReport, ProjectEngineeringData } from '@/lib/types/project-reports';

const CLIENT_ID = 'client-01';

function evidence(id: string, order: number, partial: Partial<FieldVisitEvidence> = {}): FieldVisitEvidence {
  return {
    id,
    kind: 'photo',
    title: `دليل ${id}`,
    description: 'وصف الدليل',
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

function visit(items: FieldVisitEvidence[] = [evidence('evidence-a', 1)]): FieldVisitReport {
  return {
    visit_number: 1,
    status: 'مسودة',
    observations: [{
      id: 'obs-01',
      category: 'fire_alarm',
      location: 'المدخل',
      description: 'وصف الملاحظة',
      severity: 'high',
      required_action: 'معالجة',
      responsible_party: 'المقاول',
      status: 'open',
    }],
    evidence: items,
  };
}

function project(fieldVisit: FieldVisitReport = visit()): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    field_visits: [fieldVisit],
    engineering_meta: {
      canonical_source: 'project_engineering_live',
      revision: 'r1',
      updated_at: '2026-08-21T00:00:00.000Z',
      conflicts: [],
    },
  };
}

async function persist(params: { data?: ProjectEngineeringData; nextVisit: FieldVisitReport }) {
  return persistFieldVisitEvidenceMetadata({
    clientId: CLIENT_ID,
    data: params.data || project(),
    visitNumber: 1,
    nextVisit: params.nextVisit,
    pipelineStage: 'projects',
  });
}

function reloadedOverStaleMirror(canonical: ProjectEngineeringData, staleMirror: ProjectEngineeringData) {
  return hydrateEngineeringWithLive(staleMirror, canonical);
}

describe('field visit evidence canonical persistence coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveEngineeringMock.mockResolvedValue({ error: null, usedRpc: true });
    saveStage5Mock.mockResolvedValue({ error: null, usedRpc: true });
    removeMock.mockResolvedValue({ error: null });
  });

  it('writes canonical engineering data before synchronizing the Stage 5 mirror', async () => {
    const result = await persist({ nextVisit: visit() });
    expect(result.error).toBeNull();
    expect(result.canonicalPersisted).toBe(true);
    expect(result.stage5MirrorSynced).toBe(true);
    expect(saveEngineeringMock).toHaveBeenCalledTimes(1);
    expect(saveStage5Mock).toHaveBeenCalledTimes(1);
    expect(saveEngineeringMock.mock.invocationCallOrder[0]).toBeLessThan(saveStage5Mock.mock.invocationCallOrder[0]);
    expect(saveEngineeringMock.mock.calls[0][0].data.field_visits[0].evidence[0].id).toBe('evidence-a');
    expect(saveStage5Mock.mock.calls[0][0].fieldVisits[0].evidence[0].id).toBe('evidence-a');
  });

  it('does not sync the Stage 5 mirror when canonical persistence fails', async () => {
    saveEngineeringMock.mockResolvedValue({ error: 'canonical failed', usedRpc: true });
    const result = await persist({ nextVisit: visit() });
    expect(result.error).toBe('canonical failed');
    expect(result.canonicalPersisted).toBe(false);
    expect(result.stage5MirrorSynced).toBe(false);
    expect(saveStage5Mock).not.toHaveBeenCalled();
  });

  it('does not report success when the Stage 5 mirror synchronization fails', async () => {
    saveStage5Mock.mockResolvedValue({ error: 'mirror failed', usedRpc: true });
    const result = await persist({ nextVisit: visit() });
    expect(result.error).toBe('mirror failed');
    expect(result.canonicalPersisted).toBe(true);
    expect(result.stage5MirrorSynced).toBe(false);
  });

  it('keeps a deleted evidence absent after canonical save and reload despite a stale mirror', async () => {
    const stale = project(visit([evidence('evidence-a', 1)]));
    const result = await persist({ data: stale, nextVisit: visit([]) });
    const reloaded = reloadedOverStaleMirror(result.data, stale);
    expect(result.error).toBeNull();
    expect(reloaded.field_visits[0].evidence).toEqual([]);
  });

  it('persists title, category, engineer note, and PDF include flag through canonical reload', async () => {
    const changed = evidence('evidence-a', 1, {
      title: 'عنوان محدث',
      category: 'fire_alarm',
      engineer_note: 'ملاحظة مهندس محدثة',
      include_in_visit_pdf: true,
    });
    const result = await persist({ nextVisit: visit([changed]) });
    const reloaded = reloadedOverStaleMirror(result.data, project(visit()));
    const item = reloaded.field_visits[0].evidence?.[0];
    expect(item).toMatchObject({
      title: 'عنوان محدث',
      category: 'fire_alarm',
      engineer_note: 'ملاحظة مهندس محدثة',
      include_in_visit_pdf: true,
    });
  });

  it('keeps false for the PDF include flag through a later canonical save and reload', async () => {
    const initial = await persist({ nextVisit: visit([evidence('evidence-a', 1, { include_in_visit_pdf: true })]) });
    const second = await persist({
      data: initial.data,
      nextVisit: visit([evidence('evidence-a', 1, { include_in_visit_pdf: false })]),
    });
    const reloaded = reloadedOverStaleMirror(second.data, initial.data);
    expect(reloaded.field_visits[0].evidence?.[0].include_in_visit_pdf).toBe(false);
  });

  it('preserves reordered evidence and observation link/unlink states through canonical reload', async () => {
    const a = evidence('evidence-a', 2, { observation_id: 'obs-01' });
    const b = evidence('evidence-b', 3, { observation_id: null });
    const c = evidence('evidence-c', 1, { observation_id: 'obs-01' });
    const result = await persist({ nextVisit: visit([c, a, b]) });
    const reloaded = reloadedOverStaleMirror(result.data, project(visit([a, b, c])));
    expect(reloaded.field_visits[0].evidence?.map((item) => item.id)).toEqual(['evidence-c', 'evidence-a', 'evidence-b']);
    expect(reloaded.field_visits[0].evidence?.[1].observation_id).toBe('obs-01');
    expect(reloaded.field_visits[0].evidence?.[2].observation_id).toBeNull();
  });

  it('strips transient URL and raw-file-like data before it enters the canonical save input', async () => {
    const unsafe = {
      ...evidence('evidence-a', 1),
      signedUrl: 'https://signed.example/temporary',
      previewUrl: 'blob:temporary',
      dataUrl: 'data:image/png;base64,forbidden',
      rawFile: { name: 'unsafe.jpg' },
      file: {
        ...evidence('evidence-a', 1).file,
        signedUrl: 'https://signed.example/temporary',
        previewUrl: 'blob:temporary',
        dataUrl: 'data:image/png;base64,forbidden',
      },
    } as unknown as FieldVisitEvidence;
    const result = await persist({ nextVisit: visit([unsafe]) });
    const canonicalInput = JSON.stringify(saveEngineeringMock.mock.calls[0][0].data.field_visits[0].evidence);
    expect(result.error).toBeNull();
    expect(canonicalInput).not.toContain('signedUrl');
    expect(canonicalInput).not.toContain('previewUrl');
    expect(canonicalInput).not.toContain('dataUrl');
    expect(canonicalInput).not.toContain('rawFile');
  });

  it('blocks Storage deletion when the real canonical coordinator fails and allows it only after canonical plus mirror persistence', async () => {
    const source = project();
    saveEngineeringMock.mockResolvedValueOnce({ error: 'canonical failed', usedRpc: true });
    const blocked = await deleteFieldVisitEvidenceSafely({
      clientId: CLIENT_ID,
      visitNumber: 1,
      visit: source.field_visits[0],
      evidenceId: 'evidence-a',
      persistVisitMetadata: async (nextVisit) => {
        const result = await persist({ data: source, nextVisit });
        if (result.error) throw new Error(result.error);
      },
    });
    expect(blocked.metadataPersisted).toBe(false);
    expect(removeMock).not.toHaveBeenCalled();

    const allowed = await deleteFieldVisitEvidenceSafely({
      clientId: CLIENT_ID,
      visitNumber: 1,
      visit: source.field_visits[0],
      evidenceId: 'evidence-a',
      persistVisitMetadata: async (nextVisit) => {
        const result = await persist({ data: source, nextVisit });
        if (result.error) throw new Error(result.error);
      },
    });
    expect(allowed.metadataPersisted).toBe(true);
    expect(allowed.cleanupPending).toBe(false);
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(saveEngineeringMock.mock.invocationCallOrder[1]).toBeLessThan(saveStage5Mock.mock.invocationCallOrder[0]);
    expect(saveStage5Mock.mock.invocationCallOrder[0]).toBeLessThan(removeMock.mock.invocationCallOrder[0]);
  });
});
