/**
 * Helpers to scope Supabase queries by tenant (company_id).
 * Prefer these over unscoped findMany for tenant-owned tables.
 */

export function withTenantId<T extends Record<string, unknown>>(
  companyId: string,
  row: T
): T & { company_id: string } {
  return { ...row, company_id: companyId };
}

export function assertSameTenant(
  companyId: string,
  rowCompanyId: string | null | undefined
): boolean {
  return Boolean(rowCompanyId && rowCompanyId === companyId);
}
