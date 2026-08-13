import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDemoSupabaseClient } from '@/lib/demo/memory-client';
import { isDemoAllowed, isStaticPagesBuild } from '@/lib/runtime/mode';

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** True when the app is running on local demo data (no Supabase credentials). */
export const isDemoMode = !isSupabaseConfigured;

export const SUPABASE_CONFIG_ERROR =
  'إعدادات Supabase غير موجودة. أضف NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY إلى ملف .env.local';

export const SUPABASE_PERSISTENCE_UNAVAILABLE = 'Supabase persistence unavailable';

/** Expected Production Supabase project ref (never log keys). */
export const EXPECTED_PRODUCTION_SUPABASE_REF = 'ezmdkwgziyencejfevso';

/**
 * Project ref from NEXT_PUBLIC_SUPABASE_URL only — never returns the anon key.
 */
export function getSupabaseProjectRef(): string | null {
  if (!supabaseUrl) return null;
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split('.')[0]?.trim();
    return ref || null;
  } catch {
    const m = supabaseUrl.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
    return m?.[1] ?? null;
  }
}

export function isExpectedProductionSupabaseProject(): boolean {
  return getSupabaseProjectRef() === EXPECTED_PRODUCTION_SUPABASE_REF;
}

/** Safe runtime diagnostics — never includes keys/secrets. */
export type SupabaseRuntimeDiagnostics = {
  runtime_mode: 'production-supabase' | 'demo-local' | 'misconfigured';
  project_ref: string | null;
  expected_project_ref: string;
  supabase_configured: boolean;
  supabase_client_initialized: boolean;
  project_ref_matches_expected: boolean;
};

export function getSupabaseRuntimeDiagnostics(): SupabaseRuntimeDiagnostics {
  const project_ref = getSupabaseProjectRef();
  const supabase_configured = isSupabaseConfigured;
  let runtime_mode: SupabaseRuntimeDiagnostics['runtime_mode'] = 'misconfigured';
  if (supabase_configured) runtime_mode = 'production-supabase';
  else if (isDemoAllowed()) runtime_mode = 'demo-local';
  return {
    runtime_mode,
    project_ref,
    expected_project_ref: EXPECTED_PRODUCTION_SUPABASE_REF,
    supabase_configured,
    supabase_client_initialized: supabase_configured,
    project_ref_matches_expected: project_ref === EXPECTED_PRODUCTION_SUPABASE_REF,
  };
}

if (
  typeof window === 'undefined' &&
  process.env.NODE_ENV === 'production' &&
  isDemoMode &&
  !isDemoAllowed()
) {
  console.error(
    '[P0] Production Node host without Supabase credentials. Set secrets or ALLOW_DEMO_MODE=true.'
  );
}

/**
 * Uses real Supabase when credentials exist; otherwise an in-memory Arabic demo dataset
 * so the site stays usable without knowing project keys (dev / Pages showcase only).
 */
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (createDemoSupabaseClient() as unknown as SupabaseClient);

/** Finance-critical ops should call this before inventing demo success. */
export function requireConfiguredSupabase(feature: string): string | null {
  if (isSupabaseConfigured) return null;
  if (isDemoAllowed() || isStaticPagesBuild()) return null;
  return `${feature}: Supabase غير مضبوط في بيئة الإنتاج.`;
}
