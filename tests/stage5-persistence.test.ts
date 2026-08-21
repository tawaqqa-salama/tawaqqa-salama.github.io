import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveEngineeringMock = vi.fn();
const saveStage5Mock = vi.fn();

vi.mock('@/lib/projects/engineering-live-store', () => ({
  saveEngineeringLive: (...args: unknown[]) => saveEngineeringMock(...args),
}));
vi.mock('@/lib/projects/stage5-live-store', () => ({
  saveStage5LiveBundle: (...args: unknown[]) => saveStage5Mock(...args),
}));

import { persistStage5Metadata } from '@/lib/projects/stage5-persistence';
import { EMPTY_PROJECT_ENGINEERING_DATA, type ProjectEngineeringData } from '@/lib/types/project-reports';

describe('Stage 5 canonical persistence coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveEngineeringMock.mockResolvedValue({ error: null });
    saveStage5Mock.mockResolvedValue({ error: null });
  });

  const data = (): ProjectEngineeringData => ({
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    field_visits: [{
      visit_number: 1,
      status: 'مسودة' as const,
      observations: [{
        id: 'obs-1', category: 'other' as const, location: 'الموقع', description: 'ملاحظة', severity: 'medium' as const, required_action: 'إجراء', responsible_party: 'المقاول', status: 'open' as const,
      }],
    }],
  });

  it('writes canonical payload before mirror and returns explicit success for both', async () => {
    const result = await persistStage5Metadata({ clientId: 'client-01', data: data(), pipelineStage: 'projects' });
    expect(result).toMatchObject({ error: null, canonicalPersisted: true, stage5MirrorSynced: true });
    expect(saveEngineeringMock.mock.invocationCallOrder[0]).toBeLessThan(saveStage5Mock.mock.invocationCallOrder[0]);
  });

  it('does not start the mirror when canonical persistence fails', async () => {
    saveEngineeringMock.mockResolvedValue({ error: 'canonical failed' });
    const result = await persistStage5Metadata({ clientId: 'client-01', data: data() });
    expect(result).toMatchObject({ error: 'canonical failed', canonicalPersisted: false, stage5MirrorSynced: false });
    expect(saveStage5Mock).not.toHaveBeenCalled();
  });

  it('returns a mirror error instead of reporting false success after canonical persistence', async () => {
    saveStage5Mock.mockResolvedValue({ error: 'mirror failed' });
    const result = await persistStage5Metadata({ clientId: 'client-01', data: data() });
    expect(result).toMatchObject({ error: 'mirror failed', canonicalPersisted: true, stage5MirrorSynced: false });
  });
});
