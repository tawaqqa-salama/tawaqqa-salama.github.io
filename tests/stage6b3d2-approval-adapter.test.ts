import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from, rpc },
}));

import {
  approveStage6DocumentsAndTransition,
  stage6ApprovalErrorMessage,
} from '@/lib/projects/stage6-approval-orchestration';

const identity = {
  clientId: 'client-1',
  projectId: 'project-1',
  projectCode: 'PRJ-2026-000001',
};

function liveRead(updatedAt = '2026-08-23T10:00:00.000Z', error: unknown = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: error ? null : { updated_at: updatedAt }, error })),
      })),
    })),
  };
}

function correspondenceRead(rows: Array<{ correspondence_type: string; lock_version: number }>, error: unknown = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(async () => ({ data: error ? null : rows, error })),
          })),
        })),
      })),
    })),
  };
}

function configureReads(params: {
  updatedAt?: string;
  rows?: Array<{ correspondence_type: string; lock_version: number }>;
  liveError?: unknown;
  correspondenceError?: unknown;
}) {
  from.mockImplementation((table: string) => {
    if (table === 'project_engineering_live') return liveRead(params.updatedAt, params.liveError);
    if (table === 'project_correspondences') return correspondenceRead(params.rows || [], params.correspondenceError);
    throw new Error(`Unexpected read table: ${table}`);
  });
}

describe('Stage 6B-3D2 approval adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({
      data: {
        ok: true,
        target_stage: 'final_report',
        engineering_delivery_lock_version: 0,
        cd_cover_letter_lock_version: 0,
        approved_at: '2026-08-23T10:01:00.000Z',
      },
      error: null,
    });
  });

  it('blocks unavailable canonical identity before reads or mutation', async () => {
    const result = await approveStage6DocumentsAndTransition({ clientId: 'client-1', identity: null });
    expect(result).toEqual({ ok: false, code: 'IDENTITY_UNAVAILABLE' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('approves a valid zero-row state with exact null sentinels and one 061 RPC', async () => {
    configureReads({ rows: [] });
    const result = await approveStage6DocumentsAndTransition({ clientId: 'client-1', identity });

    expect(result).toMatchObject({ ok: true, engineeringDeliveryLockVersion: 0, cdCoverLetterLockVersion: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('approve_stage6_documents_and_transition', {
      p_client_id: 'client-1',
      p_project_id: 'project-1',
      p_expected_canonical_updated_at: '2026-08-23T10:00:00.000Z',
      p_expected_engineering_delivery_lock_version: null,
      p_expected_cd_cover_letter_lock_version: null,
    });
  });

  it('supports one missing projection by passing the existing exact lock and null only for the missing row', async () => {
    configureReads({ rows: [{ correspondence_type: 'engineering_delivery', lock_version: 4 }] });
    const result = await approveStage6DocumentsAndTransition({ clientId: 'client-1', identity });

    expect(result).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith('approve_stage6_documents_and_transition', expect.objectContaining({
      p_expected_engineering_delivery_lock_version: 4,
      p_expected_cd_cover_letter_lock_version: null,
    }));
  });

  it('passes both exact outgoing lock versions when both ready projections exist', async () => {
    configureReads({
      rows: [
        { correspondence_type: 'engineering_delivery', lock_version: 7 },
        { correspondence_type: 'cd_cover_letter', lock_version: 12 },
      ],
    });
    const result = await approveStage6DocumentsAndTransition({ clientId: 'client-1', identity });

    expect(result).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith('approve_stage6_documents_and_transition', expect.objectContaining({
      p_expected_engineering_delivery_lock_version: 7,
      p_expected_cd_cover_letter_lock_version: 12,
    }));
  });

  it('fails closed for duplicate singleton rows before the mutation', async () => {
    configureReads({
      rows: [
        { correspondence_type: 'engineering_delivery', lock_version: 1 },
        { correspondence_type: 'engineering_delivery', lock_version: 2 },
      ],
    });
    const result = await approveStage6DocumentsAndTransition({ clientId: 'client-1', identity });

    expect(result).toEqual({ ok: false, code: 'CORRESPONDENCE_SINGLETON_CONFLICT' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the canonical revision cannot be read and never fabricates a client timestamp', async () => {
    configureReads({ liveError: { message: 'network unavailable' } });
    const result = await approveStage6DocumentsAndTransition({ clientId: 'client-1', identity });

    expect(result).toEqual({ ok: false, code: 'NETWORK_OR_RPC_FAILURE' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps server stale, workflow, divergence, and permission errors without retries or another mutation', async () => {
    configureReads({ rows: [] });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'CANONICAL_STALE_REVISION' } });
    const stale = await approveStage6DocumentsAndTransition({ clientId: 'client-1', identity });
    expect(stale).toEqual({ ok: false, code: 'CANONICAL_STALE_REVISION' });
    expect(rpc).toHaveBeenCalledTimes(1);

    expect(stage6ApprovalErrorMessage('WORKFLOW_STATE_CONFLICT')).toContain('Workflow');
    expect(stage6ApprovalErrorMessage('CORRESPONDENCE_STATE_DIVERGENCE')).toContain('مسؤول النظام');
    expect(stage6ApprovalErrorMessage('PROJECT_PERMISSION_DENIED')).toContain('صلاحية');
  });
});
