import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/x.jpg' },
          error: null,
        }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/p.jpg' } }),
      }),
    },
  },
}));

import {
  hydrateEngineeringWithLive,
  saveEngineeringLive,
} from '@/lib/projects/engineering-live-store';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';

describe('engineering live store (all stages)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
  });

  it('saveEngineeringLive calls RPC and never updates clients.project_engineering_data', async () => {
    const result = await saveEngineeringLive({
      clientId: 'c1',
      data: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        technical_report: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
          overview_text: 'تقرير',
          earth_photo: {
            id: 'p1',
            dataUrl: 'data:image/png;base64,' + 'A'.repeat(5000),
          },
        },
      },
      pipelineStage: 'projects',
    });
    expect(result.error).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith(
      'save_project_engineering_live',
      expect.objectContaining({ p_client_id: 'c1', p_pipeline_stage: 'projects' })
    );
    const payload = rpcMock.mock.calls[0][1].p_payload;
    expect(payload.technical_report.earth_photo?.storagePath).toBeTruthy();
    expect(payload.technical_report.earth_photo?.dataUrl).toBeUndefined();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('hydrateEngineeringWithLive prefers live technical report and visits', () => {
    const base = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
        overview_text: 'قديم',
      },
    };
    const next = hydrateEngineeringWithLive(base, {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
        overview_text: 'جديد',
      },
      field_visits: [
        {
          visit_number: 1,
          status: 'معتمد',
          visit_date: '2026-08-13',
          engineer_name: 'م',
          findings: 'ok',
        },
      ],
    });
    expect(next.technical_report.overview_text).toBe('جديد');
    expect(next.field_visits[0].findings).toBe('ok');
  });
});
