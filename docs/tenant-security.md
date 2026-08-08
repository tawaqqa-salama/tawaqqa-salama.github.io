# Tenant Security

## Threat model

Attackers must not read or mutate another tenant’s data by:

- Changing IDs in URLs or payloads  
- Calling APIs/server actions directly  
- Guessing document IDs  
- Spoofing `localStorage` / client state  

## Controls implemented

### Authentication
- Existing cookie + localStorage session (`lib/auth/*`)
- Middleware requires cookie for non-public routes (Node/Vercel hosts)

### Tenant context
- `requireTenant` / `requireTenantFromRequest` (`lib/tenant/context.ts`)
- Membership check for non–platform admins
- Suspended tenants rejected

### IDOR helpers
- `assertTenantRow(ctx, row.company_id)`
- `tenantFilter(companyId)` → `{ company_id }`
- `withTenantId` for inserts

### API examples secured
- `GET /api/integrations/marketing/funnel` — tenant + marketing module  
- `GET /api/integrations/whatsapp/stats` — tenant + whatsapp module  
- `POST /api/contracts/auto-generate` — client must match `ctx.tenantId`  
- `/api/platform/*` — `super_admin` only  

### Data access helpers
- `lib/data/fetchers.ts` applies `company_id` from session when present  
- `listUsers` / `listRoles` scoped to session company  
- Company profile / ZATCA settings load by session company (legacy TWAQQA fallback)

### Support access
- Super Admin support entry via `/api/platform/support`  
- Audited support sessions table  

### Audit
- `saas_audit_logs` for tenant create/update, modules, onboarding, support  

## Remaining hardening (honest)

Not every integration route yet calls `withTenantApi`. WhatsApp/social/website repositories still need systematic `company_id` filters. Prefer enabling RLS (`029` + `033`) in production and finishing route-by-route adoption of `withTenantApi`.

Never rely on frontend filtering alone.
