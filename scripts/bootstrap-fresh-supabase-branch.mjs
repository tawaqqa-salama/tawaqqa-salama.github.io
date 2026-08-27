import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  BUSINESS_TABLES,
  HISTORICAL_BASELINE_MANIFEST,
  assertManifestDoesNotIncludeProductionMigrations,
  assertNoBusinessData,
  assertSafeTarget,
  resolveManifestPaths,
} from './branch-baseline-policy.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const databaseUrl = process.env.SUPABASE_BRANCH_DATABASE_URL ?? process.env.DATABASE_URL;
const targetRef = process.env.GITHUB_REF_NAME ?? process.env.SUPABASE_TARGET_GIT_REF;
const projectRef = process.env.SUPABASE_PROJECT_REF ?? '';

if (!databaseUrl) throw new Error('SUPABASE_BRANCH_DATABASE_URL is required.');
if (process.env.BRANCH_BASELINE_CONFIRM !== 'CREATE_FRESH_BRANCH_BASELINE') {
  throw new Error('BRANCH_BASELINE_CONFIRM=CREATE_FRESH_BRANCH_BASELINE is required.');
}

assertSafeTarget({
  allowApply: process.env.BRANCH_BASELINE_APPLY,
  targetRef,
  databaseUrl,
  projectRef,
});
assertManifestDoesNotIncludeProductionMigrations(HISTORICAL_BASELINE_MANIFEST);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.join(__dirname, 'sql');
const manifestPaths = resolveManifestPaths(sqlDir);

for (const filePath of manifestPaths) {
  await fs.access(filePath);
}

const client = new pg.Client({ connectionString: databaseUrl, application_name: 'tawaqqa-fresh-branch-baseline' });
await client.connect();

async function readBusinessTableCounts() {
  const rows = [];
  for (const tableName of BUSINESS_TABLES) {
    const existence = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
    if (!existence.rows[0]?.exists) {
      rows.push({ table_name: tableName, row_count: 0 });
      continue;
    }
    const result = await client.query(`SELECT count(*)::bigint AS row_count FROM public."${tableName}"`);
    rows.push({ table_name: tableName, row_count: result.rows[0]?.row_count ?? 0 });
  }
  return rows;
}

try {
  const counts = await readBusinessTableCounts();
  assertNoBusinessData(counts);
  console.log(`Verified fresh Supabase branch target ${projectRef || 'by database host'} for Git ref ${targetRef}.`);

  for (const [index, filePath] of manifestPaths.entries()) {
    const file = HISTORICAL_BASELINE_MANIFEST[index];
    process.stdout.write(`Applying ${file}... `);
    await client.query(await fs.readFile(filePath, 'utf8'));
    console.log('OK');
  }
  console.log(`Fresh branch baseline applied: ${HISTORICAL_BASELINE_MANIFEST.length} historical migrations (000–064).`);
  console.log('Migration 065 and timestamped Production migrations were intentionally not executed.');
} finally {
  await client.end();
}
