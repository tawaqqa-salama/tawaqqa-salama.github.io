import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/lib/supabase/safe-client-write', () => ({
  backupEngineeringDataLocally: vi.fn(),
}));

import {
  hydrateEngineeringWithStage5,
  saveStage5LiveBundle,
} from '@/lib/projects/stage5-live-store';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  EMPTY_SUPERVISION_REPORT,
} from '@/lib/types/project-reports';

describe('stage5 live store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
  });

  it('saveStage5LiveBundle calls RPC and never uses clients update for engineering JSON', async () => {
    const result = await saveStage5LiveBundle({
      clientId: 'c1',
      fieldVisits: [
        {
          visit_number: 1,
          status: 'معتمد',
          visit_date: '2026-08-13',
          engineer_name: 'م. أحمد',
          findings: 'ملاحظات',
          pdf_snapshots: [
            {
              id: 's1',
              kind: 'field_visit',
              visit_number: 1,
              report_date: '2026-08-13',
              title_ar: 'زيارة',
              fileName: 'v.pdf',
              sizeBytes: 10,
              mimeType: 'application/pdf',
              storageBucket: 'project-files',
              storagePath: 'c1/visit-reports/x.pdf',
              dataUrl: 'data:application/pdf;base64,AAA',
              created_at: '2026-08-13T00:00:00.000Z',
            },
          ],
        },
      ],
      supervision: {
        ...EMPTY_SUPERVISION_REPORT,
        status: 'مسودة',
        tasks: [
          {
            id: 't1',
            category_id: 'c1',
            category_label: 'أعمال',
            description: 'عمل',
            work_type: 'تركيب',
            total_percent: 10,
            month_progress: {},
          },
        ],
      },
      pdfArchive: [],
      pipelineStage: 'projects',
    });

    expect(result.error).toBeNull();
    expect(result.usedRpc).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      'save_stage5_live_bundle',
      expect.objectContaining({
        p_client_id: 'c1',
        p_pipeline_stage: 'projects',
      })
    );
    const visitsArg = rpcMock.mock.calls[0][1].p_field_visits;
    expect(visitsArg[0].pdf_snapshots[0].dataUrl).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('sanitizes visit evidence metadata before the Stage 5 RPC payload is written', async () => {
    const result = await saveStage5LiveBundle({
      clientId: 'client-01',
      fieldVisits: [{
        visit_number: 1,
        status: 'مسودة',
        observations: [{
          id: 'obs-01', category: 'fire_alarm', location: 'مدخل', description: 'وصف', severity: 'high', required_action: 'معالجة', responsible_party: 'المقاول', status: 'open',
        }],
        evidence: [{
          id: 'evidence-01', kind: 'photo', title: 'صورة', description: '', engineer_note: '', observation_id: 'obs-01', timing: 'before', category: 'fire_alarm', display_order: 1, include_in_visit_pdf: true, captured_at: null, created_at: '2026-08-21T00:00:00.000Z',
          file: {
            fileName: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 100, storageBucket: 'project-files',
            storagePath: 'client-01/field-visits/visit-1/evidence/evidence-01-photo.jpg',
            signedUrl: 'https://transient.example/x', dataUrl: 'data:image/png;base64,forbidden',
          },
        } as never],
      }],
      supervision: { ...EMPTY_SUPERVISION_REPORT, tasks: [] },
      pdfArchive: [],
    });
    expect(result.error).toBeNull();
    const payload = rpcMock.mock.calls[0][1].p_field_visits[0];
    expect(payload.evidence[0].file.storagePath).toContain('/field-visits/visit-1/evidence/');
    expect(JSON.stringify(payload.evidence)).not.toContain('signedUrl');
    expect(JSON.stringify(payload.evidence)).not.toContain('dataUrl');
  });

  it('hydrateEngineeringWithStage5 overlays visits and archive', () => {
    const base = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      field_visits: [
        {
          visit_number: 1,
          status: 'مسودة' as const,
          visit_date: '',
          engineer_name: '',
          findings: 'قديمة',
        },
      ],
    };
    const next = hydrateEngineeringWithStage5(base, {
      field_visits: [
        {
          visit_number: 1,
          status: 'معتمد',
          visit_date: '2026-08-13',
          engineer_name: 'م. أحمد',
          findings: 'جديدة',
        },
      ],
      supervision_report: {
        ...EMPTY_SUPERVISION_REPORT,
        status: 'معتمد',
        tasks: [
          {
            id: 't1',
            category_id: 'c1',
            category_label: 'أعمال',
            description: 'عمل',
            work_type: 'تركيب',
            total_percent: 10,
            month_progress: {},
          },
        ],
      },
      report_pdf_archive: [
        {
          id: 'a1',
          kind: 'field_visit',
          visit_number: 1,
          report_date: '2026-08-13',
          title_ar: 'زيارة',
          fileName: 'v.pdf',
          sizeBytes: 1,
          mimeType: 'application/pdf',
          storageBucket: 'project-files',
          storagePath: 'p',
          dataUrl: null,
          created_at: '2026-08-13T00:00:00.000Z',
        },
      ],
    });
    expect(next.field_visits[0].findings).toBe('جديدة');
    expect(next.supervision_report.status).toBe('معتمد');
    expect(next.report_pdf_archive).toHaveLength(1);
  });
});
