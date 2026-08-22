import type { AppUser } from '@/lib/auth/types';

export type EngineerAssignmentPatch = {
  assigned_engineer: string | null;
  assigned_engineer_id: string | null;
};

/**
 * Returns only active, non-deleted users whose actual system role is engineer.
 * No display-name fallback or hard-coded roster is used here.
 */
export function getAssignableEngineers(users: AppUser[]): AppUser[] {
  return users.filter(
    (user) => user.is_active && !user.deleted_at && user.role_code === 'engineer',
  );
}

/**
 * Keeps the stable Supabase user id and the current display name together.
 * The name is retained for existing report compatibility, while the id is
 * the authoritative reference for future lookups.
 */
export function buildEngineerAssignmentPatch(engineer: AppUser | null): EngineerAssignmentPatch {
  if (!engineer) {
    return { assigned_engineer: null, assigned_engineer_id: null };
  }

  return {
    assigned_engineer: engineer.full_name || engineer.email,
    assigned_engineer_id: engineer.id,
  };
}

export function findEngineerById(users: AppUser[], id: string | null | undefined): AppUser | null {
  if (!id) return null;
  return getAssignableEngineers(users).find((user) => user.id === id) || null;
}
