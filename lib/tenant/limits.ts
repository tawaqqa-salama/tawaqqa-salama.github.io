import { getTenant } from '@/lib/tenant/service';
import { supabase } from '@/lib/supabase';
import { tenantMemory } from '@/lib/tenant/memory';
import { isTenantMemoryMode } from '@/lib/tenant/mode';

export async function canCreateUser(companyId: string): Promise<{ ok: boolean; reason?: string }> {
  const tenant = await getTenant(companyId);
  if (!tenant) return { ok: false, reason: 'Tenant not found' };
  if (tenant.status === 'suspended') return { ok: false, reason: 'Tenant suspended' };

  let count = 0;
  if (isTenantMemoryMode()) {
    count = tenantMemory.listMemberships().filter((m) => m.company_id === companyId && m.status === 'active')
      .length;
  } else {
    const { count: c } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_active', true);
    count = c || 0;
  }
  if (count >= tenant.max_users) {
    return { ok: false, reason: `User limit reached (${tenant.max_users})` };
  }
  return { ok: true };
}

export async function canCreateProject(companyId: string): Promise<{ ok: boolean; reason?: string }> {
  const tenant = await getTenant(companyId);
  if (!tenant) return { ok: false, reason: 'Tenant not found' };
  if (tenant.status === 'suspended') return { ok: false, reason: 'Tenant suspended' };

  let count = 0;
  if (!isTenantMemoryMode()) {
    const { count: c } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);
    count = c || 0;
  }
  if (count >= tenant.max_projects) {
    return { ok: false, reason: `Project/client limit reached (${tenant.max_projects})` };
  }
  return { ok: true };
}

export async function canUploadDocument(companyId: string): Promise<{ ok: boolean; reason?: string }> {
  const tenant = await getTenant(companyId);
  if (!tenant) return { ok: false, reason: 'Tenant not found' };
  if (tenant.status === 'suspended') return { ok: false, reason: 'Tenant suspended' };
  return { ok: true };
}

export function tenantStoragePrefix(companyId: string) {
  return `${companyId}/documents`;
}
