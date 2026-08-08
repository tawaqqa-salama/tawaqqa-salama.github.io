# Multi-Tenant SaaS Migration Plan — منصة توقع

**Date:** 2026-08-08  
**Branch:** `cursor/multi-tenant-saas-cdc9`  
**Rule:** Adapt existing architecture — do not rebuild.

---

## 1. Existing architecture (audit findings)

### Stack
| Item | Actual |
|------|--------|
| App | `smart-erp` Next.js **16.2.11** + React **19.2.4** |
| Data | Supabase JS client + Postgres (`pg` for migrations) |
| Auth | Supabase Auth + unsigned httpOnly cookie `tawaqqa_auth` + localStorage session |
| ORM | None — raw Supabase queries |
| Tests | Vitest |

### Tenant foundation already present
- Table **`companies`** = tenant (`scripts/sql/001_tenant_mdm.sql`)
- Most business tables already have **`company_id`** (~76 tables)
- DDS docs define tenant = company
- Partial RLS via `current_app_company_id()` in `029_rls_tenant_lockdown.sql`

### Single-tenant product behavior today
| Area | File / behavior |
|------|-----------------|
| Hardcoded company | `lib/auth/service.ts` → `TWAQQA` / `co-tawaqqa` |
| Profile upsert | `lib/company-profile.ts` always `code = 'TWAQQA'` |
| Session | Cookie may omit `companyId`; APIs rarely verify tenant |
| RLS | Open policies from `007` remain on many tables; `029` covers finance/CRM subset only |
| Roles | `admin \| engineer \| sales \| accountant \| staff` — no platform SUPER_ADMIN |
| i18n | `ar \| en` only (`lib/i18n/`); ~94 components still hardcoded Arabic |
| Currency / locale | SAR, Asia/Riyadh, +966 baked into helpers/SQL |
| Modules | Always shown if department permission; no feature flags |
| Subscriptions | None |
| Memberships | User has single `company_id` |
| Storage | Shared `project-files` bucket; no tenant path enforcement |

### Tables needing company_id (gaps)
- `procurement_vendors`, `purchase_orders`, `procurement_rfqs`
- `activity_logs` (scoped via actor today)
- Child tables inherit via parent (OK)

### Key files to modify
```
lib/auth/*                    — session + tenant context + roles
lib/tenant/*                  — NEW helpers
lib/i18n/*                    — add `id`, expand keys
lib/company-profile.ts        — tenant-scoped
lib/format/currency.ts        — tenant currency
middleware.ts                 — platform routes + session company
app/platform/*                — NEW Super Admin UI
app/onboarding/*              — NEW tenant onboarding
app/settings/company/*        — tenant settings
components/layout/*           — branding + module gates + lang switcher
scripts/sql/033_*.sql         — NEW migration
```

---

## 2. Target model

```
Platform (SUPER_ADMIN)
  └── Tenant = companies (+ SaaS columns)
        ├── tenant_memberships → users + roles
        ├── tenant_modules (feature flags)
        ├── subscriptions → plans
        └── Business data (clients, projects, …) WHERE company_id = tenant
```

**Decision:** Keep `companies` as the tenant table. Do **not** create a parallel `tenants` table.

---

## 3. Implementation phases (this PR)

| Phase | Status | Deliverable |
|-------|--------|-------------|
| 1 | Done | This audit + plan |
| 2–4 | Done | `033_multi_tenant_saas.sql` + TWAQQA migration + IDN pilot seed |
| 5–6 | Done | `lib/tenant/*`; fetchers + critical APIs scoped; company profile/ZATCA by session |
| 7–9 | Done | `super_admin` / `tenant_admin`; `/platform` console |
| 10 | Partial | Locale `id` + EN/ID for shell/platform/onboarding (domain UIs progressive) |
| 11–12 | Done | Tenant settings/branding by companyId; module flags + AppShell gate |
| 13–14 | Done | Plans/subscriptions schema + limits + onboarding |
| 15–16 | Done | `tenantStoragePrefix` + `saas_audit_logs` |
| 17–18 | Done | Isolation tests + architecture docs |

---

## 4. Security principles

1. Resolve tenant from **authenticated membership/session**, never from client-supplied IDs alone.
2. Every mutation/query for tenant data must include `company_id = currentTenantId`.
3. Super Admin tenant access requires explicit audited support session.
4. Module and subscription checks enforced server-side.

---

## 5. Existing data migration

1. Ensure company `TWAQQA` exists (seed / live).
2. Backfill `company_id` on any NULL business rows → TWAQQA.
3. Mark TWAQQA as `subscription_status = 'active'`, industry `safety_engineering` (current product).
4. Create empty Indonesian pilot tenant optionally via Super Admin (no data copy).
5. Preserve all existing clients/users/documents.

---

## 6. Out of scope / follow-ups (documented limitations)

- Full translation of every hardcoded Arabic string in 94 components (architecture + shell + platform + onboarding + settings completed; domain modules progressively).
- Payment gateway (architecture only).
- Complete RLS rewrite of every table in one PR (extend `029` pattern for high-risk tables + app-layer enforcement).
- ZATCA remains Saudi-tenant feature via module flag `finance_zatca`.
