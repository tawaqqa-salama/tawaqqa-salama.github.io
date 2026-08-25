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

  it('persists an EXISTING assessment through the canonical live RPC only', async () => {
    const result = await saveEngineeringLive({
      clientId: 'existing-client-01',
      data: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        existing_assessment: {
          version: 1,
          systems: {
            sprinkler_system: {
              existing_presence: 'PRESENT',
              observed_configuration: 'شبكة مرشات قائمة',
              compliance_status: 'NEEDS_COMPLETION',
              action_text: 'استكمال التحقق الميداني من التغطية.',
            },
          },
        },
      },
    });

    expect(result.error).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith(
      'save_project_engineering_live',
      expect.objectContaining({ p_client_id: 'existing-client-01' })
    );
    const payload = rpcMock.mock.calls[0][1].p_payload;
    expect(payload.existing_assessment?.systems.sprinkler_system).toMatchObject({
      existing_presence: 'PRESENT',
      compliance_status: 'NEEDS_COMPLETION',
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('persists evidence metadata and strips transient display URLs from the live payload', async () => {
    const result = await saveEngineeringLive({
      clientId: 'client-01',
      data: {
        ...EMPTY_PROJECT_ENGINEERING_DATA,
        technical_report: {
          ...EMPTY_PROJECT_ENGINEERING_DATA.technical_report,
          evidence: {
            version: 1,
            civil_defense: null,
            items: [
              {
                id: 'evidence-001',
                kind: 'safety_system',
                category: 'sprinkler',
                title: 'رشاشات',
                display_order: 1,
                include_in_report: false,
                association: null,
                file: {
                  id: 'evidence-001',
                  fileName: 'sprinkler.jpg',
                  mimeType: 'image/jpeg',
                  sizeBytes: 12_000,
                  storageBucket: 'project-files',
                  storagePath: 'client-01/technical-evidence/safety_system/evidence-001-sprinkler.jpg',
                  dataUrl: 'https://example.com/transient-signed-url',
                },
                code_reference: null,
                created_at: '2026-08-20T00:00:00.000Z',
              },
            ],
          },
        },
      },
    });
    expect(result.error).toBeNull();
    const payload = rpcMock.mock.calls[0][1].p_payload;
    const evidence = payload.technical_report.evidence;
    expect(evidence.items[0].file.storagePath).toContain('technical-evidence');
    expect(evidence.items[0].file.storageBucket).toBe('project-files');
    expect(evidence.items[0].file.fileName).toBe('sprinkler.jpg');
    expect(evidence.items[0].file.dataUrl).toBeNull();
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
