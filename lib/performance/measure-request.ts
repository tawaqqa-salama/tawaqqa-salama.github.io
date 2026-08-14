export type CacheStatus = 'hit' | 'miss' | 'bypass';

export type PerformanceMetric = {
  name: string;
  durationMs: number;
  success: boolean;
  cacheStatus?: CacheStatus;
  route?: string;
  timestamp: string;
};

export type MeasureRequestOptions = {
  cacheStatus?: CacheStatus;
  route?: string;
};

type MetricListener = (metric: PerformanceMetric) => void;

const MAX_METRICS = 100;
const recentMetrics: PerformanceMetric[] = [];
const listeners = new Set<MetricListener>();

export function recordPerformanceMetric(metric: PerformanceMetric): void {
  recentMetrics.push(metric);
  if (recentMetrics.length > MAX_METRICS) recentMetrics.shift();

  for (const listener of listeners) listener(metric);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tawaqqa:performance-metric', { detail: metric }));
  }
}

export function getRecentPerformanceMetrics(): PerformanceMetric[] {
  return [...recentMetrics];
}

export function subscribePerformanceMetrics(listener: MetricListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function measureRequest<T>(
  name: string,
  request: PromiseLike<T>,
  options: MeasureRequestOptions = {}
): Promise<T> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const result = await request;
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordPerformanceMetric({
      name,
      durationMs: Math.max(0, Math.round(endedAt - startedAt)),
      success: true,
      cacheStatus: options.cacheStatus,
      route: options.route,
      timestamp: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordPerformanceMetric({
      name,
      durationMs: Math.max(0, Math.round(endedAt - startedAt)),
      success: false,
      cacheStatus: options.cacheStatus,
      route: options.route,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
