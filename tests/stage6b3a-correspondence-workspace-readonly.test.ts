import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  buildLegacyStage6DocumentSummaries,
  loadReadOnlyCorrespondenceWorkspace,
  RELATIONAL_CORRESPONDENCE_STATUS_LABELS,
} from '@/lib/projects/read-only-correspondence-workspace';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function correspondenceQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValueOnce(query).mockResolvedValueOnce(result);
  return query;
}

const identity = {
  clientId: 'client-6b3a',
  projectId: 'project-6b3a',
  projectCode: 'PRJ-2026-000091',
};

describe('Stage 6B-3A read-only correspondence workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a controlled unavailable state without querying when canonical identity is absent or mismatched', async () => {
    await expect(loadReadOnlyCorrespondenceWorkspace('client-6b3a', null)).resolves.toEqual({
      kind: 'identity-unavailable',
      records: [],
    });
    await expect(loadReadOnlyCorrespondenceWorkspace('client-6b3a', { ...identity, clientId: 'another-client' })).resolves.toEqual({
      kind: 'identity-unavailable',
      records: [],
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('queries only the canonical project/client pair and treats zero visible rows as normal', async () => {
    const query = correspondenceQuery({ data: [], error: null });
    fromMock.mockReturnValueOnce(query);

    await expect(loadReadOnlyCorrespondenceWorkspace(identity.clientId, identity)).resolves.toEqual({
      kind: 'ready',
      records: [],
    });

    expect(fromMock).toHaveBeenCalledWith('project_correspondences');
    expect(query.select).toHaveBeenCalledWith(
      'correspondence_type, document_status, subject, reference_number, correspondence_date, recipient_name, responsible_engineer_name, responsible_manager_name, approved_at, updated_at'
    );
    expect(query.eq).toHaveBeenCalledWith('project_id', identity.projectId);
    expect(query.eq).toHaveBeenCalledWith('client_id', identity.clientId);
    expect(query.order).toHaveBeenNthCalledWith(1, 'correspondence_date', { ascending: false, nullsFirst: false });
    expect(query.order).toHaveBeenNthCalledWith(2, 'updated_at', { ascending: false, nullsFirst: false });
  });

  it('normalizes several display-safe records and all permitted relational lifecycle statuses', async () => {
    const query = correspondenceQuery({
      data: [
        {
          correspondence_type: 'engineering_delivery',
          document_status: 'draft',
          subject: 'خطاب تسليم أولي',
          reference_number: 'OUT-1',
          correspondence_date: '2026-08-01',
          recipient_name: 'الجهة الأولى',
          responsible_engineer_name: 'مهندس أ',
          responsible_manager_name: 'مدير أ',
          approved_at: null,
          updated_at: '2026-08-01T08:00:00Z',
        },
        {
          correspondence_type: 'cd_cover_letter',
          document_status: 'preparing',
          subject: 'خطاب تغطية',
          reference_number: 'OUT-2',
          correspondence_date: '2026-08-02',
          recipient_name: 'الدفاع المدني',
          responsible_engineer_name: 'مهندس ب',
          responsible_manager_name: 'مدير ب',
          approved_at: null,
          updated_at: '2026-08-02T08:00:00Z',
        },
        {
          correspondence_type: 'engineering_delivery',
          document_status: 'ready',
          subject: 'خطاب جاهز',
          reference_number: null,
          correspondence_date: '2026-08-03',
          recipient_name: null,
          responsible_engineer_name: null,
          responsible_manager_name: null,
          approved_at: null,
          updated_at: '2026-08-03T08:00:00Z',
        },
        {
          correspondence_type: 'cd_cover_letter',
          document_status: 'approved',
          subject: 'خطاب معتمد',
          reference_number: 'OUT-4',
          correspondence_date: '2026-08-04',
          recipient_name: 'الدفاع المدني',
          responsible_engineer_name: 'مهندس ج',
          responsible_manager_name: 'مدير ج',
          approved_at: '2026-08-04T09:00:00Z',
          updated_at: '2026-08-04T09:30:00Z',
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(query);

    const result = await loadReadOnlyCorrespondenceWorkspace(identity.clientId, identity);

    expect(result.kind).toBe('ready');
    expect(result.records).toHaveLength(4);
    expect(result.records.map((record) => record.documentStatus)).toEqual(['draft', 'preparing', 'ready', 'approved']);
    expect(RELATIONAL_CORRESPONDENCE_STATUS_LABELS).toEqual({
      draft: 'مسودة',
      preparing: 'قيد الإعداد',
      ready: 'جاهز للاعتماد',
      approved: 'معتمد',
    });
    expect(result.records[0]).not.toHaveProperty('projectId');
    expect(result.records[0]).not.toHaveProperty('clientId');
    expect(result.records[0]).not.toHaveProperty('lockVersion');
  });

  it('fails closed to a controlled read error when RLS or network read is unavailable', async () => {
    const query = correspondenceQuery({ data: null, error: { code: '42501' } });
    fromMock.mockReturnValueOnce(query);
    await expect(loadReadOnlyCorrespondenceWorkspace(identity.clientId, identity)).resolves.toEqual({
      kind: 'load-error',
      records: [],
    });

    fromMock.mockImplementationOnce(() => {
      throw new Error('offline');
    });
    await expect(loadReadOnlyCorrespondenceWorkspace(identity.clientId, identity)).resolves.toEqual({
      kind: 'load-error',
      records: [],
    });
  });

  it('derives model summaries from the existing Stage 6 contract without synthesizing relational records', () => {
    const summaries = buildLegacyStage6DocumentSummaries({
      engineering_delivery: {
        status: 'معتمد',
        delivery_date: '2026-08-01',
        delivered_to: 'جهة التسليم',
        outgoing_number: 'ED-001',
        safety_engineer_name: 'م. سلامة',
        manager_name: 'مدير المكتب',
      },
      cd_cover_letter: {
        status: 'مسودة',
        letter_date: '2026-08-01',
        addressee: '',
        outgoing_number: 'CD-001',
        safety_engineer_name: '',
        manager_name: '',
      },
    } as never);

    expect(summaries).toEqual([
      expect.objectContaining({
        key: 'engineering_delivery',
        provenanceLabel: 'النموذج الحالي',
        available: true,
        complete: true,
        referenceNumber: 'ED-001',
      }),
      expect.objectContaining({
        key: 'cd_cover_letter',
        provenanceLabel: 'النموذج الحالي',
        available: true,
        complete: false,
        referenceNumber: 'CD-001',
      }),
    ]);

    const missing = buildLegacyStage6DocumentSummaries({
      engineering_delivery: null,
      cd_cover_letter: null,
    } as never);
    expect(missing.map((summary) => [summary.available, summary.complete])).toEqual([
      [false, false],
      [false, false],
    ]);
  });

  it('keeps the UI provenance-separated, filters in memory only, and exposes no correspondence mutation action', () => {
    const component = read('components/projects/ReadOnlyCorrespondenceWorkspace.tsx');
    expect(component).toContain('النموذج الحالي');
    expect(component).toContain('سجل المراسلات الجديد');
    expect(component).toContain('لا توجد مراسلات مسجلة في مساحة المراسلات الجديدة حتى الآن.');
    expect(component).toContain('typeFilter');
    expect(component).toContain('statusFilter');
    expect(component).toContain('dateFilter');
    expect(component).toContain('setQuery');
    expect(component).not.toContain('record.body');
    expect(component).not.toContain('onSave');
    expect(component).not.toContain('<button');
    expect(component).toContain('grid-cols-1 gap-3 sm:grid-cols-3');
    expect(component).toContain('sm:grid-cols-2 lg:grid-cols-4');
    expect(component).toContain('sm:grid-cols-2 lg:grid-cols-3');
    expect(component).toContain('break-words');
    expect(component).toContain('record.correspondenceDate ? displayDate(record.correspondenceDate) : null');
    expect(component).toContain('record.approvedAt ? displayDate(record.approvedAt) : null');
    expect(component).not.toContain('overflow-x');
  });

  it('contains no DML, mutation RPC, creation resolver, legacy save call, or Stage 7 cutover', () => {
    const loader = read('lib/projects/read-only-correspondence-workspace.ts');
    const component = read('components/projects/ReadOnlyCorrespondenceWorkspace.tsx');
    const modal = read('components/projects/ProjectReportModal.tsx');
    const stage6Gate = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
    const stage6Schema = read('scripts/sql/056_stage6b_project_correspondences_schema.sql');
    const stage6Rpcs = read('scripts/sql/057_stage6b_correspondence_persistence_rpcs.sql');

    for (const source of [loader, component]) {
      expect(source).not.toMatch(/\.rpc\s*\(/);
      expect(source).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
      expect(source).not.toContain('ensure_or_resolve_engineering_project_for_client');
      expect(source).not.toContain('saveReportData');
      expect(source).not.toContain('transitionProjectEngineeringStage');
    }
    expect(modal.indexOf('<ReadOnlyCorrespondenceWorkspace')).toBeLessThan(modal.indexOf('<EngineeringDeliverySection'));
    expect(stage6Gate).toContain("v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')");
    expect(stage6Schema).toContain('FOREIGN KEY (project_id, client_id)');
    expect(stage6Rpcs).toContain('CREATE OR REPLACE FUNCTION public.create_project_correspondence_draft(');
  });
});
