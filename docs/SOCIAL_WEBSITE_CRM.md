# Social Media Hub + Website ↔ CRM

Integrated Marketing modules on the existing Tawaq CRM spine (`clients` + pipeline).  
**No parallel Customer / Lead / Pipeline / Project databases.**

## Architecture

```
Marketing
├── Overview          → CRM funnel by source
├── Leads             → clients (pipeline_stage=marketing)
├── Campaigns         → WhatsApp campaigns + marketing_campaigns
├── WhatsApp          → existing Cloud API inbox
├── Social Media      → Accounts / Inbox / Content / Calendar / Campaigns / Analytics
└── Website           → Settings / Pages / Services / Projects / Blog / Forms / SEO
```

Provider adapters implement `SocialMediaProvider` (`lib/social/provider/*`).  
Unsupported official-API capabilities return `{ supported: false, reason }` — never scraping/Puppeteer/password storage.

## CRM identity

`lib/marketing/crm-identity.ts` matches by:

1. `client_social_identities` (platform + platform_user_id)
2. email
3. phone (same candidates as WhatsApp)

Then creates or updates a **Lead on `clients`** with attribution (first/last touch, UTM).

## Database

Apply `scripts/sql/032_social_website_crm.sql` (included in `npm run db:apply-dds`).

## Key APIs

| Area | Path |
|------|------|
| Accounts / OAuth start | `POST /api/integrations/social/accounts` |
| OAuth callback | `GET /api/integrations/social/oauth/:platform/callback` |
| Inbox | `GET /api/integrations/social/inbox` |
| Inbound message → CRM | `POST /api/integrations/social/inbound` |
| Posts / publish | `/api/integrations/social/posts` |
| Dashboard / analytics | `/api/integrations/social/dashboard`, `/analytics` |
| Meta IG/FB webhook | `/api/social/webhook/meta` |
| Marketing campaigns | `/api/integrations/marketing/campaigns` |
| CRM funnel | `/api/integrations/marketing/funnel` |
| Customer timeline | `/api/integrations/marketing/timeline?customerId=` |
| Website CMS | `/api/integrations/website/*` |
| Public form → Lead | `POST /api/public/website/forms/:slug` |
| WhatsApp CTA track | `POST /api/integrations/website/whatsapp-click` |
| SEO | `/sitemap.xml`, `/robots.txt` |

## Permissions

`social.*` and `website.*` (see `lib/auth/types.ts`).  
Sales role includes full social/website manage; `dept.marketing` grants view/inbox/analytics/forms by default.

## Environment

See `.env.example` — Meta / LinkedIn / X / TikTok / Google client credentials.  
Tokens encrypted via `SOCIAL_TOKEN_ENCRYPTION_KEY` (or WhatsApp encryption key).

## What is production-complete vs needs credentials

| Capability | Status |
|------------|--------|
| CRM lead match/create + attribution + timeline | **Complete** (memory or Supabase) |
| Website form → CRM + UTM | **Complete** |
| Marketing funnel dashboard | **Complete** |
| Content calendar / scheduling store | **Complete** |
| Provider publish/OAuth | **Complete adapters**; live calls need app credentials + approved scopes |
| Instagram/Facebook messaging | Webhook route ready; needs Meta app + Page tokens |
| LinkedIn messaging | **Unsupported** via public API (explicit) |
| TikTok text publish | **Unsupported** (needs video Content Posting API) |
| YouTube text publish | **Unsupported** (needs video upload) |
| Google Business | OAuth scaffold; posts/messages limited by GBP APIs |
| AI captions/hashtags | Heuristic always; OpenAI when `OPENAI_API_KEY` — **never auto-publishes** |

## Hosting note

GitHub Pages static export cannot run these APIs. Use Node/Vercel for OAuth, webhooks, forms, and token persistence.
