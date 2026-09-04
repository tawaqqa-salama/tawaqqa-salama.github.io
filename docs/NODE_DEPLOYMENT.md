# Node hosting deployment (Vercel)

Prepare **Tawaqqa Salama** as a real Next.js Node app with `/api/*` Route Handlers, while **GitHub Pages stays live** as a static fallback until Node is verified.

Production Supabase project ref: `ezmdkwgziyencejfevso`

## Architecture (two hosts in parallel)

| Host | Workflow / integration | `app/api` | When |
|------|------------------------|-----------|------|
| GitHub Pages | `deploy-pages.yml` | Removed at build | Temporary public UI fallback |
| Node (Vercel) | Vercel Git + `deploy-node.yml` checks | Kept | Live ERP / ZATCA / Knowledge reingest |

Do **not** disable Pages, delete `deploy-pages.yml`, change DNS, or cut over a custom domain until Node verification passes.

## Prerequisites (do not set on Vercel)

These flags force static export / Pages mode. Leave them **unset** on the Node host:

- `USER_PAGES`
- `GITHUB_PAGES`
- `NEXT_PUBLIC_STATIC_EXPORT`
- `NEXT_PUBLIC_USER_PAGES`
- `NEXT_PUBLIC_GITHUB_PAGES`

With them unset, `next.config.ts` uses a normal Next.js build (no `output: 'export'`, no `basePath`). Routes serve at `/` and APIs at `/api/...`.

`vercel.json` is **not** required — Next.js framework auto-detection is enough. Route-level `maxDuration` / `runtime` exports already apply.

---

## 1. Create a Vercel project

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → **Add New…** → **Project**
2. **Import** GitHub repo: `tawaqqa-salama/tawaqqa-salama.github.io`
3. Framework Preset: **Next.js** (auto-detected)
4. Root Directory: repository root (default)
5. Build Command: `npm run build` (default)
6. Output Directory: leave default (Next.js server build — **not** `out/`)
7. Install Command: `npm ci` or `npm install`
8. Node.js: **22.x** (matches CI)

## 2. Production branch

- Production Branch: **`main`**
- Preview Deployments: enabled for pull requests (default)

## 3. Environment variables (Production + Preview)

### Required (public)

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ezmdkwgziyencejfevso.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key from Supabase → Settings → API |

### Required (server-only — never `NEXT_PUBLIC_*`)

| Variable | Notes |
|----------|--------|
| `AUTH_SESSION_SECRET` | HMAC for httpOnly session cookie. Min 16 chars. Generate: `openssl rand -base64 48` |

Without `AUTH_SESSION_SECRET`, production Node session minting fails closed (see `lib/auth/session-cookie.ts`).

### Optional (server-only — feature-dependent)

| Variable | When needed |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Trusted server fallbacks (session actor revalidation, some WhatsApp webhook writes). **Not** required for Knowledge reingest (uses Bearer JWT + RLS). Never expose to the browser. |
| `OPENAI_API_KEY` | Building-permit vision / marketing drafts |
| WhatsApp / Social OAuth vars | See `.env.example` |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for sitemap/robots on the Node host |
| `ZATCA_*` / finance secrets | Only if using live ZATCA |

Do **not** set `ALLOW_DEMO_MODE=true` on production ERP.

## 4. Deploy

1. Click **Deploy** (or push to `main` after the project is linked)
2. Wait for the production deployment to finish
3. Note the deployment URL (e.g. `https://tawaqqa-salama.vercel.app`)

CI also runs `.github/workflows/deploy-node.yml` (typecheck + test + Node build) on PRs/`main`. That workflow does **not** deploy to production.

## 5. Verify (before any DNS cutover)

Keep `https://tawaqqa-salama.github.io/` unchanged during this phase.

| Check | Expect |
|-------|--------|
| `GET /` | App shell loads at root (no `/repo-name` basePath) |
| `GET /api/health` | `{"ok":true,"runtime":"node","supabaseConfigured":true}` |
| Login | Supabase Auth + signed cookie session |
| Code Knowledge page | Lists documents from Production Supabase |
| `POST /api/design/knowledge/reingest` | Tenant-gated; requires admin + Bearer JWT. **Do not run NFPA reingest from Cursor / automation until explicitly approved** |

### Reingest timeout note

`app/api/design/knowledge/reingest/route.ts` declares:

```ts
export const runtime = 'nodejs';
export const maxDuration = 300;
```

Vercel Fluid Compute: Hobby max **300s**; Pro default max **300s** (extendable higher on Pro). Do **not** silently reduce `maxDuration`.

Large NFPA PDFs may still hit **memory** or wall-clock limits on serverless. If reingest times out or OOMs:

- Prefer **A) Node worker / container** (long-lived `next start` or dedicated worker), or
- **C) async job/queue** (accept POST → queue → poll status), using existing Storage + `di_knowledge_*` tables

CLI scripts (`npm run reingest:nfpa13-canonical`) remain the offline/ops path and require `SUPABASE_SERVICE_ROLE_KEY` on the operator machine — not in the browser.

### Related serverless caveat

`POST /api/reports/html-to-pdf` shells out to **Chromium** (`lib/print/chromium-html-to-pdf.server.ts`). Stock Vercel serverless images do **not** include Chrome. Report PDF download may need a Chromium-capable host or a different PDF path later. This does not block core ERP API migration.

## 6. Keep GitHub Pages live

- Leave Pages **Source = GitHub Actions** enabled
- Do **not** delete or disable `deploy-pages.yml`
- Pages continues to publish the static export (API routes stripped at build)

## 7. Cut over custom domain (only after validation)

1. Confirm health, login, Knowledge, and critical APIs on the Vercel URL
2. In Vercel → Project → Domains, add the custom domain
3. Update DNS **only then** (A/CNAME to Vercel as shown in the Vercel UI)
4. Keep Pages as rollback until traffic is stable

**Do not change DNS from this repository automation.**

## 8. Rollback

If Node hosting fails:

1. **Do not touch** GitHub Pages settings or `deploy-pages.yml`
2. Point any temporary traffic back to `https://tawaqqa-salama.github.io/`
3. Revert only Node-host-specific repo changes if needed (health route / docs) via git
4. On Vercel: pause production deploys or remove the custom domain assignment — Pages remains available

## Security checklist (Node)

- `withTenantApi` gates authenticated APIs; reingest ignores client `company_id`
- `middleware.ts` runs on Node (Pages build moves it aside)
- Session cookie HMAC uses `AUTH_SESSION_SECRET` (server-only)
- Knowledge reingest uses `createUserScopedSupabase(Bearer)` — RLS applies; no service role in the browser
- Never put `SUPABASE_SERVICE_ROLE_KEY` or `AUTH_SESSION_SECRET` under `NEXT_PUBLIC_*`

## Local Node-mode build (sanity)

```bash
USER_PAGES= GITHUB_PAGES= NEXT_PUBLIC_STATIC_EXPORT= npm run build
# Confirm .next includes app/api (Route Handlers), not only out/
npm start
curl -s http://localhost:3000/api/health
```

## Related docs

- [DEPLOY.md](./DEPLOY.md) — dual-host overview
- [P0_PRODUCTION.md](./P0_PRODUCTION.md) — production hardening
- [SUPABASE.md](./SUPABASE.md) — database / auth
- [USER-PAGES.md](./USER-PAGES.md) — static Pages path
