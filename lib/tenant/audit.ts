import { supabase } from '@/lib/supabase';
import { tenantMemory } from '@/lib/tenant/memory';
import { isTenantMemoryMode } from '@/lib/tenant/mode';

export type SaasAuditInput = {
  actor_user_id?: string | null;
  company_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
  ip_address?: string | null;
};

export async function writeSaasAudit(input: SaasAuditInput) {
  if (isTenantMemoryMode()) {
    tenantMemory.audit({
      actor_user_id: input.actor_user_id,
      company_id: input.company_id,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      metadata: input.metadata || {},
      ip_address: input.ip_address,
    });
    return;
  }
  await supabase.from('saas_audit_logs').insert({
    actor_user_id: input.actor_user_id || null,
    company_id: input.company_id || null,
    action: input.action,
    entity_type: input.entity_type || null,
    entity_id: input.entity_id || null,
    metadata: input.metadata || {},
    ip_address: input.ip_address || null,
  });
}

export async function listSaasAudit(opts?: { companyId?: string; limit?: number }) {
  if (isTenantMemoryMode()) {
    return tenantMemory.listAudit(opts?.companyId).slice(0, opts?.limit || 100);
  }
  let q = supabase
    .from('saas_audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit || 100);
  if (opts?.companyId) q = q.eq('company_id', opts.companyId);
  const { data } = await q;
  return data || [];
}
