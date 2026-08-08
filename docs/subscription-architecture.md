# Subscription Architecture

Billing-provider integration is **not** implemented. The schema and helpers are ready for future Stripe/Xendit/etc.

## Tables (`033_multi_tenant_saas.sql`)

### `saas_plans`
- code, name, description, price, currency  
- billing_interval: `monthly` | `yearly`  
- limits: max_users, max_projects, max_storage_mb, max_documents  
- enabled_modules[]  

Seeded plans: `trial`, `starter`, `growth`, `enterprise`.

### `tenant_subscriptions`
- company_id → plan_id  
- status: trial | active | past_due | cancelled | none  
- starts_at / ends_at / trial_ends_at  

### Company mirror columns
`companies.subscription_plan`, `subscription_status`, `subscription_start/end`, and limit columns for fast checks.

## Limits API

`lib/tenant/limits.ts`:

- `canCreateUser(companyId)`  
- `canCreateProject(companyId)`  
- `canUploadDocument(companyId)`  
- `tenantStoragePrefix(companyId)` → `{companyId}/documents`  

`upsertEmployee` consults `canCreateUser` before insert.

## Modules

`platform_modules` + `tenant_modules` control feature availability.  
Helpers: `hasModule`, `requireModule`, `setTenantModules`.

ZATCA (`finance_zatca`) is a module — enable only for Saudi tenants that need it.

## Platform UI

`/platform` shows plans/stats; Super Admin can create tenants with a plan code and module list.
