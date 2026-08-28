# Supabase fresh-branch baseline

## Purpose

This repository stores the historical DDS SQL chain under `scripts/sql/`, while Supabase's GitHub integration automatically discovers migrations only under the configured `supabase/migrations` directory. The repository does not place the historical `000–064` chain in that production migration directory. This document defines the explicit, manually authorized workflow for preparing an isolated, empty Supabase preview branch before any branch-specific work.

The workflow intentionally does **not** execute `scripts/sql/065_pr_a1_security_remediation.sql` or any timestamped Production migration. It also never edits `supabase_migrations.schema_migrations`.

## Verified Supabase contract

Supabase's official GitHub integration documentation states that migrations in the `migrations` subdirectory of the configured Supabase working directory are run automatically. Supabase branches are data-less, and the deployment process has a migration step that can block later steps when it fails. Supabase's database migration documentation states that applied versions are tracked per database in `supabase_migrations.schema_migrations` and that migration files are applied in version order.

Because this repository's historical SQL is under `scripts/sql/`, the baseline is not silently injected into the automatic production migration path. The workflow has two deliberately separate paths: a pull-request contract job that uses no secrets and validates the guards, and a manually approved `workflow_dispatch` job for the isolated validation environment. Secrets are never exposed to the pull-request contract job.

## Safe execution model

The repository uses the fixed validation environment `jxbzuezrymhxwvdejohw` while PR #238 is under review. Configure a GitHub Environment named `supabase-preview`, restrict it to `fix/supabase-branch-baseline`, and store only Preview credentials there. The required secrets are `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, and `SUPABASE_BRANCH_DATABASE_URL`; the required project ref is `SUPABASE_PROJECT_ID=jxbzuezrymhxwvdejohw`. The connection URL may use direct Supabase (`db.jxbzuezrymhxwvdejohw.supabase.co`) or the official Session Pooler (`aws-<number>-<region>.pooler.supabase.com`). Session Pooler is accepted only on port `5432` and only when its URI username is exactly `postgres.jxbzuezrymhxwvdejohw`; the shared pooler hostname alone is never proof of identity. Transaction Pooler port `6543`, ambiguous usernames, and non-Supabase hosts are rejected. Do not reuse Production or diagnostic Staging credentials.

The operator then dispatches `.github/workflows/supabase-branch-baseline.yml` with the feature/fix Git ref, the preview project reference, and the exact confirmation string `CREATE_FRESH_BRANCH_BASELINE`. The workflow checks out the requested branch, runs `scripts/raise-design-knowledge-upload-limit.mjs` through the supported hosted Storage API, and only then invokes `scripts/bootstrap-fresh-supabase-branch.mjs`.

The Storage administration step pins the same validation ref, refuses Production and diagnostic Staging, reads the global Storage file-size limit through the Supabase Management API, and stops with `NEEDS CONFIGURATION` before bucket mutation if the global limit is below 1 GiB. It obtains a server-side project key at runtime through the authenticated Management API and uses `storage.createBucket` or `storage.updateBucket` with `public: false`, `fileSizeLimit: 1073741824`, and the approved MIME list. Keys, tokens, and URLs are never logged or committed. Migrations 047 and 048 only verify the bucket contract and never write or comment on the Supabase-managed `storage.buckets` table.

The database runner requires both `BRANCH_BASELINE_APPLY=1` and the confirmation string. It pins the project ref to `jxbzuezrymhxwvdejohw`, validates either the direct hostname or the Session Pooler username/port identity, and rejects `main`, `master`, non-feature/fix refs, the Production ref `ezmdkwgziyencejfevso`, and the diagnostic Staging ref `sgonaqeefshtdakmggvm`. Before applying SQL, it rejects any existing base table in `public` and refuses if any known business table contains rows. No secret value is printed.

Each historical SQL file is executed in the explicit manifest order. The manifest ends at `064_project_classification_foundation.sql`, contains no `065` file, contains no `2026...` Production migration, and does not modify migration history. Any failure stops the workflow and leaves the database for operator review; the runner does not attempt destructive cleanup or a retry.

## Operational boundaries

The baseline job is intentionally manual because Supabase's automatic GitHub deployment DAG owns its migration step. The PR contract job remains automatically testable and never receives environment secrets. The baseline job is safe only for the fixed isolated validation target when the operator has configured `supabase-preview` with required reviewers and no competing automatic migration run is racing the bootstrap. It is not a replacement for Production deployment and must not be dispatched from `main` or pointed at a Production/Staging URL.

No Production connection string, Supabase access token, or secret value is committed to the repository. The `pull_request` contract job has no environment and no secrets. Only the manually dispatched baseline job references `supabase-preview`; its environment policy must be configured by an administrator with required reviewers and the `fix/supabase-branch-baseline` branch restriction. The workflow has read-only GitHub contents permission.

## Local and CI verification

The Vitest contracts verify the pinned validation ref, protected refs, explicit confirmation, unexpected public-table refusal, non-empty database refusal, lack of migration-history edits, 065 exclusion, and the secret-free pull-request contract. `tests/hosted-storage-baseline.test.ts` additionally verifies that migrations 047/048 contain no managed-bucket DML, the Storage API path is idempotent and private, 1 GiB remains the required limit, tenant policies on `storage.objects` remain present, and local compatibility rejects reintroduced migration DML on `design-knowledge`.

This remediation deliberately does not rerun the current Preview. The global Storage upload limit therefore remains `NOT LIVE-VERIFIED`; if the Management API reports less than 1073741824 bytes during the next clean retest, the workflow stops with `NEEDS CONFIGURATION` and does not bypass or raise that global limit automatically.

## References

[1]: https://supabase.com/docs/guides/deployment/branching/github-integration "Supabase GitHub integration"
[2]: https://supabase.com/docs/guides/deployment/branching "Supabase Branching"
[3]: https://supabase.com/docs/guides/deployment/database-migrations "Supabase Database Migrations"
[4]: https://supabase.com/blog/branching-2-0 "Supabase Branching 2.0"
[5]: https://supabase.com/docs/guides/storage/buckets/creating-buckets "Supabase Creating Buckets"
[6]: https://supabase.com/docs/reference/javascript/file-buckets-updatebucket "Supabase JavaScript updateBucket"
[7]: https://supabase.com/docs/guides/storage/uploads/file-limits "Supabase Storage File Limits"
