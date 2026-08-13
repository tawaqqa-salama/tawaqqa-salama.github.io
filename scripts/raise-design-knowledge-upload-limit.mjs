#!/usr/bin/env node
/**
 * Raise design-knowledge bucket file_size_limit (fixes TUS HTTP 413).
 *
 * Env (one of):
 *   DATABASE_URL
 *   or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *     (uses PostgREST management is NOT enough for storage.buckets —
 *      prefer DATABASE_URL; service role can call storage API list only)
 *
 * Prefer: DATABASE_URL=postgresql://... npm run storage:raise-design-knowledge-limit
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const LIMIT = 1073741824; // 1 GiB

async function main() {
  const cs = (process.env.DATABASE_URL || '').trim();
  if (!cs) {
    console.error(
      JSON.stringify({
        ok: false,
        error:
          'DATABASE_URL required to UPDATE storage.buckets.file_size_limit. Also raise Global file size limit in Supabase Dashboard → Storage → Settings (≥ 1 GiB).',
        sql: `UPDATE storage.buckets SET public=false, file_size_limit=${LIMIT} WHERE id='design-knowledge';`,
      })
    );
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const before = await client.query(
      `SELECT id, file_size_limit, public FROM storage.buckets WHERE id = 'design-knowledge'`
    );
    if (!before.rows.length) {
      throw new Error('design-knowledge bucket missing — apply 047 first');
    }
    await client.query(
      `UPDATE storage.buckets
       SET public = false, file_size_limit = $1
       WHERE id = 'design-knowledge'`,
      [LIMIT]
    );
    const after = await client.query(
      `SELECT id, file_size_limit, public FROM storage.buckets WHERE id = 'design-knowledge'`
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          before: before.rows[0],
          after: after.rows[0],
          note: 'If TUS still returns 413, raise Global file size limit in Dashboard → Storage → Settings',
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message || String(err) }));
  process.exit(1);
});
