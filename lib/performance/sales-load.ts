export type SalesLoadStage =
  | 'route-mounted'
  | 'auth-company-ready'
  | 'first-request-begin'
  | 'clients-loaded'
  | 'quotations-loaded'
  | 'contracts-invoices-loaded'
  | 'detail-data-deferred'
  | 'local-overrides-merged'
  | 'derived-lists-ready'
  | 'first-usable-table'
  | 'fully-interactive';

export type SalesLoadMetric = {
  stage: SalesLoadStage;
  elapsedMs: number;
  timestamp: string;
};

const SALES_PERF_KEY = '__tawaqqaSalesPerf';

type SalesPerfState = {
  startedAt: number;
  metrics: SalesLoadMetric[];
};

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function getState(): SalesPerfState | null {
  if (typeof window === 'undefined') return null;
  const existing = (window as Window & { [SALES_PERF_KEY]?: SalesPerfState })[SALES_PERF_KEY];
  if (existing) return existing;
  const state: SalesPerfState = { startedAt: now(), metrics: [] };
  (window as Window & { [SALES_PERF_KEY]?: SalesPerfState })[SALES_PERF_KEY] = state;
  return state;
}

export function markSalesLoadStage(stage: SalesLoadStage): SalesLoadMetric | null {
  const state = getState();
  if (!state) return null;
  const metric: SalesLoadMetric = {
    stage,
    elapsedMs: Math.max(0, Math.round(now() - state.startedAt)),
    timestamp: new Date().toISOString(),
  };
  const existingIndex = state.metrics.findIndex((item) => item.stage === stage);
  if (existingIndex >= 0) state.metrics[existingIndex] = metric;
  else state.metrics.push(metric);
  window.dispatchEvent(new CustomEvent('tawaqqa:sales-load-stage', { detail: metric }));
  return metric;
}

export function getSalesLoadMetrics(): SalesLoadMetric[] {
  return getState()?.metrics.slice() || [];
}

export function resetSalesLoadMetrics(): void {
  if (typeof window === 'undefined') return;
  delete (window as Window & { [SALES_PERF_KEY]?: SalesPerfState })[SALES_PERF_KEY];
}
