# Tenant Security

## Threat model

Attackers must not read or mutate another tenant’s data by:

- Changing IDs in URLs or payloads  
- Calling APIs/server actions directly  
- Guessing document IDs  
- Spoofing `localStorage` / client state  

## Controls implemented

### Authentication
- Cryptographically signed httpOnly cookie (`AUTH_SESSION_SECRET` HMAC) — Base64 alone is rejected
- `POST /api/auth/session` loads role/company from Auth/DB — ignores client `roleCode` / `companyId`
- Middleware + `requireApiSession` verify signature and expiration
- Existing localStorage session for UI hydrate (GitHub Pages / demo)

### Tenant context
- `requireTenant` / `requireTenantFromRequest` / `withTenantApi` (`lib/tenant/*`, `lib/auth/authorization.ts`)
- Membership check for non–platform admins
- Suspended tenants rejected

### IDOR helpers
- `assertTenantRow(ctx, row.company_id)`
- `tenantFilter(companyId)` → `{ company_id }`
- `withTenantId` for inserts

### API examples secured
- WhatsApp / Social / Website / Marketing integration routes — `withTenantApi` + module flags
- ZATCA submit/onboard/status — tenant + `finance_zatca` module; secrets never from client body
- Invoices from milestone — tenant ownership of `clientId`
- `GET /api/integrations/marketing/funnel` — tenant + marketing module  
- `POST /api/contracts/auto-generate` — client must match `ctx.tenantId`  
- `/api/platform/*` — `super_admin` only (from signed cookie minted from DB)
- Public website forms — sanitization + in-process rate limit
- Meta webhooks — signature required in production (unsigned never allowed in prod)

### Data access helpers
- `lib/data/fetchers.ts` applies `company_id` from session when present  
- `listUsers` / `listRoles` scoped to session company  
- Company profile / ZATCA settings load by session company (legacy TWAQQA fallback)

### RLS / Storage
- Apply `scripts/sql/041_production_security_hardening.sql` after 029/033
- Tenant policies on CRM/finance/WhatsApp/social/live-store tables
- Storage `project-files` scoped via client/company path ownership
- Live-save SECURITY DEFINER RPCs check tenant + revoke anon execute

### Support access
- Super Admin support entry via `/api/platform/support`  
- Audited support sessions table  

### Audit
- `saas_audit_logs` for tenant create/update, modules, onboarding, support  

## Remaining hardening (honest)

Client-side Supabase access still depends on Supabase Auth JWT + RLS (`041`). Cookie session alone does not set `auth.uid()` — production logins must use Supabase Auth so RLS binds. Demo/Pages without Auth continue via memory stores.

Never rely on frontend filtering alone.
