import { describe, expect, it } from 'vitest';
import type { AppUser } from '@/lib/auth/types';
import {
  buildEngineerAssignmentPatch,
  findEngineerById,
  getAssignableEngineers,
} from '@/lib/hr/engineer-assignments';

const engineer = (overrides: Partial<AppUser> = {}): AppUser => ({
  id: 'eng-1',
  company_id: 'company-1',
  email: 'engineer@example.com',
  full_name: 'م. مهندس حقيقي',
  username: 'real-engineer',
  role_code: 'engineer',
  is_active: true,
  ...overrides,
});

describe('real engineer assignment', () => {
  it('filters out inactive, deleted, and non-engineer users without a fake fallback', () => {
    const result = getAssignableEngineers([
      engineer(),
      engineer({ id: 'inactive', is_active: false }),
      engineer({ id: 'deleted', deleted_at: '2026-01-01T00:00:00Z' }),
      engineer({ id: 'staff', role_code: 'staff' }),
    ]);

    expect(result.map((user) => user.id)).toEqual(['eng-1']);
  });

  it('persists the real Supabase user id and display name', () => {
    expect(buildEngineerAssignmentPatch(engineer())).toEqual({
      assigned_engineer: 'م. مهندس حقيقي',
      assigned_engineer_id: 'eng-1',
    });
  });

  it('does not resolve an engineer outside the assignable roster', () => {
    expect(findEngineerById([engineer({ id: 'inactive', is_active: false })], 'inactive')).toBeNull();
  });
});
