/**
 * Server-only Supabase clients. Never import this module from client components.
 * - User-scoped: anon key + verified JWT (RLS as that user)
 * - Service role: bypasses RLS for trusted server lookups (never expose to browser)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

function configuredUrl(): string {
  return normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
}

function anonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
}

/** True when SUPABASE_SERVICE_ROLE_KEY is set (server env only — never NEXT_PUBLIC_*). */
export function hasServiceRoleKey(): boolean {
  return Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
}

/**
 * Anon client authenticated as the given access token so auth.uid() / RLS apply.
 */
export function createUserScopedSupabase(accessToken: string): SupabaseClient | null {
  if (!isSupabaseConfigured || isDemoMode) return null;
  const url = configuredUrl();
  const key = anonKey();
  const token = accessToken.trim();
  if (!url || !key || !token) return null;

  return createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Service-role client for trusted server-side reads/writes. Returns null if unset.
 * Never call from browser code paths.
 */
export function createServiceRoleSupabase(): SupabaseClient | null {
  if (typeof window !== 'undefined') {
    throw new Error('createServiceRoleSupabase must not run in the browser');
  }
  if (!isSupabaseConfigured || isDemoMode) return null;
  const url = configuredUrl();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Prefer service role for actor revalidation; fall back to shared anon/demo client
 * (demo memory / Pages) so local flows keep working.
 */
export function getTrustedServerSupabase(): SupabaseClient {
  return createServiceRoleSupabase() || supabase;
}
