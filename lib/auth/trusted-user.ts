/**
 * Load the live employee/actor row used for authorization.
 * Prefer JWT-scoped or service-role clients so RLS after 041 does not block minting.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  createServiceRoleSupabase,
  createUserScopedSupabase,
  getTrustedServerSupabase,
} from '@/lib/supabase/server';

export type TrustedUserRow = {
  id: string;
  email: string;
  full_name: string;
  role_code: string;
  company_id: string;
  is_active: boolean;
  deleted_at?: string | null;
  is_platform_admin?: boolean | null;
  auth_user_id?: string | null;
};

const USER_SELECT =
  'id, email, full_name, role_code, company_id, is_active, deleted_at, is_platform_admin, auth_user_id';

function asUser(data: unknown): TrustedUserRow | null {
  if (!data || typeof data !== 'object') return null;
  return data as TrustedUserRow;
}

async function selectUser(
  client: SupabaseClient,
  column: 'id' | 'auth_user_id' | 'email',
  value: string
): Promise<TrustedUserRow | null> {
  const { data, error } = await client
    .from('users')
    .select(USER_SELECT)
    .eq(column, column === 'email' ? value.trim().toLowerCase() : value)
    .maybeSingle();
  if (error || !data) return null;
  return asUser(data);
}

/**
 * Production path: resolve employee by auth.users id using JWT-scoped client
 * (RLS sees auth.uid()) with service-role fallback. No email identity fallback.
 */
export async function loadUserByAuthUserIdTrusted(
  authUserId: string,
  accessToken: string
): Promise<TrustedUserRow | null> {
  const scoped = createUserScopedSupabase(accessToken);
  if (scoped) {
    const row = await selectUser(scoped, 'auth_user_id', authUserId);
    if (row) return row;
  }

  const service = createServiceRoleSupabase();
  if (service) {
    return selectUser(service, 'auth_user_id', authUserId);
  }

  // Last resort only when neither JWT client nor service role is available
  // (misconfigured host) — still filter by auth_user_id, never by email.
  if (isSupabaseConfigured && !isDemoMode) {
    return selectUser(supabase, 'auth_user_id', authUserId);
  }
  return null;
}

/** Demo / local lookups by app user id. */
export async function loadUserByIdTrusted(userId: string): Promise<TrustedUserRow | null> {
  return selectUser(getTrustedServerSupabase(), 'id', userId);
}

/** Demo / local lookups by email (never used as Production Auth identity). */
export async function loadUserByEmailTrusted(email: string): Promise<TrustedUserRow | null> {
  return selectUser(getTrustedServerSupabase(), 'email', email.trim().toLowerCase());
}

export function isUserRowUsable(user: TrustedUserRow | null | undefined): user is TrustedUserRow {
  if (!user) return false;
  if (!user.is_active) return false;
  if (user.deleted_at) return false;
  return true;
}
