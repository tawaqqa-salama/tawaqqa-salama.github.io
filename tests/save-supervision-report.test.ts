import { describe, expect, it, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn();
const selectMock = vi.fn();
const maybeSingleMock = vi.fn();
const deleteMock = vi.fn();
const eqMock = vi.fn();
const inMock = vi.fn();
const rpcMock = vi.fn();
const updateMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock('@/lib/supabase/safe-client-write', () => ({
  backupEngineeringDataLocally: vi.fn(),
}));

import { upsertProjectReport } from '@/lib/projects/save-supervision-report';
import { EMPTY_SUPERVISION_REPORT } from '@/lib/types/project-reports';
import { DEFAULT_SUPERVISION_MONTHS, buildDefaultSupervisionTasks } from '@/lib/projects/supervision-report';

describe('upsertProjectReport batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const itemsChain = {
      upsert: upsertMock,
      delete: deleteMock,
      select: selectMock,
      eq: eqMock,
      in: inMock,
    };

    maybeSingleMock.mockResolvedValue({ data: { id: 'report-1' }, error: null });
    selectMock.mockReturnValue({ eq: eqMock });
    eqMock.mockImplementation(() => ({
      maybeSingle: maybeSingleMock,
      not: vi.fn(),
      in: inMock,
      then: undefined,
    }));
    // select('id').eq(report_id) resolves to existing rows
    eqMock.mockReturnValue({
      maybeSingle: maybeSingleMock,
      in: inMock,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    });

    upsertMock.mockImplementation(() => ({
      select: () => ({
        maybeSingle: maybeSingleMock,
      }),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    }));

    // First from() = header upsert; second = items upsert; third = select orphans
    let call = 0;
    fromMock.mockImplementation((table: string) => {
      call += 1;
      if (table === 'project_supervision_reports') {
        return {
          upsert: () => ({
            select: () => ({
              maybeSingle: maybeSingleMock,
            }),
          }),
        };
      }
      return {
        upsert: (...args: unknown[]) => {
          upsertMock(...args);
          return Promise.resolve({ error: null });
        },
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
        delete: () => ({
          eq: () => ({
            in: () => Promise.resolve({ error: null }),
          }),
        }),
      };
    });
  });

  it('upserts all progress items in one batch call', async () => {
    const months = DEFAULT_SUPERVISION_MONTHS;
    const tasks = buildDefaultSupervisionTasks(months);
    expect(tasks.length).toBeGreaterThanOrEqual(19);

    const result = await upsertProjectReport('client-1', {
      ...EMPTY_SUPERVISION_REPORT,
      months,
      tasks,
      contractor_name: 'شركة ابو نور',
    });

    expect(result.error).toBeNull();
    expect(result.reportId).toBe('report-1');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsertMock.mock.calls[0];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(tasks.length);
    expect(opts).toEqual({ onConflict: 'report_id,id' });
  });
});
