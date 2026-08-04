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
