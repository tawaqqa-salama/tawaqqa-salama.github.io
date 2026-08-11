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
- `POST /api/auth/session` verifies Supabase JWT, loads profile by `auth_user_id` via JWT-scoped or service-role server client
- No email identity fallback in Production
- `requireTenantFromRequest` / platform gates re-read `users.is_active`, `deleted_at`, `role_code`, `company_id`, and active memberships every request
- Existing localStorage session for UI hydrate (GitHub Pages / demo)

### Tenant context
- `requireTenant` / `requireTenantFromRequest` / `withTenantApi` (`lib/tenant/*`, `lib/auth/authorization.ts`)
- Live actor via `lib/auth/session-actor.ts` — cookie role/company overwritten from DB
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
- `/api/platform/*` — live platform-admin check (`lib/auth/platform-gate.ts`)
- Public website forms — sanitization + in-process rate limit
- Meta webhooks — signature required in production (unsigned never allowed in prod)

### Data access helpers
- `lib/data/fetchers.ts` applies `company_id` from session when present  
- `listUsers` / `listRoles` scoped to session company  
- Company profile / ZATCA settings load by session company (legacy TWAQQA fallback)

### RLS / Storage
- Apply `041_production_security_hardening.sql` then `042_role_level_rls.sql`
- 041: tenant isolation + storage path ownership + live-save RPC auth
- 042: role-level finance write (`app_can_write_finance`), users admin-only mutate, SaaS control-plane admin-only
- Staff/sales JWT cannot UPDATE journal_entries / payments / zatca / acc_* / tenant_modules

### Support access
- Super Admin support entry via `/api/platform/support`  
- Audited support sessions table  

### Audit
- `saas_audit_logs` for tenant create/update, modules, onboarding, support  

## Remaining hardening (honest)

Client-side Supabase access still depends on Supabase Auth JWT + RLS (`041`+`042`). Cookie session alone does not set `auth.uid()` — production logins must use Supabase Auth so RLS binds. Demo/Pages without Auth continue via memory stores.

Set `SUPABASE_SERVICE_ROLE_KEY` on the server for reliable actor revalidation / mint fallback when JWT-scoped reads are unavailable.

Never rely on frontend filtering alone.
