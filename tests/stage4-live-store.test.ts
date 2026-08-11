import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  hydrateEngineeringWithStage4,
  saveStage4LiveBundle,
} from '@/lib/projects/stage4-live-store';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  EMPTY_TECHNICAL_REPORT,
} from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';

describe('stage4 live store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
  });

  it('saveStage4LiveBundle calls RPC and strips photo dataUrls', async () => {
    const result = await saveStage4LiveBundle({
      clientId: 'c1',
      technicalReport: {
        ...EMPTY_TECHNICAL_REPORT,
        overview_text: 'وصف',
        earth_photo: {
          id: 'p1',
          caption: 'موقع',
          dataUrl: 'data:image/png;base64,AAAA',
        },
      },
      fireProtectionDesign: {
        ...EMPTY_FIRE_PROTECTION_DESIGN,
        pump: {
          ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
          type: 'UL',
          capacity: { value: 350, unit: 'GPM', source: 'engineer_input' },
        },
      },
      workflow: { active_stage: 'technical_report', tech_report_chapter: 'firefighting' },
      pipelineStage: 'projects',
    });

    expect(result.error).toBeNull();
    expect(result.usedRpc).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      'save_stage4_live_bundle',
      expect.objectContaining({
        p_client_id: 'c1',
        p_pipeline_stage: 'projects',
      })
    );
    const techArg = rpcMock.mock.calls[0][1].p_technical_report;
    expect(techArg.earth_photo?.dataUrl).toBeUndefined();
    expect(techArg.overview_text).toBe('وصف');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('hydrateEngineeringWithStage4 overlays fire protection and keeps local photos', () => {
    const base = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: {
        ...EMPTY_TECHNICAL_REPORT,
        earth_photo: { id: 'local', dataUrl: 'data:image/png;base64,LOCAL' },
      },
    };
    const next = hydrateEngineeringWithStage4(base, {
      technical_report: {
        ...EMPTY_TECHNICAL_REPORT,
        overview_text: 'من السحابة',
        earth_photo: { id: 'remote', caption: 'بلا بايتس' },
      },
      fire_protection_design: {
        ...EMPTY_FIRE_PROTECTION_DESIGN,
        pump: {
          ...EMPTY_FIRE_PROTECTION_DESIGN.pump,
          type: 'non UL',
          capacity: { value: 350, unit: 'GPM', source: 'engineer_input' },
        },
      },
      workflow: { active_stage: 'technical_report', tech_report_chapter: 'facility' },
    });
    expect(next.technical_report.overview_text).toBe('من السحابة');
    expect(next.technical_report.earth_photo?.dataUrl).toBe('data:image/png;base64,LOCAL');
    expect(next.fire_protection_design?.pump.type).toBe('non UL');
    expect(next.workflow?.tech_report_chapter).toBe('facility');
  });
});
