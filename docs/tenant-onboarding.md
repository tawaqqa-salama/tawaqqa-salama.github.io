# Tenant Onboarding

## Paths

1. **Super Admin** — `/platform` → Create tenant  
2. **Self-serve** — `/onboarding` → `POST /api/onboarding`  

Optional gate: set `TENANT_ONBOARDING_TOKEN` and pass `inviteToken` in the body.

## Self-serve fields

**Company:** name, legal name, country, city, address, phone, email, website  
**Regional:** language (`en`/`id`/`ar`), secondary language, currency, timezone  
**Admin:** full name, email, password (8+)  
**Industry:** default `real_estate` for Indonesian pilot  

Defaults for Indonesian real-estate:

| Field | Default |
|-------|---------|
| country | ID |
| currency | IDR |
| timezone | Asia/Jakarta |
| language | en |
| secondary | id |
| plan | trial |

## Flow

```
Company form → Create companies row
            → Seed tenant_modules
            → Create tenant_subscriptions (trial)
            → Create tenant_admin user + membership
            → saas_audit ONBOARDING_COMPLETED
            → Sign in → Dashboard
```

## Creating the Indonesian pilot (ops)

1. Apply SQL through `033_multi_tenant_saas.sql` (`npm run db:apply-dds` or Supabase SQL editor).  
2. Either use seeded `IDN-PILOT` and invite an admin, **or** open `/onboarding` and submit the company form (no code changes).  
3. Or as Super Admin: `/platform` → Create tenant with modules CRM/Projects/Documents/Reports/Settings.  
4. Deploy on Node/Vercel (not static GitHub Pages) so `/api/onboarding` and `/api/platform/*` run.  
5. Sign in as the new tenant admin; switch language En ↔ Id from the header.

## Demo mode

With `TENANT_FORCE_MEMORY=true` or demo mode, onboarding creates an in-memory tenant + membership (used by Vitest).
