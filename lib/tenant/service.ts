import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { tenantMemory } from '@/lib/tenant/memory';
import { isTenantMemoryMode } from '@/lib/tenant/mode';
import type {
  PlatformModuleCode,
  SaasPlan,
  TenantMembership,
  TenantRecord,
} from '@/lib/tenant/types';
import { writeSaasAudit } from '@/lib/tenant/audit';

function mapCompany(row: Record<string, unknown>): TenantRecord {
  return {
    id: String(row.id),
    code: String(row.code),
    slug: (row.slug as string) || null,
    name: String(row.name),
    legal_name: (row.legal_name as string) || null,
    logo_url: (row.logo_url as string) || null,
    favicon_url: (row.favicon_url as string) || null,
    country: (row.country as string) || null,
    city: (row.city as string) || null,
    address: (row.address as string) || null,
    phone: (row.phone as string) || null,
    email: (row.email as string) || null,
    website: (row.website as string) || null,
    default_language: ((row.default_language as string) || 'ar') as TenantRecord['default_language'],
    secondary_language: (row.secondary_language as TenantRecord['secondary_language']) || null,
    default_currency: (row.default_currency as string) || 'SAR',
    timezone: (row.timezone as string) || 'Asia/Riyadh',
    date_format: (row.date_format as string) || 'dd/MM/yyyy',
    number_format: (row.number_format as string) || 'ar-SA',
    industry: (row.industry as string) || 'safety_engineering',
    brand_primary: (row.brand_primary as string) || null,
    brand_secondary: (row.brand_secondary as string) || null,
    tax_settings: (row.tax_settings as Record<string, unknown>) || {},
    status: ((row.status as string) || 'active') as TenantRecord['status'],
    subscription_plan: (row.subscription_plan as string) || null,
    subscription_status: ((row.subscription_status as string) || 'active') as TenantRecord['subscription_status'],
    subscription_start: (row.subscription_start as string) || null,
    subscription_end: (row.subscription_end as string) || null,
    max_users: Number(row.max_users ?? 25),
    max_projects: Number(row.max_projects ?? 500),
    max_storage_mb: Number(row.max_storage_mb ?? 5120),
    max_documents: Number(row.max_documents ?? 10000),
    is_active: row.is_active !== false,
  };
}

export async function listTenants(): Promise<TenantRecord[]> {
  if (isTenantMemoryMode()) return tenantMemory.listTenants();
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => mapCompany(r as Record<string, unknown>));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Raised when companies lookup fails (RLS / network) — not the same as missing/inactive. */
export class TenantLookupError extends Error {
  status: number;
  reason: 'query_failed' | 'client_required';
  constructor(message: string, reason: 'query_failed' | 'client_required', status = 503) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

export type GetTenantOptions = {
  /**
   * When true (authenticated Node API with Bearer JWT), refuse the shared anon
   * fallback — RLS on companies requires a user-scoped client.
   */
  requireClient?: boolean;
};

/**
 * Load a company/tenant row.
 * Pass a user-scoped Supabase client on authenticated Node paths so RLS sees auth.uid().
 * Query/RLS failures throw TenantLookupError — they are NOT treated as inactive.
 */
export async function getTenant(
  idOrSlug: string,
  client?: SupabaseClient | null,
  opts?: GetTenantOptions
): Promise<TenantRecord | null> {
  if (isTenantMemoryMode()) return tenantMemory.getTenant(idOrSlug);

  if (opts?.requireClient && !client) {
    throw new TenantLookupError(
      'User-scoped Supabase client required for tenant lookup',
      'client_required',
      503
    );
  }

  const db = client || supabase;
  const key = String(idOrSlug || '').trim();
  if (!key) return null;

  let query = db.from('companies').select('*').is('deleted_at', null);

  // Prefer exact id match for actor company_id (UUID) — avoids fragile .or() filters.
  if (UUID_RE.test(key)) {
    query = query.eq('id', key);
  } else {
    query = query.or(`id.eq.${key},slug.eq.${key},code.eq.${key}`);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw new TenantLookupError(
      `Tenant lookup failed: ${error.message}`,
      'query_failed',
      503
    );
  }

  if (!data) return null;
  return mapCompany(data as Record<string, unknown>);
}

export async function updateTenant(
  id: string,
  patch: Partial<TenantRecord>,
  actorUserId?: string
): Promise<TenantRecord> {
  if (isTenantMemoryMode()) {
    const existing = tenantMemory.getTenant(id);
    if (!existing) throw new Error('Tenant not found');
    const next = { ...existing, ...patch, id: existing.id };
    tenantMemory.saveTenant(next);
    tenantMemory.audit({
      action: 'TENANT_UPDATED',
      company_id: id,
      actor_user_id: actorUserId,
      metadata: patch,
    });
    return next;
  }
  const { data, error } = await supabase
    .from('companies')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'update failed');
  await writeSaasAudit({
    actor_user_id: actorUserId,
    company_id: id,
    action: 'TENANT_UPDATED',
    entity_type: 'company',
    entity_id: id,
    metadata: patch as Record<string, unknown>,
  });
  return mapCompany(data as Record<string, unknown>);
}

export type CreateTenantInput = {
  name: string;
  legalName?: string;
  code?: string;
  slug?: string;
  country?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  defaultLanguage?: 'ar' | 'en' | 'id';
  secondaryLanguage?: 'ar' | 'en' | 'id';
  defaultCurrency?: string;
  timezone?: string;
  industry?: string;
  planCode?: string;
  modules?: string[];
  actorUserId?: string;
};

export async function createTenant(input: CreateTenantInput): Promise<TenantRecord> {
  const code =
    input.code ||
    input.name
      .replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '')
      .toUpperCase()
      .slice(0, 24) ||
    `T-${Date.now().toString(36).toUpperCase()}`;
  const slug =
    input.slug ||
    code
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const planCode = input.planCode || 'trial';
  const modules =
    input.modules ||
    ['crm', 'marketing', 'projects', 'documents', 'reports', 'settings'];

  if (isTenantMemoryMode()) {
    const plan = tenantMemory.getPlan(planCode);
    const tenant = tenantMemory.createTenant({
      code,
      slug,
      name: input.name,
      legal_name: input.legalName || input.name,
      country: input.country || 'ID',
      city: input.city,
      address: input.address,
      phone: input.phone,
      email: input.email,
      website: input.website,
      default_language: input.defaultLanguage || 'en',
      secondary_language: input.secondaryLanguage || 'id',
      default_currency: input.defaultCurrency || 'IDR',
      timezone: input.timezone || 'Asia/Jakarta',
      industry: input.industry || 'real_estate',
      status: 'trial',
      subscription_plan: planCode,
      subscription_status: 'trial',
      max_users: plan?.max_users ?? 10,
      max_projects: plan?.max_projects ?? 50,
      max_storage_mb: plan?.max_storage_mb ?? 2048,
      max_documents: plan?.max_documents ?? 1000,
    });
    tenantMemory.setModules(tenant.id, modules);
    tenantMemory.audit({
      action: 'TENANT_CREATED',
      company_id: tenant.id,
      actor_user_id: input.actorUserId,
      metadata: { code, modules },
    });
    return tenant;
  }

  const { data: plan } = await supabase.from('saas_plans').select('*').eq('code', planCode).maybeSingle();

  const { data, error } = await supabase
    .from('companies')
    .insert({
      code,
      slug,
      name: input.name,
      legal_name: input.legalName || input.name,
      country: input.country || 'ID',
      city: input.city || null,
      address: input.address || null,
      phone: input.phone || null,
      email: input.email || null,
      website: input.website || null,
      default_language: input.defaultLanguage || 'en',
      secondary_language: input.secondaryLanguage || 'id',
      default_currency: input.defaultCurrency || 'IDR',
      timezone: input.timezone || 'Asia/Jakarta',
      industry: input.industry || 'real_estate',
      status: 'trial',
      subscription_plan: planCode,
      subscription_status: 'trial',
      subscription_start: new Date().toISOString(),
      subscription_end: new Date(Date.now() + 14 * 86400000).toISOString(),
      max_users: plan?.max_users ?? 10,
      max_projects: plan?.max_projects ?? 50,
      max_storage_mb: plan?.max_storage_mb ?? 2048,
      max_documents: plan?.max_documents ?? 1000,
      is_active: true,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'create tenant failed');

  await supabase.from('tenant_modules').insert(
    modules.map((module_code) => ({
      company_id: data.id,
      module_code,
      enabled: true,
    }))
  );

  if (plan?.id) {
    await supabase.from('tenant_subscriptions').insert({
      company_id: data.id,
      plan_id: plan.id,
      status: 'trial',
      billing_interval: plan.billing_interval || 'monthly',
      trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    });
  }

  await writeSaasAudit({
    actor_user_id: input.actorUserId,
    company_id: data.id,
    action: 'TENANT_CREATED',
    entity_type: 'company',
    entity_id: data.id,
    metadata: { code, modules },
  });

  return mapCompany(data as Record<string, unknown>);
}

export async function setTenantModules(
  companyId: string,
  moduleCodes: string[],
  actorUserId?: string
) {
  if (isTenantMemoryMode()) {
    tenantMemory.setModules(companyId, moduleCodes);
    tenantMemory.audit({
      action: 'MODULE_CHANGED',
      company_id: companyId,
      actor_user_id: actorUserId,
      metadata: { modules: moduleCodes },
    });
    return;
  }
  await supabase.from('tenant_modules').delete().eq('company_id', companyId);
  if (moduleCodes.length) {
    await supabase.from('tenant_modules').insert(
      moduleCodes.map((module_code) => ({
        company_id: companyId,
        module_code,
        enabled: true,
      }))
    );
  }
  await writeSaasAudit({
    actor_user_id: actorUserId,
    company_id: companyId,
    action: 'MODULE_CHANGED',
    entity_type: 'tenant_modules',
    entity_id: companyId,
    metadata: { modules: moduleCodes },
  });
}

export async function getTenantModules(
  companyId: string,
  client?: SupabaseClient | null
): Promise<string[]> {
  if (isTenantMemoryMode()) {
    return tenantMemory.modulesFor(companyId).filter((m) => m.enabled).map((m) => m.module_code);
  }
  const db = client || supabase;
  const { data } = await db
    .from('tenant_modules')
    .select('module_code')
    .eq('company_id', companyId)
    .eq('enabled', true);
  return (data || []).map((r) => r.module_code as string);
}

export async function hasModule(
  companyId: string,
  module: PlatformModuleCode | string,
  client?: SupabaseClient | null
) {
  const mods = await getTenantModules(companyId, client);
  // Core modules always on if empty (pre-migration tenants)
  if (!mods.length) return true;
  return mods.includes(module);
}

export async function listPlans(): Promise<SaasPlan[]> {
  if (isTenantMemoryMode()) return tenantMemory.listPlans();
  const { data } = await supabase.from('saas_plans').select('*').eq('is_active', true);
  return (data || []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    currency: p.currency,
    billing_interval: p.billing_interval,
    max_users: p.max_users,
    max_projects: p.max_projects,
    max_storage_mb: p.max_storage_mb,
    max_documents: p.max_documents,
    enabled_modules: p.enabled_modules || [],
    is_active: p.is_active,
  }));
}

/**
 * Production has no tenant_memberships table.
 * Membership = active users row with company_id (one tenant per user).
 */
export async function getUserMemberships(
  userId: string,
  client?: SupabaseClient | null
): Promise<TenantMembership[]> {
  if (isTenantMemoryMode()) return tenantMemory.listMemberships(userId);

  const db = client || supabase;
  const { data, error } = await db
    .from('users')
    .select('id, company_id, role_code, is_active, deleted_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return [];
  if (data.is_active === false || data.deleted_at) return [];
  if (!data.company_id) return [];

  return [
    {
      id: `users:${data.id}`,
      user_id: String(data.id),
      company_id: String(data.company_id),
      role_code: String(data.role_code || 'staff'),
      status: 'active',
      is_default: true,
    },
  ];
}

/**
 * Bind user → company via users.company_id / role_code.
 * Does not create tenant_memberships (table absent in production).
 */
export async function ensureMembership(input: {
  userId: string;
  companyId: string;
  roleCode: string;
  isDefault?: boolean;
}): Promise<TenantMembership> {
  if (isTenantMemoryMode()) {
    return tenantMemory.upsertMembership({
      user_id: input.userId,
      company_id: input.companyId,
      role_code: input.roleCode,
      status: 'active',
      is_default: Boolean(input.isDefault),
    });
  }

  const { data, error } = await supabase
    .from('users')
    .update({
      company_id: input.companyId,
      role_code: input.roleCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.userId)
    .select('id, company_id, role_code')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('User not found for membership bind');

  return {
    id: `users:${data.id}`,
    user_id: String(data.id),
    company_id: String(data.company_id),
    role_code: String(data.role_code || input.roleCode),
    status: 'active',
    is_default: true,
  };
}

export async function platformStats() {
  const tenants = await listTenants();
  return {
    total_tenants: tenants.length,
    active_tenants: tenants.filter((t) => t.status === 'active').length,
    suspended_tenants: tenants.filter((t) => t.status === 'suspended').length,
    trial_tenants: tenants.filter((t) => t.status === 'trial' || t.subscription_status === 'trial')
      .length,
    active_subscriptions: tenants.filter((t) => t.subscription_status === 'active').length,
  };
}
