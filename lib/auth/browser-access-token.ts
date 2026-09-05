/**
 * Browser helper: read the current Supabase access token for authenticated API calls.
 * Never log the token. Demo mode has no real JWT — returns null.
 */

'use client';

import { isDemoMode, supabase } from '@/lib/supabase';

/** Current Supabase Auth access_token, or null when unavailable / demo. */
export async function getBrowserAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (isDemoMode) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const token = data.session?.access_token?.trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Headers for authenticated Node API calls (tenant context, reingest, etc.).
 * Adds Authorization: Bearer when a session token is present.
 */
export async function withBrowserAuthHeaders(
  headers: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getBrowserAccessToken();
  if (!token) return { ...headers };
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}
