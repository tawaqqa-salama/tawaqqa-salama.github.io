# Supabase fresh-branch baseline

## Purpose

This repository stores the historical DDS SQL chain under `scripts/sql/`, while Supabase's GitHub integration automatically discovers migrations only under the configured `supabase/migrations` directory. The repository does not place the historical `000–064` chain in that production migration directory. This document defines the explicit, manually authorized workflow for preparing an isolated, empty Supabase preview branch before any branch-specific work.

The workflow intentionally does **not** execute `scripts/sql/065_pr_a1_security_remediation.sql` or any timestamped Production migration. It also never edits `supabase_migrations.schema_migrations`.

## Verified Supabase contract

Supabase's official GitHub integration documentation states that migrations in the `migrations` subdirectory of the configured Supabase working directory are run automatically. Supabase branches are data-less, and the deployment process has a migration step that can block later steps when it fails. Supabase's database migration documentation states that applied versions are tracked per database in `supabase_migrations.schema_migrations` and that migration files are applied in version order.

Because this repository's historical SQL is under `scripts/sql/`, the baseline is not silently injected into the automatic production migration path. The new workflow is therefore `workflow_dispatch` only, and it runs only after the operator has selected an isolated preview-branch database connection.

## Safe execution model

The operator provisions or identifies a dedicated, data-less Supabase preview branch and stores its **direct** database URL as the `SUPABASE_BRANCH_DATABASE_URL` secret in the GitHub environment named `supabase-preview`. The URL must expose the preview project reference as `db.<preview-ref>.supabase.co`; pooler URLs are rejected because their host does not prove the target project reference.

The operator then dispatches `.github/workflows/supabase-branch-baseline.yml` with the feature/fix Git ref, the preview project reference, and the exact confirmation string `CREATE_FRESH_BRANCH_BASELINE`. The workflow checks out the requested branch and invokes `scripts/bootstrap-fresh-supabase-branch.mjs`.

The runner requires both `BRANCH_BASELINE_APPLY=1` and the confirmation string. It rejects `main`, `master`, non-feature/fix refs, the Production ref `ezmdkwgziyencejfevso`, and the diagnostic Staging ref `sgonaqeefshtdakmggvm`. Before applying SQL, it checks a fixed list of business tables and refuses if any existing table contains rows. Missing tables are treated as empty; existing tables must have zero rows.

Each historical SQL file is executed in the explicit manifest order. The manifest ends at `064_project_classification_foundation.sql`, contains no `065` file, contains no `2026...` Production migration, and does not modify migration history. Any failure stops the workflow and leaves the database for operator review; the runner does not attempt destructive cleanup or a retry.

## Operational boundaries

This workflow is intentionally manual because Supabase's automatic GitHub deployment DAG owns its migration step. It is safe for a preview branch only when the selected database is already provisioned as an isolated target and the operator can ensure that no competing automatic migration run is racing the bootstrap. It is not a replacement for Production deployment and must not be dispatched from `main` or pointed at a Production/Staging URL.

No Production connection string, Supabase access token, or secret value is committed to the repository. No workflow is triggered by `pull_request`, `push`, or `main`. The workflow has read-only GitHub contents permission and uses an environment secret for the preview database URL.

## Local and CI verification

The Vitest contract in `tests/supabase-branch-baseline.test.ts` verifies the manifest boundary, protected refs, explicit confirmation, non-empty database refusal, lack of migration-history edits, and manual-only workflow trigger. The repository's existing local runner remains separate and is not invoked by the new workflow.

A real database rebuild requires a local PostgreSQL/Supabase runtime or an isolated preview database. This sandbox does not have `psql`, `postgres`, `supabase`, or Docker installed, so this task can validate the runner's safety contract and repository manifest locally but cannot honestly claim a live fresh-Postgres rebuild without connecting to an isolated database supplied by the operator.

## References

[1]: https://supabase.com/docs/guides/deployment/branching/github-integration "Supabase GitHub integration"
[2]: https://supabase.com/docs/guides/deployment/branching "Supabase Branching"
[3]: https://supabase.com/docs/guides/deployment/database-migrations "Supabase Database Migrations"
[4]: https://supabase.com/blog/branching-2-0 "Supabase Branching 2.0"
