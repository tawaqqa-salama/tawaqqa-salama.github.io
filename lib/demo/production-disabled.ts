/**
 * Production build substitute for the local in-memory demo client.
 *
 * Next.js aliases the demo module to this file in production builds. The caller
 * should never reach this function because isDemoMode is false in production;
 * throwing here guarantees a fail-closed result if that invariant regresses.
 */
export function createDemoSupabaseClient(): never {
  throw new Error('Local demo data is unavailable in production builds.');
}
