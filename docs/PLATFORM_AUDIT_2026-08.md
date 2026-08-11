# Platform Security & Architecture Audit — August 2026

**Branch:** `audit/platform-hardening-2026-08`  
**Repository:** `tawaqqa-salama/tawaqqa-salama.github.io`  
**Scope:** Full platform audit + P0/P1 hardening (no merge, Draft PR)

---

## Executive Summary

A full multi-tenant security and architecture audit was performed against the Next.js + Supabase ERP. Baseline (`npm test`, `tsc`, `build`, `build:user-pages`) was green (373 tests). Confirmed **cross-tenant IDOR / unscoped query** issues were fixed in WhatsApp, Social, Marketing campaigns, Website CMS, ZATCA status, client fetchers, Design Intelligence RAG, and invoice contract/milestone ownership. A SQL migration (`045`) closes open `di_*` RLS policies from `025`. Security regression tests (Phase 17) were added. SBC/NFPA thresholds were **not** changed.

---

## Repository Architecture

| Layer | Notes |
|---|---|
| App router | ~32 `page.tsx` routes under `app/` |
| API | 64 `route.ts` handlers under `app/api/` |
| Auth | Signed session cookie + live actor revalidation (`session-actor`) |
| Tenant | `withTenantApi` / `requireTenantFromRequest` / `assertTenantRow` |
| Data | Supabase (Postgres + RLS) + memory fallbacks for demo/WhatsApp/marketing |
| Compliance | `lib/projects/compliance/` — SBC 201 engine; no invented thresholds |
| SQL | `scripts/sql/000`–`045` |

**Expected resource path:** authenticated user → authorization → tenant/company scope → DB query → response.

---

## Security Findings

### P0 (fixed in this PR)

| ID | Finding | Fix |
|---|---|---|
| P0-01 | WhatsApp conversation get/list/update/markRead/send without `company_id` | Tenant-scoped repository + API `tenantId` |
| P0-02 | Social inbox/posts/accounts/dashboard unscoped by company | `companyId` on service + routes |
| P0-03 | Marketing campaigns list/save without tenant filter | Session `tenantId` only; ignore body `company_id` |
| P0-04 | Website CMS `website_sites.select('*').limit(1)` cross-tenant | `getOrCreateWebsiteSite(companyId)` |
| P0-05 | ZATCA status invoice query without `company_id` | `.eq('company_id', tenantId)` |
| P0-06 | Client fetchers skipped filter when `companyId` null | Fail closed → `[]` / `null` |
| P0-07 | Design RAG cookie-only + unscoped `di_knowledge_chunks` | `withTenantApi` + `companyId` filter |
| P0-08 | Open anon/auth RLS on `di_*` (025; not in 041) | `045_design_intelligence_tenant_rls.sql` |
| P0-09 | Invoice contract/milestone loaded by id without client ownership | Ownership checks vs `client_id` / company |

### P0 remaining / ops-dependent

| ID | Status | Finding | Notes |
|---|---|---|---|
| P0-R1 | **OPS_REQUIRED** | Migration `045` must be applied on production DB | No live Supabase connection in this agent run — cannot claim applied |
| P0-R2 | **OPS_REQUIRED** | Confirm migration `041` + storage policies on production | Historical anon policies in 028 vs tenant policies in 041 |
| P0-DI | **FIXED** (code) / **OPS_REQUIRED** (apply) | DI RLS includes `di_engineering_*`; regression prevents FOR ALL USING (true) reintroduction | `045` expanded; tests in `platform-audit-security-closure.test.ts` |
| P0-PUBLIC | **FIXED** | Public website form / WhatsApp click require `public_form_token` → company | `resolveWebsiteSiteByPublicToken`; no unscoped `getOrCreate` on public paths |

---

## Final security closure (PR #140 follow-up)

| Item | Status |
|---|---|
| P0-1 Design Intelligence RLS (045 + di_engineering_*) | **FIXED** in repo; **OPS_REQUIRED** apply on prod |
| P0-2 Public website / WhatsApp token → company | **FIXED** |
| P1 Document download signed URL tenant ownership | **FIXED** in repo (`/api/documents/signed-url` + helpers); **OPS_REQUIRED** confirm 041 storage RLS live |
| Regression suite (DI / public token / signed URL / company_id override) | **FIXED** (`tests/platform-audit-security-closure.test.ts`) |
| P0-3 SECURITY DEFINER grants + tenant guards on live RPCs | **FIXED** in repo (`scripts/sql/20260812_security_definer_hardening.sql`); **OPS_REQUIRED** apply + re-check Advisor |

### OPS_REQUIRED

```
OPS_REQUIRED:
Apply migration 045 / 20260812_design_intelligence_tenant_rls (if not already)
Apply migration 20260812_security_definer_hardening.sql
Confirm migration 041
Verify storage policies
Re-check Supabase Security Advisor after DEFINER hardening
Enable Auth → Leaked Password Protection (Dashboard only; not changed from code)
```

No production DB verification / Security Advisor API access in this agent environment.
Agent cannot toggle Auth Leaked Password Protection from the repository — Dashboard configuration required.

---

## Multi-Tenant Findings

- Core CRM/projects paths already use `withTenantApi` + `assertTenantRow` in many places.
- Gaps were concentrated in **marketing/social/whatsapp/website/DI** service layers that filtered by id only.
- Cross-tenant responses prefer **404 `not_found`** (no existence leak) via `lib/tenant/resource-scope.ts`.
- Client-supplied `company_id` on marketing campaigns and design RAG is ignored.

---

## API Findings

- Protected mutations generally go through `withTenantApi`.
- Design RAG previously lacked auth/module gate — fixed.
- ZATCA status no longer returns raw DB error strings to the client.
- Unauthenticated access to gated APIs returns ≥401 (regression TEST 5).

---

## Supabase Findings

- Reviewed SQL under `scripts/sql/` (~44 files → 45 with this PR).
- `041` hardened many `company_id` tables; **omitted `di_*`**.
- `025` granted open `USING (true)` to authenticated/anon on Design Intelligence tables — closed by `045`.
- No invented RLS roles; no RLS weakening for tests.

---

## Projects Findings

- Project list/detail rely on client fetchers + pipeline helpers; fetchers now fail closed without tenant.
- No full UI redesign. Giant modals / ClientRecord dependency noted as P2 maintainability (not fixed).

---

## Engineering / Compliance Findings

- SBC 201 egress verified thresholds remain **0** (`CODE_TABLE_REQUIRED`).
- Missing threshold → `NEEDS_DATA` / `BLOCKED`, never false `PASS` (regression TEST 8).
- **No SBC/NFPA/Saudi Code numeric thresholds modified.**

---

## Reports / Documents Findings

- Report isolation largely inherits client/project tenant checks.
- **FIXED:** `/api/documents/signed-url` requires auth + tenant + path ownership before minting a signed URL.
- **FIXED:** `storagePathBelongsToTenant` / `assertStoragePathTenantAccess` refuse foreign paths (404, no existence leak).
- **OPS_REQUIRED:** Confirm `041` `project_files_tenant_*` storage policies are live on production.
- Final report generation missing-data gates: existing compliance engine behavior retained; no threshold invention.

---

## UX / Mobile / Performance Findings (mostly P2/P3 — not bulk-fixed)

| Severity | Item |
|---|---|
| P2 | Large client components / modals on project file |
| P2 | Possible duplicate fetches on dashboard marketing widgets |
| P3 | Terminology consistency AR/EN |
| P3 | Dead TODO/FIXME inventory (not deleted without proof) |

---

## CI/CD Findings

- `.github/workflows/deploy-node.yml` runs install / typecheck / test / build.
- No CI workflow changes in this PR (existing pipeline adequate).

---

## Fixed Issues

1. WhatsApp tenant-scoped conversations + outbound send  
2. Social inbox/posts/accounts/dashboard/analytics tenant scope  
3. Marketing campaigns tenant scope + ignore body company override  
4. Website CMS site scoped by `company_id`  
5. ZATCA status tenant filter + sanitized errors  
6. Fetchers fail closed without company  
7. Invoice contract/milestone ownership checks  
8. Design RAG auth + tenant-scoped chunks  
9. SQL `045` DI RLS lockdown (includes `di_engineering_fields` / `di_engineering_rules`)  
10. `lib/tenant/resource-scope.ts` helpers  
11. Phase 17 security regression tests  
12. Public website / WhatsApp click: token → company (no first-site fallback)  
13. Document signed URL API with tenant ownership check  
14. Final closure regression suite  

---

## Remaining Issues

### P0
- **OPS_REQUIRED:** Apply `045` on production Supabase (not verified live).

### P1
- **OPS_REQUIRED:** Confirm `041` storage RLS live; optional live JWT download E2E.
- WhatsApp child resources (messages after conversation gate) — optional deeper company checks (P2).

### P2 / P3
- Unchanged from prior audit section.

### P2
- Project UI maintainability (giant components).
- N+1 / duplicate marketing stats fetches.

### P3
- Docs polish, cosmetic RTL/overflow where not breaking.

---

## Risk Assessment

| Risk | Level after PR | Mitigation |
|---|---|---|
| Cross-tenant CRM read via WhatsApp/Social/Marketing/Website | Reduced | Code fixes + tests |
| Cross-tenant Design Intelligence knowledge | Reduced when `045` applied | Migration required |
| False SBC PASS | Unchanged / controlled | Engine + TEST 8 |
| Storage anon legacy | Residual | Ops verify 041 |

---

## Validation (post-fix)

See PR / final agent report for latest:

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `npm run build:user-pages`

---

No merge performed.  
PR remains Draft.  
All unverified code thresholds remain unchanged.
