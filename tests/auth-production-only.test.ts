import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPasswordMock = vi.fn();
const fromMock = vi.fn();
const saveSessionMock = vi.fn();
const clearSessionMock = vi.fn();
const loadSessionMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPasswordMock(...args),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn(),
    },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('@/lib/auth/session', () => ({
  clearSession: (...args: unknown[]) => clearSessionMock(...args),
  loadSession: (...args: unknown[]) => loadSessionMock(...args),
  saveSession: (...args: unknown[]) => saveSessionMock(...args),
}));

vi.mock('@/lib/auth/permissions', () => ({
  resolveUserPermissions: () => [],
}));

import { restoreAuthSession, signInWithEmailPassword } from '@/lib/auth/service';

const profile = {
  id: 'profile-1',
  auth_user_id: 'auth-1',
  email: 'employee@example.com',
  full_name: 'Employee',
  username: 'employee',
  role_code: 'sales',
  company_id: 'company-a',
  phone: '0500000000',
  is_active: true,
  deleted_at: null,
};

function query(data: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const eq = vi.fn(() => ({ eq, maybeSingle }));
  const select = vi.fn(() => ({ eq, maybeSingle }));
  const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }));
  return { select, update };
}

describe('production authentication hardening', () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
    fromMock.mockReset();
    saveSessionMock.mockReset();
    clearSessionMock.mockReset();
    loadSessionMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a failed Supabase password authentication failed without consulting demo or legacy credentials', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    const result = await signInWithEmailPassword('employee@example.com', 'wrong-password');

    expect(result.session).toBeNull();
    expect(result.error).toBe('بيانات الدخول غير صحيحة');
    expect(fromMock).not.toHaveBeenCalled();
    expect(saveSessionMock).not.toHaveBeenCalled();
  });

  it('builds a session only from the authenticated identity mapped through users.auth_user_id', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: { id: 'auth-1' } },
      error: null,
    });
    fromMock.mockImplementation((table: string) => {
      if (table === 'users') return query(profile);
      if (table === 'roles') return query({ code: 'sales', company_id: 'company-a', permissions: [] });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await signInWithEmailPassword('employee@example.com', 'correct-password');

    expect(result.error).toBeNull();
    expect(result.session).toMatchObject({
      userId: 'profile-1',
      companyId: 'company-a',
      method: 'email',
    });
    expect(saveSessionMock).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-a' }), 'company-a');
  });

  it('clears a restored local session when the mapped user is soft-deleted', async () => {
    loadSessionMock.mockReturnValue({
      userId: 'profile-1',
      companyId: 'company-a',
      method: 'email',
    });
    fromMock.mockImplementation((table: string) => {
      if (table === 'users') return query({ ...profile, deleted_at: '2026-08-18T00:00:00.000Z' });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await restoreAuthSession();

    expect(result).toEqual({ session: null, error: null });
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
    expect(saveSessionMock).not.toHaveBeenCalled();
  });
});
