# Multi-Tenant Architecture — منصة توقع / Taqwa Platform

**Implemented on branch `cursor/multi-tenant-saas-cdc9`.**  
This document describes what exists in the codebase, not aspirational features.

---

## Model

```
Platform (SUPER_ADMIN)
  └── Tenant = public.companies
        ├── tenant_memberships (user ↔ company + role)
        ├── tenant_modules (feature flags)
        ├── tenant_subscriptions → saas_plans
        ├── saas_audit_logs / support_sessions
        └── Business rows scoped by company_id
```

**Decision:** `companies` is the tenant table. There is no separate `tenants` table.

---

## Core modules

| Path | Role |
|------|------|
| `lib/tenant/types.ts` | Tenant, plan, module, role types |
| `lib/tenant/service.ts` | CRUD tenants, modules, plans, memberships |
| `lib/tenant/context.ts` | `requireTenant`, `requireTenantFromRequest`, IDOR helpers |
| `lib/tenant/api-guard.ts` | Route-handler wrapper + safe errors |
| `lib/tenant/rbac.ts` | SUPER_ADMIN / TENANT_ADMIN / role→permission maps |
| `lib/tenant/limits.ts` | `canCreateUser` / `canCreateProject` / storage prefix |
| `lib/tenant/audit.ts` | SaaS audit writer |
| `lib/tenant/memory.ts` | Demo/test in-memory store (`TENANT_FORCE_MEMORY`) |
| `scripts/sql/033_multi_tenant_saas.sql` | Schema + TWAQQA migration + IDN pilot seed |

---

## Routing

| Route | Audience |
|-------|----------|
| `/app` (existing ERP routes) | Tenant users |
| `/platform` | Super Admin dashboard |
| `/onboarding` | New company self-serve signup |
| `/api/platform/*` | Platform admin APIs |
| `/api/tenant/context`, `/api/tenant/switch` | Current tenant + switcher |
| `/api/onboarding` | Create tenant + admin |

Tenant identity is resolved from the authenticated session cookie (`tawaqqa_auth.companyId`) and memberships — not from URL segments alone.

---

## Isolation strategy

1. **Session companyId** on login / switch  
2. **Server helpers** `requireTenantFromRequest` + `assertTenantRow`  
3. **Query filters** `.eq('company_id', tenantId)` in fetchers and secured APIs  
4. **Postgres RLS** (`029` + SaaS policies in `033`) via `current_app_company_id()`  
5. **Module flags** `hasModule` / `requireModule` (server-side)

Defense-in-depth: UI hide + API check + DB filter + RLS.

---

## Existing company (TWAQQA)

Migration `033` assigns SaaS columns, enables all modules, creates an enterprise subscription, and backfills `tenant_memberships` from `users.company_id`. Demo seed mirrors this in memory.

---

## Indonesian pilot

Seeded company `IDN-PILOT` / slug `idn-realestate-pilot`:

- Country `ID`, currency `IDR`, timezone `Asia/Jakarta`
- Languages `en` + `id`
- Industry `real_estate`
- Trial plan with CRM / marketing / projects / documents / reports / settings

Create additional tenants via `/platform` or `/onboarding` without forking the app.
