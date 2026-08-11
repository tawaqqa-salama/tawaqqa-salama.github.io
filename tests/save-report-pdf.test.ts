import { describe, expect, it, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();
const storageFromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isDemoMode: true,
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    storage: { from: (...args: unknown[]) => storageFromMock(...args) },
  },
}));

vi.mock('@/lib/supabase/safe-client-write', () => ({
  backupEngineeringDataLocally: vi.fn(),
}));

vi.mock('@/lib/print/html-to-pdf', () => ({
  htmlDocumentToPdfFile: vi.fn(async (_html: string, fileName: string) => {
    return new File([new Uint8Array([37, 80, 68, 70])], fileName, { type: 'application/pdf' });
  }),
}));

vi.mock('@/lib/projects/save-supervision-report', async () => {
  const actual = await vi.importActual<typeof import('@/lib/projects/save-supervision-report')>(
    '@/lib/projects/save-supervision-report'
  );
  return {
    ...actual,
    upsertProjectReport: vi.fn(async () => ({ reportId: 'r1', error: null, skipped: true })),
  };
});

import { saveFieldVisitAsPdfAttachment } from '@/lib/projects/save-report-pdf';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

describe('saveFieldVisitAsPdfAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  it('appends a PDF snapshot per visit without replacing other visits', async () => {
    const client = {
      id: 'c1',
      client_code: 'V-01',
      name: 'مشروع',
      business_name: 'مشروع متعدد الزيارات',
    } as ClientRecord;

    const data = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      field_visits: [
        {
          visit_number: 1,
          status: 'مسودة' as const,
          visit_date: '2026-08-01',
          engineer_name: 'م. أحمد',
          findings: 'ملاحظات الزيارة 1',
          pdf_snapshots: [],
        },
        {
          visit_number: 2,
          status: 'مسودة' as const,
          visit_date: '2026-08-10',
          engineer_name: 'م. أحمد',
          findings: 'ملاحظات الزيارة 2',
          pdf_snapshots: [],
        },
      ],
      report_pdf_archive: [],
    };

    const first = await saveFieldVisitAsPdfAttachment({
      client,
      data,
      visitNumber: 1,
    });
    expect(first.error).toBeNull();
    expect(first.snapshot?.visit_number).toBe(1);
    expect(first.data.field_visits[0].latest_pdf?.kind).toBe('field_visit');
    expect(first.data.field_visits[1].pdf_snapshots || []).toHaveLength(0);
    expect(first.data.report_pdf_archive || []).toHaveLength(1);

    const second = await saveFieldVisitAsPdfAttachment({
      client,
      data: first.data,
      visitNumber: 2,
    });
    expect(second.error).toBeNull();
    expect(second.snapshot?.visit_number).toBe(2);
    expect(second.data.field_visits[0].pdf_snapshots || []).toHaveLength(1);
    expect(second.data.field_visits[1].pdf_snapshots || []).toHaveLength(1);
    expect(second.data.report_pdf_archive || []).toHaveLength(2);
    expect(rpcMock).toHaveBeenCalledWith(
      'save_project_engineering_live',
      expect.objectContaining({ p_client_id: 'c1' })
    );
  });
});
