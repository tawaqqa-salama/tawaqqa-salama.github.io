/**
 * Production / demo mode guards (P0).
 */

export function isStaticPagesBuild(): boolean {
  return (
    process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true' ||
    process.env.USER_PAGES === 'true' ||
    process.env.GITHUB_PAGES === 'true' ||
    process.env.NEXT_PUBLIC_USER_PAGES === 'true' ||
    process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true'
  );
}

/**
 * Client-side: /api Route Handlers are absent on static GitHub Pages exports.
 * Prefer this before calling /api/* from the browser.
 */
export function areApiRoutesAvailable(): boolean {
  if (isStaticPagesBuild()) return false;
  // Runtime hint when env was not inlined but host is known Pages
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('.github.io')) return false;
  }
  return true;
}

/**
 * Demo data is a local-development aid only. It must never be enabled in a
 * production build, including a GitHub Pages static export.
 */
export function isDemoAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Critical finance / ZATCA ops must not silently invent data in production Node hosts.
 */
export function assertLiveOrDemoAllowed(feature: string): { ok: true } | { ok: false; error: string } {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (configured) return { ok: true };
  if (isDemoAllowed()) return { ok: true };
  return {
    ok: false,
    error: `${feature}: يتطلب Supabase في بيئة الإنتاج. اضبط المفاتيح أو ALLOW_DEMO_MODE=true للعرض فقط.`,
  };
}

export function isZatcaServerOnly(): boolean {
  return (
    process.env.ZATCA_SERVER_ONLY === 'true' ||
    process.env.NEXT_PUBLIC_ZATCA_SERVER_ONLY === 'true' ||
    (process.env.NODE_ENV === 'production' && !isStaticPagesBuild())
  );
}
