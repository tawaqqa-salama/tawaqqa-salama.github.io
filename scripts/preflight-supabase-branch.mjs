import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  assertNoUnexpectedPublicTables,
  assertSafePreflightTarget,
} from './branch-baseline-policy.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const PREFLIGHT_READ_ONLY_QUERIES = Object.freeze([
  'SELECT current_database() AS current_database',
  'SELECT current_user AS current_user',
  'SELECT session_user AS session_user',
  `SELECT count(*)::int AS public_table_count
   FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_type = 'BASE TABLE'`,
]);

export function getPreflightConfig(env = process.env) {
  return {
    databaseUrl: env.SUPABASE_BRANCH_DATABASE_URL ?? '',
    targetRef: env.GITHUB_REF_NAME ?? env.SUPABASE_TARGET_GIT_REF ?? '',
    projectRef: env.SUPABASE_PROJECT_ID ?? '',
    allowPreflight: env.BRANCH_BASELINE_PREFLIGHT,
    dbPassword: env.SUPABASE_DB_PASSWORD ?? '',
    accessToken: env.SUPABASE_ACCESS_TOKEN ?? '',
  };
}

export function assertPreflightCredentialContract({
  projectRef,
  databaseUrl,
  dbPassword,
  accessToken,
}) {
  if (!projectRef) throw new Error('SUPABASE_PROJECT_ID is required.');
  if (!databaseUrl) throw new Error('SUPABASE_BRANCH_DATABASE_URL is required.');
  if (!dbPassword) throw new Error('SUPABASE_DB_PASSWORD is required.');
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is required.');
  if (!databaseUrl.includes(projectRef)) {
    throw new Error('Database URL does not contain the pinned validation project ref.');
  }
}

export async function readMigrationHistoryReadOnly(client) {
  const schemaExists = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = 'supabase_migrations'
    ) AS schema_exists
  `);
  if (!schemaExists.rows[0]?.schema_exists) {
    return [];
  }

  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'supabase_migrations'
        AND table_name = 'schema_migrations'
    ) AS table_exists
  `);
  if (!tableExists.rows[0]?.table_exists) {
    return [];
  }

  const result = await client.query(`
    SELECT version
    FROM supabase_migrations.schema_migrations
    ORDER BY version
  `);
  return result.rows.map((row) => String(row.version));
}

export async function runPreflight(env = process.env, dependencies = {}) {
  const config = getPreflightConfig(env);
  assertPreflightCredentialContract(config);
  const identity = assertSafePreflightTarget(config);

  const ClientImpl = dependencies.ClientImpl ?? pg.Client;
  const client = new ClientImpl({
    connectionString: config.databaseUrl,
    application_name: 'tawaqqa-fresh-branch-preflight',
  });
  await client.connect();

  try {
    const currentDatabase = await client.query(PREFLIGHT_READ_ONLY_QUERIES[0]);
    const currentUser = await client.query(PREFLIGHT_READ_ONLY_QUERIES[1]);
    const sessionUser = await client.query(PREFLIGHT_READ_ONLY_QUERIES[2]);
    const publicTableCountResult = await client.query(PREFLIGHT_READ_ONLY_QUERIES[3]);
    const migrationHistory = await readMigrationHistoryReadOnly(client);

    const publicTableNames = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    assertNoUnexpectedPublicTables(publicTableNames.rows.map((row) => row.table_name));

    const report = {
      targetProjectRef: config.projectRef,
      targetGitRef: identity.targetRef,
      currentDatabase: currentDatabase.rows[0]?.current_database ?? '',
      currentUser: currentUser.rows[0]?.current_user ?? '',
      sessionUser: sessionUser.rows[0]?.session_user ?? '',
      connectionType: identity.connectionType,
      poolerIdentity: identity.databaseHost,
      publicTableCount: Number(publicTableCountResult.rows[0]?.public_table_count ?? 0),
      migrationHistory,
    };

    console.log(`Preflight verified validation Supabase project ref ${report.targetProjectRef} for Git ref ${report.targetGitRef}.`);
    console.log(`Preflight same-connection identity: database=${report.currentDatabase}, current_user=${report.currentUser}, session_user=${report.sessionUser}, connection_type=${report.connectionType}, pooler_identity=${report.poolerIdentity}.`);
    console.log(`Preflight public_table_count=${report.publicTableCount}.`);
    console.log(`Preflight migration_history=${report.migrationHistory.length === 0 ? 'EMPTY' : report.migrationHistory.join(',')}.`);

    return report;
  } finally {
    await client.end();
  }
}

if (path.resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  await runPreflight();
}
