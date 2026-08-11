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

| ID | Finding | Notes |
|---|---|---|
| P0-R1 | Migration `045` must be applied on production DB | Code alone does not revoke live policies |
| P0-R2 | Historical storage anon policies (028) vs hardening (041) | Confirm 041 applied in prod; not changed here without live evidence |
| P0-R3 | Public website form / WhatsApp click paths still resolve site without session | By design for public tokens; document as residual risk until token-bound lookup is verified end-to-end |

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

- Report isolation largely inherits client/project tenant checks; no confirmed IDOR fixed beyond shared fetchers.
- Document download path ownership: confirm storage signed URLs + RLS in ops (P1 remaining if 041 not applied).
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
9. SQL `045` DI RLS lockdown  
10. `lib/tenant/resource-scope.ts` helpers  
11. Phase 17 security regression tests  

---

## Remaining Issues

### P0
- Apply `045` (and confirm `041`) on production Supabase.

### P1
- Public website submit/track paths: ensure token→company binding without unscoped `getOrCreate`.
- Document download APIs: re-verify storage path + RLS in live JWT tests.
- WhatsApp child resources (messages/opportunities via conversation id) — defense-in-depth after conversation gate; further message-level company checks optional.

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
