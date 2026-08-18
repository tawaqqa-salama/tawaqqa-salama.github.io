type PageLoadMark = 'auth-ready' | 'page-data-start' | 'page-data-ready' | 'first-usable';

function isMeasurementEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    const queryEnabled = new URLSearchParams(window.location.search).get('performance') === '1';
    const localEnabled = window.localStorage.getItem('tawaqqa_performance_measurement') === '1';
    return queryEnabled || localEnabled;
  } catch {
    return false;
  }
}

/**
 * Emits no network traffic and contains no route, tenant, or customer identifier.
 * Production marks are opt-in for controlled measurement only.
 */
export function markPageLoad(name: PageLoadMark): void {
  if (!isMeasurementEnabled() || typeof performance === 'undefined') return;
  try {
    performance.mark(`tawaqqa:${name}`);
  } catch {
    // Browser support must never affect the page lifecycle.
  }
}
