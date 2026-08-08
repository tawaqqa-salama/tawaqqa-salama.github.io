/**
 * Demo/test in-memory multi-tenant store when Supabase is unavailable.
 */

import { randomUUID } from 'node:crypto';
import type { SaasPlan, TenantMembership, TenantRecord } from '@/lib/tenant/types';

type Db = {
  tenants: TenantRecord[];
  memberships: TenantMembership[];
  modules: Array<{ company_id: string; module_code: string; enabled: boolean }>;
  plans: SaasPlan[];
  subscriptions: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  support: Array<Record<string, unknown>>;
};

const g = globalThis as unknown as { __tawaqTenantMem?: Db };

function db(): Db {
  if (!g.__tawaqTenantMem) {
    const tawaqqaId = 'co-tawaqqa';
    const idnId = 'co-idn-pilot';
    const allModules = [
      'crm',
      'marketing',
      'whatsapp',
      'social_media',
      'website',
      'projects',
      'documents',
      'reports',
      'finance',
      'finance_zatca',
      'procurement',
      'hr',
      'design',
      'settings',
    ];
    g.__tawaqTenantMem = {
      tenants: [
        {
          id: tawaqqaId,
          code: 'TWAQQA',
          slug: 'tawaqqa',
          name: 'توقع سلامة',
          legal_name: 'مكتب توقع سلامة للاستشارات الهندسية',
          logo_url: null,
          country: 'SA',
          city: 'الرياض',
          address: 'المركز الرئيسي',
          phone: null,
          email: 'admin@tawaqqa.sa',
          website: null,
          default_language: 'ar',
          secondary_language: 'en',
          default_currency: 'SAR',
          timezone: 'Asia/Riyadh',
          date_format: 'dd/MM/yyyy',
          number_format: 'ar-SA',
          industry: 'safety_engineering',
          status: 'active',
          subscription_plan: 'enterprise',
          subscription_status: 'active',
          subscription_start: new Date().toISOString(),
          subscription_end: null,
          max_users: 200,
          max_projects: 5000,
          max_storage_mb: 102400,
          max_documents: 100000,
          is_active: true,
        },
        {
          id: idnId,
          code: 'IDN-PILOT',
          slug: 'idn-realestate-pilot',
          name: 'Indonesia Real Estate Pilot',
          legal_name: 'Indonesia Real Estate Development Office',
          logo_url: null,
          country: 'ID',
          city: 'Jakarta',
          address: null,
          phone: null,
          email: null,
          website: null,
          default_language: 'en',
          secondary_language: 'id',
          default_currency: 'IDR',
          timezone: 'Asia/Jakarta',
          date_format: 'dd/MM/yyyy',
          number_format: 'en-ID',
          industry: 'real_estate',
          status: 'trial',
          subscription_plan: 'trial',
          subscription_status: 'trial',
          subscription_start: new Date().toISOString(),
          subscription_end: new Date(Date.now() + 14 * 86400000).toISOString(),
          max_users: 10,
          max_projects: 50,
          max_storage_mb: 2048,
          max_documents: 1000,
          is_active: true,
        },
      ],
      memberships: [
        {
          id: 'mem-admin',
          user_id: 'usr-admin',
          company_id: tawaqqaId,
          role_code: 'super_admin',
          status: 'active',
          is_default: true,
        },
        {
          id: 'mem-engineer',
          user_id: 'usr-engineer',
          company_id: tawaqqaId,
          role_code: 'engineer',
          status: 'active',
          is_default: true,
        },
        {
          id: 'mem-sales',
          user_id: 'usr-sales',
          company_id: tawaqqaId,
          role_code: 'sales',
          status: 'active',
          is_default: true,
        },
        {
          id: 'mem-finance',
          user_id: 'usr-finance',
          company_id: tawaqqaId,
          role_code: 'accountant',
          status: 'active',
          is_default: true,
        },
      ],
      modules: [
        ...allModules.map((m) => ({ company_id: tawaqqaId, module_code: m, enabled: true })),
        ...['crm', 'marketing', 'projects', 'documents', 'reports', 'settings'].map((m) => ({
          company_id: idnId,
          module_code: m,
          enabled: true,
        })),
      ],
      plans: [
        {
          id: 'plan-trial',
          code: 'trial',
          name: 'Trial',
          description: '14-day trial',
          price: 0,
          currency: 'USD',
          billing_interval: 'monthly',
          max_users: 5,
          max_projects: 25,
          max_storage_mb: 512,
          max_documents: 200,
          enabled_modules: ['crm', 'marketing', 'projects', 'documents', 'reports', 'settings'],
          is_active: true,
        },
        {
          id: 'plan-growth',
          code: 'growth',
          name: 'Growth',
          description: 'Growing offices',
          price: 149,
          currency: 'USD',
          billing_interval: 'monthly',
          max_users: 40,
          max_projects: 500,
          max_storage_mb: 10240,
          max_documents: 10000,
          enabled_modules: [
            'crm',
            'marketing',
            'projects',
            'documents',
            'reports',
            'finance',
            'procurement',
            'hr',
            'settings',
            'social_media',
            'website',
          ],
          is_active: true,
        },
        {
          id: 'plan-enterprise',
          code: 'enterprise',
          name: 'Enterprise',
          description: 'Full platform',
          price: 399,
          currency: 'USD',
          billing_interval: 'monthly',
          max_users: 200,
          max_projects: 5000,
          max_storage_mb: 102400,
          max_documents: 100000,
          enabled_modules: allModules,
          is_active: true,
        },
      ],
      subscriptions: [],
      audit: [],
      support: [],
    };
  }
  return g.__tawaqTenantMem;
}

export const tenantMemory = {
  reset() {
    g.__tawaqTenantMem = undefined;
  },
  listTenants: () => db().tenants,
  getTenant: (id: string) => db().tenants.find((t) => t.id === id || t.slug === id || t.code === id) || null,
  saveTenant(row: TenantRecord) {
    const d = db();
    const i = d.tenants.findIndex((t) => t.id === row.id);
    if (i >= 0) d.tenants[i] = row;
    else d.tenants.push(row);
    return row;
  },
  createTenant(input: Partial<TenantRecord> & { name: string; code: string }): TenantRecord {
    const row: TenantRecord = {
      id: input.id || randomUUID(),
      code: input.code,
      slug: input.slug || input.code.toLowerCase(),
      name: input.name,
      legal_name: input.legal_name ?? input.name,
      logo_url: input.logo_url ?? null,
      country: input.country ?? 'ID',
      city: input.city ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      website: input.website ?? null,
      default_language: input.default_language || 'en',
      secondary_language: input.secondary_language ?? 'id',
      default_currency: input.default_currency || 'IDR',
      timezone: input.timezone || 'Asia/Jakarta',
      date_format: input.date_format || 'dd/MM/yyyy',
      number_format: input.number_format || 'en-ID',
      industry: input.industry || 'real_estate',
      status: input.status || 'trial',
      subscription_plan: input.subscription_plan || 'trial',
      subscription_status: input.subscription_status || 'trial',
      subscription_start: input.subscription_start || new Date().toISOString(),
      subscription_end: input.subscription_end || null,
      max_users: input.max_users ?? 10,
      max_projects: input.max_projects ?? 50,
      max_storage_mb: input.max_storage_mb ?? 2048,
      max_documents: input.max_documents ?? 1000,
      is_active: input.is_active !== false,
    };
    db().tenants.push(row);
    return row;
  },
  listMemberships: (userId?: string) =>
    userId ? db().memberships.filter((m) => m.user_id === userId) : db().memberships,
  upsertMembership(m: Omit<TenantMembership, 'id'> & { id?: string }) {
    const d = db();
    const existing = d.memberships.find((x) => x.user_id === m.user_id && x.company_id === m.company_id);
    if (existing) {
      Object.assign(existing, m);
      return existing;
    }
    const row = { ...m, id: m.id || randomUUID() };
    d.memberships.push(row);
    return row;
  },
  modulesFor(companyId: string) {
    return db().modules.filter((m) => m.company_id === companyId);
  },
  setModules(companyId: string, codes: string[]) {
    const d = db();
    d.modules = d.modules.filter((m) => m.company_id !== companyId);
    for (const code of codes) {
      d.modules.push({ company_id: companyId, module_code: code, enabled: true });
    }
  },
  listPlans: () => db().plans,
  getPlan: (code: string) => db().plans.find((p) => p.code === code) || null,
  audit(entry: Record<string, unknown>) {
    db().audit.unshift({ id: randomUUID(), created_at: new Date().toISOString(), ...entry });
  },
  listAudit: (companyId?: string) =>
    companyId ? db().audit.filter((a) => a.company_id === companyId) : db().audit,
  startSupport(actorUserId: string, targetCompanyId: string, reason?: string) {
    const row = {
      id: randomUUID(),
      actor_user_id: actorUserId,
      target_company_id: targetCompanyId,
      reason: reason || null,
      started_at: new Date().toISOString(),
      ended_at: null,
    };
    db().support.unshift(row);
    return row;
  },
};
