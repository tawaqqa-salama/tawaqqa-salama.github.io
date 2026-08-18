import type { tenantMemory as LocalTenantMemory } from '@/lib/tenant/memory';

/**
 * Production build substitute for the local tenant-memory store.
 *
 * The runtime guard never selects this object in production. Keeping a typed
 * fail-closed proxy here prevents local tenant seeds from entering the bundle
 * while preserving type compatibility for code that supports local demos.
 */
const unavailable = (): never => {
  throw new Error('Local tenant demo data is unavailable in production builds.');
};

export const tenantMemory = new Proxy({}, { get: () => unavailable }) as typeof LocalTenantMemory;
