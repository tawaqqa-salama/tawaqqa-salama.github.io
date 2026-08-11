# Live RLS JWT Security Test Results

Generated: blocked — no Preview/Test credentials in cloud agent environment

| # | Test | Expect | Result | Detail |
|---|------|--------|--------|--------|
| 1 | Company A staff SELECT on Company B | must fail / empty | **BLOCKED** | Missing Preview Supabase secrets |
| 2 | Company A staff UPDATE on Company B | must fail | **BLOCKED** | Missing Preview Supabase secrets |
| 3 | Company A tenant_admin INSERT user in Company B | must fail | **BLOCKED** | Missing Preview Supabase secrets |
| 4 | Company A tenant_admin set role_code=super_admin | must fail | **BLOCKED** | Missing Preview Supabase secrets |
| 5 | Company A tenant_admin set is_platform_admin=true | must fail | **BLOCKED** | Missing Preview Supabase secrets |
| 6 | Company A tenant_admin update normal user in Company A | must succeed | **BLOCKED** | Missing Preview Supabase secrets |
| 7 | Company A admin update normal user in Company A | must succeed | **BLOCKED** | Missing Preview Supabase secrets |
| 8 | Platform admin create super_admin | must succeed | **BLOCKED** | Missing Preview Supabase secrets |
| 9 | Platform admin set is_platform_admin=true | must succeed | **BLOCKED** | Missing Preview Supabase secrets |
| 10 | Staff change own role_code | must fail | **BLOCKED** | Missing Preview Supabase secrets |
| 11 | Staff change own company_id | must fail | **BLOCKED** | Missing Preview Supabase secrets |
| 12 | Disabled user cannot access protected API | must fail | **BLOCKED** | Missing Preview Supabase secrets |
| 13 | DB role_code change reflected without stale cookie trust | authorization uses live DB role | **BLOCKED** | Missing Preview Supabase secrets |
| 14 | No RLS recursion on users UPDATE | must succeed without recursion | **BLOCKED** | Missing Preview Supabase secrets |
| 15 | Storage isolation Company A staff vs Company B objects | list/upload/download must fail | **BLOCKED** | Missing Preview Supabase secrets |

**Passed:** 0 / 15  
**Failed:** 0 / 15  
**Blocked:** 15 / 15

## How to unblock

Add Cloud Agent / environment secrets for a **Preview or Test** Supabase project (not Production):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (seed only)
- `DATABASE_URL` (apply 041–044)
- `AUTH_SESSION_SECRET` (optional but required for tests 12–13)

Then:

```bash
LIVE_RLS_CONFIRM_PREVIEW=1 npm run test:live-rls
```

Harness: `scripts/live-rls-jwt-security-tests.mjs`
