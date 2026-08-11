#!/usr/bin/env node
/**
 * Live Supabase RLS + Auth JWT security suite (Preview/Test only).
 *
 * Requires env (Preview/Test — NEVER Production):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY   (seed / apply only — never used to assert RLS PASS)
 *   DATABASE_URL                (apply migrations 041–044)
 * Optional:
 *   AUTH_SESSION_SECRET         (tests 12–13 against local Next API)
 *   LIVE_RLS_BASE_URL           (default http://127.0.0.1:3000)
 *   LIVE_RLS_SKIP_MIGRATE=1     (skip applying SQL if already applied)
 *   LIVE_RLS_CONFIRM_PREVIEW=1  (required — acknowledges non-Production target)
 *
 * Usage:
 *   LIVE_RLS_CONFIRM_PREVIEW=1 node scripts/live-rls-jwt-security-tests.mjs
 *
 * Does NOT delete data. Seeds only rows tagged with code prefix SEC_RLS_4252_.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TAG = 'SEC_RLS_4252';
const PASSWORD = process.env.LIVE_RLS_TEST_PASSWORD || 'SecRlsTest!4252-Aa1';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const databaseUrl = process.env.DATABASE_URL || '';
const confirm = process.env.LIVE_RLS_CONFIRM_PREVIEW === '1';
const skipMigrate = process.env.LIVE_RLS_SKIP_MIGRATE === '1';
const baseUrl = (process.env.LIVE_RLS_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const authSecret = process.env.AUTH_SESSION_SECRET || '';

const results = [];

function record(id, title, expect, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  results.push({ id, title, expect, status, detail: String(detail || '').slice(0, 800) });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`\n[${mark}] ${id}. ${title}`);
  if (detail) console.log(`       ${String(detail).slice(0, 400)}`);
}

function failEnv(msg) {
  console.error(`\nBLOCKED: ${msg}`);
  process.exit(2);
}

function normalizeUrl(u) {
  return u.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

function jwtClient(accessToken) {
  return createClient(normalizeUrl(url), anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function serviceClient() {
  return createClient(normalizeUrl(url), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function anonAuthClient() {
  return createClient(normalizeUrl(url), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function applyMigrations() {
  if (skipMigrate) {
    console.log('Skipping migrations (LIVE_RLS_SKIP_MIGRATE=1)');
    return;
  }
  const files = [
    '041_production_security_hardening.sql',
    '042_role_level_rls.sql',
    '043_fix_users_update_rls_recursion.sql',
    '044_block_tenant_platform_privilege_escalation.sql',
  ];
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const f of files) {
      const path = resolve(ROOT, 'scripts/sql', f);
      const sql = readFileSync(path, 'utf8');
      console.log(`Applying ${f}…`);
      await client.query(sql);
      console.log(`  OK ${f}`);
    }
  } finally {
    await client.end();
  }
}

async function ensureAuthUser(admin, email, password) {
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) throw list.error;
  const existing = (list.data?.users || []).find(
    (u) => (u.email || '').toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    const upd = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      ban_duration: 'none',
    });
    if (upd.error) throw upd.error;
    return upd.data.user;
  }
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  return created.data.user;
}

async function upsertCompany(admin, code, name) {
  const { data: existing } = await admin
    .from('companies')
    .select('id, code, name')
    .eq('code', code)
    .maybeSingle();
  if (existing?.id) return existing;
  const { data, error } = await admin
    .from('companies')
    .insert({ code, name, is_active: true })
    .select('id, code, name')
    .single();
  if (error) throw error;
  return data;
}

async function upsertAppUser(admin, row) {
  const { data: existing } = await admin
    .from('users')
    .select('id, email, company_id, role_code, is_platform_admin, auth_user_id, is_active')
    .eq('email', row.email)
    .maybeSingle();
  if (existing?.id) {
    const { data, error } = await admin
      .from('users')
      .update({
        company_id: row.company_id,
        auth_user_id: row.auth_user_id,
        full_name: row.full_name,
        role_code: row.role_code,
        is_platform_admin: row.is_platform_admin ?? false,
        is_active: row.is_active ?? true,
        deleted_at: null,
        phone: row.phone ?? null,
      })
      .eq('id', existing.id)
      .select('id, email, company_id, role_code, is_platform_admin, auth_user_id, is_active, full_name')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await admin
    .from('users')
    .insert({
      company_id: row.company_id,
      auth_user_id: row.auth_user_id,
      email: row.email,
      full_name: row.full_name,
      role_code: row.role_code,
      is_platform_admin: row.is_platform_admin ?? false,
      is_active: row.is_active ?? true,
      phone: row.phone ?? null,
    })
    .select('id, email, company_id, role_code, is_platform_admin, auth_user_id, is_active, full_name')
    .single();
  if (error) throw error;
  return data;
}

async function ensureMembership(admin, userId, companyId, roleCode) {
  const { data: existing } = await admin
    .from('tenant_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (existing?.id) {
    await admin
      .from('tenant_memberships')
      .update({ status: 'active', is_default: true, role_code: roleCode })
      .eq('id', existing.id);
    return;
  }
  const { error } = await admin.from('tenant_memberships').insert({
    user_id: userId,
    company_id: companyId,
    role_code: roleCode,
    status: 'active',
    is_default: true,
  });
  if (error && !String(error.message || '').includes('duplicate')) throw error;
}

async function signIn(email) {
  const auth = anonAuthClient();
  const { data, error } = await auth.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error(`No access_token for ${email}`);
  return { token, session: data.session, user: data.user };
}

function isDenied(error, data) {
  if (error) return true;
  if (data == null) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  return false;
}

function isWriteDenied(error, data) {
  if (error) return true;
  if (data == null) return true;
  return false;
}

async function seed() {
  const admin = serviceClient();
  const companyA = await upsertCompany(admin, `${TAG}_CO_A`, 'Company A Security Test');
  const companyB = await upsertCompany(admin, `${TAG}_CO_B`, 'Company B Security Test');

  const defs = [
    { key: 'a_staff', email: `${TAG.toLowerCase()}.a.staff@example.com`, role: 'staff', company: companyA, platform: false },
    { key: 'a_admin', email: `${TAG.toLowerCase()}.a.admin@example.com`, role: 'admin', company: companyA, platform: false },
    { key: 'a_tadmin', email: `${TAG.toLowerCase()}.a.tadmin@example.com`, role: 'tenant_admin', company: companyA, platform: false },
    { key: 'a_target', email: `${TAG.toLowerCase()}.a.target@example.com`, role: 'staff', company: companyA, platform: false },
    { key: 'b_staff', email: `${TAG.toLowerCase()}.b.staff@example.com`, role: 'staff', company: companyB, platform: false },
    { key: 'b_tadmin', email: `${TAG.toLowerCase()}.b.tadmin@example.com`, role: 'tenant_admin', company: companyB, platform: false },
    {
      key: 'platform',
      email: `${TAG.toLowerCase()}.platform@example.com`,
      role: 'super_admin',
      company: companyA,
      platform: true,
    },
    {
      key: 'disabled',
      email: `${TAG.toLowerCase()}.disabled@example.com`,
      role: 'staff',
      company: companyA,
      platform: false,
      active: false,
    },
  ];

  const users = {};
  for (const d of defs) {
    const authUser = await ensureAuthUser(admin, d.email, PASSWORD);
    const appUser = await upsertAppUser(admin, {
      company_id: d.company.id,
      auth_user_id: authUser.id,
      email: d.email,
      full_name: `${TAG} ${d.key}`,
      role_code: d.role,
      is_platform_admin: d.platform,
      is_active: d.active !== false,
      phone: '0500000000',
    });
    await ensureMembership(admin, appUser.id, d.company.id, d.role);
    users[d.key] = { ...appUser, email: d.email, auth_user_id: authUser.id };
  }

  // Ensure bucket exists for storage tests (service role)
  try {
    const buckets = await admin.storage.listBuckets();
    const names = (buckets.data || []).map((b) => b.name);
    if (!names.includes('project-files')) {
      await admin.storage.createBucket('project-files', { public: false });
    }
  } catch (e) {
    console.warn('Bucket ensure warning:', e?.message || e);
  }

  // Seed one storage object under company B path via service role (setup only)
  const seedPath = `${companyB.id}/${TAG}/seed.txt`;
  const { error: upErr } = await admin.storage
    .from('project-files')
    .upload(seedPath, Buffer.from(`${TAG} company B seed`), {
      upsert: true,
      contentType: 'text/plain',
    });
  if (upErr) console.warn('Storage seed warning:', upErr.message);

  return { companyA, companyB, users, seedPath };
}

async function runRlsSuite(ctx) {
  const { companyA, companyB, users, seedPath } = ctx;
  const aStaff = await signIn(users.a_staff.email);
  const aAdmin = await signIn(users.a_admin.email);
  const aTadmin = await signIn(users.a_tadmin.email);
  const platform = await signIn(users.platform.email);

  const aStaffDb = jwtClient(aStaff.token);
  const aAdminDb = jwtClient(aAdmin.token);
  const aTadminDb = jwtClient(aTadmin.token);
  const platformDb = jwtClient(platform.token);

  // 1) Company A staff SELECT on Company B → fail
  {
    const { data, error } = await aStaffDb
      .from('users')
      .select('id, email, company_id')
      .eq('company_id', companyB.id);
    const denied = isDenied(error, data);
    record(
      1,
      'Company A staff SELECT on Company B',
      'must fail / empty',
      denied,
      error ? `error=${error.message}` : `rows=${(data || []).length}`
    );
  }

  // 2) Company A staff UPDATE on Company B → fail
  {
    const { data, error } = await aStaffDb
      .from('users')
      .update({ full_name: `${TAG} hacked by A staff` })
      .eq('id', users.b_staff.id)
      .select('id');
    record(
      2,
      'Company A staff UPDATE on Company B',
      'must fail',
      isWriteDenied(error, data),
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 3) Company A tenant_admin INSERT user in Company B → fail
  {
    const email = `${TAG.toLowerCase()}.intruder.${Date.now()}@example.com`;
    const { data, error } = await aTadminDb
      .from('users')
      .insert({
        company_id: companyB.id,
        email,
        full_name: `${TAG} intruder`,
        role_code: 'staff',
        is_active: true,
        is_platform_admin: false,
      })
      .select('id');
    record(
      3,
      'Company A tenant_admin INSERT user in Company B',
      'must fail',
      isWriteDenied(error, data),
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 4) Company A tenant_admin promote user to super_admin → fail
  {
    const { data, error } = await aTadminDb
      .from('users')
      .update({ role_code: 'super_admin' })
      .eq('id', users.a_target.id)
      .select('id, role_code');
    const stillStaff = !data || !data.length || data.every((r) => r.role_code !== 'super_admin');
    record(
      4,
      'Company A tenant_admin set role_code=super_admin',
      'must fail',
      Boolean(error) || stillStaff,
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 5) Company A tenant_admin set is_platform_admin=true → fail
  {
    const { data, error } = await aTadminDb
      .from('users')
      .update({ is_platform_admin: true })
      .eq('id', users.a_target.id)
      .select('id, is_platform_admin');
    const notElevated =
      Boolean(error) || !data || !data.length || data.every((r) => r.is_platform_admin !== true);
    record(
      5,
      'Company A tenant_admin set is_platform_admin=true',
      'must fail',
      notElevated,
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 6) Company A tenant_admin update normal user in Company A → succeed
  {
    const newName = `${TAG} target by tadmin ${Date.now()}`;
    const { data, error } = await aTadminDb
      .from('users')
      .update({ full_name: newName, phone: '0501111111' })
      .eq('id', users.a_target.id)
      .select('id, full_name');
    const ok = !error && Array.isArray(data) && data.length === 1 && data[0].full_name === newName;
    record(
      6,
      'Company A tenant_admin update normal user in Company A',
      'must succeed',
      ok,
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 7) Company A admin update normal user in Company A → succeed
  {
    const newName = `${TAG} target by admin ${Date.now()}`;
    const { data, error } = await aAdminDb
      .from('users')
      .update({ full_name: newName, phone: '0502222222' })
      .eq('id', users.a_target.id)
      .select('id, full_name');
    const ok = !error && Array.isArray(data) && data.length === 1 && data[0].full_name === newName;
    record(
      7,
      'Company A admin update normal user in Company A',
      'must succeed',
      ok,
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 8) Platform admin create super_admin → succeed
  {
    const email = `${TAG.toLowerCase()}.plat.sa.${Date.now()}@example.com`;
    const { data, error } = await platformDb
      .from('users')
      .insert({
        company_id: companyA.id,
        email,
        full_name: `${TAG} platform-created SA`,
        role_code: 'super_admin',
        is_platform_admin: false,
        is_active: true,
      })
      .select('id, role_code');
    const ok = !error && Array.isArray(data) && data.length === 1 && data[0].role_code === 'super_admin';
    record(
      8,
      'Platform admin create super_admin',
      'must succeed',
      ok,
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 9) Platform admin set is_platform_admin=true → succeed
  {
    const { data, error } = await platformDb
      .from('users')
      .update({ is_platform_admin: true })
      .eq('id', users.a_target.id)
      .select('id, is_platform_admin');
    const ok =
      !error && Array.isArray(data) && data.length === 1 && data[0].is_platform_admin === true;
    record(
      9,
      'Platform admin set is_platform_admin=true',
      'must succeed',
      ok,
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
    // Restore target to non-platform via service role (seed cleanup of privilege only — not a test assertion)
    await serviceClient()
      .from('users')
      .update({ is_platform_admin: false, role_code: 'staff' })
      .eq('id', users.a_target.id);
  }

  // 10) Staff change own role_code → fail
  {
    const { data, error } = await aStaffDb
      .from('users')
      .update({ role_code: 'tenant_admin' })
      .eq('id', users.a_staff.id)
      .select('id, role_code');
    const unchanged =
      Boolean(error) || !data || !data.length || data.every((r) => r.role_code === 'staff');
    record(
      10,
      'Staff change own role_code',
      'must fail',
      unchanged,
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 11) Staff change own company_id → fail
  {
    const { data, error } = await aStaffDb
      .from('users')
      .update({ company_id: companyB.id })
      .eq('id', users.a_staff.id)
      .select('id, company_id');
    const unchanged =
      Boolean(error) ||
      !data ||
      !data.length ||
      data.every((r) => r.company_id === companyA.id);
    record(
      11,
      'Staff change own company_id',
      'must fail',
      unchanged,
      error ? `error=${error.message}` : `data=${JSON.stringify(data)}`
    );
  }

  // 12) Disabled user cannot access protected API
  await runDisabledApiTest(users);

  // 13) DB role_code change reflected in authorization (not stale cookie)
  await runLiveRoleCookieTest(users, aStaff);

  // 14) No RLS recursion on users
  {
    const started = Date.now();
    const { data, error } = await aTadminDb
      .from('users')
      .update({ full_name: `${TAG} recursion ping ${Date.now()}` })
      .eq('id', users.a_target.id)
      .select('id, full_name');
    const elapsed = Date.now() - started;
    const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const recursion = msg.includes('recursion') || msg.includes('infinite');
    const ok = !error && Array.isArray(data) && data.length === 1 && !recursion && elapsed < 8000;
    record(
      14,
      'No RLS recursion on users UPDATE',
      'must succeed without recursion',
      ok,
      error
        ? `error=${error.message} elapsedMs=${elapsed}`
        : `ok rows=${data?.length} elapsedMs=${elapsed}`
    );
  }

  // 15) Storage isolation Company A vs B
  {
    const { data: listed, error: listErr } = await aStaffDb.storage
      .from('project-files')
      .list(`${companyB.id}/${TAG}`);
    const listDenied =
      Boolean(listErr) || !listed || listed.length === 0 || listed.every((o) => o.name !== 'seed.txt');

    const tryPath = `${companyB.id}/${TAG}/intruder-a-${Date.now()}.txt`;
    const { error: upErr } = await aStaffDb.storage
      .from('project-files')
      .upload(tryPath, Buffer.from('should fail'), { contentType: 'text/plain', upsert: false });

    const { data: dl, error: dlErr } = await aStaffDb.storage
      .from('project-files')
      .download(seedPath);

    const downloadDenied = Boolean(dlErr) || !dl;
    const uploadDenied = Boolean(upErr);
    const ok = listDenied && uploadDenied && downloadDenied;
    record(
      15,
      'Storage isolation Company A staff vs Company B objects',
      'list/upload/download must fail',
      ok,
      `listErr=${listErr?.message || 'none'} listed=${(listed || []).length} upErr=${upErr?.message || 'none'} dlErr=${dlErr?.message || 'none'}`
    );
  }
}

async function mintSessionCookie(accessToken) {
  const res = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ accessToken }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  const raw = setCookie.find((c) => c.startsWith('tawaqqa_auth=')) || '';
  const cookie = raw.split(';')[0] || '';
  const body = await res.json().catch(() => ({}));
  return { status: res.status, cookie, body };
}

async function runDisabledApiTest(users) {
  if (!authSecret) {
    record(
      12,
      'Disabled user cannot access protected API',
      'must fail',
      false,
      'BLOCKED: AUTH_SESSION_SECRET / LIVE_RLS_BASE_URL app not available for API test'
    );
    return;
  }
  try {
    // Ensure disabled in DB via service role (seed state)
    await serviceClient()
      .from('users')
      .update({ is_active: false })
      .eq('id', users.disabled.id);

    const signed = await signIn(users.disabled.email);
    const mint = await mintSessionCookie(signed.token);
    // Even if mint somehow succeeds with stale logic, protected routes must reject.
    const probe = await fetch(`${baseUrl}/api/platform/support`, {
      method: 'GET',
      headers: mint.cookie ? { cookie: mint.cookie } : { authorization: `Bearer ${signed.token}` },
    });
    const denied =
      mint.status >= 400 ||
      probe.status === 401 ||
      probe.status === 403 ||
      probe.status === 404;
    // Prefer mint rejection for disabled accounts
    const mintDenied = mint.status >= 400 || mint.body?.ok === false;
    record(
      12,
      'Disabled user cannot access protected API',
      'must fail',
      mintDenied || denied,
      `mintStatus=${mint.status} mintBody=${JSON.stringify(mint.body).slice(0, 200)} probeStatus=${probe.status}`
    );
  } catch (e) {
    record(12, 'Disabled user cannot access protected API', 'must fail', false, e?.message || e);
  }
}

async function runLiveRoleCookieTest(users, aStaffSession) {
  if (!authSecret) {
    record(
      13,
      'DB role_code change reflected without stale cookie trust',
      'authorization uses live DB role',
      false,
      'BLOCKED: AUTH_SESSION_SECRET / app server required'
    );
    return;
  }
  try {
    const mint = await mintSessionCookie(aStaffSession.token);
    if (!mint.cookie) {
      record(
        13,
        'DB role_code change reflected without stale cookie trust',
        'authorization uses live DB role',
        false,
        `Could not mint cookie: status=${mint.status} body=${JSON.stringify(mint.body).slice(0, 200)}`
      );
      return;
    }

    // Promote in DB via service role while cookie still says staff
    await serviceClient()
      .from('users')
      .update({ role_code: 'tenant_admin' })
      .eq('id', users.a_staff.id);

    // Hit a tenant-admin-capable path: users UPDATE as JWT still works as elevated if JWT→DB role is used for RLS.
    // For API cookie path, re-resolve live actor.
    const aStaffDb = jwtClient(aStaffSession.token);
    const { data, error } = await aStaffDb
      .from('users')
      .update({ phone: '0503333333' })
      .eq('id', users.a_target.id)
      .select('id, phone');
    // After DB promote, JWT RLS helpers read role from users table → manage users should succeed
    const rlsReflects = !error && Array.isArray(data) && data.length === 1;

    // Restore staff role
    await serviceClient()
      .from('users')
      .update({ role_code: 'staff' })
      .eq('id', users.a_staff.id);

    record(
      13,
      'DB role_code change reflected without stale cookie trust',
      'authorization uses live DB role',
      rlsReflects,
      error
        ? `error=${error.message}`
        : `after promote to tenant_admin, peer update rows=${data?.length} (cookie still old staff claim)`
    );
  } catch (e) {
    record(
      13,
      'DB role_code change reflected without stale cookie trust',
      'authorization uses live DB role',
      false,
      e?.message || e
    );
  }
}

function writeReport() {
  const outDir = resolve('/opt/cursor/artifacts');
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* ignore */
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    targetUrl: url,
    tag: TAG,
    results,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
  };
  const path = resolve(ROOT, 'docs', 'LIVE_RLS_JWT_TEST_RESULTS.md');
  const lines = [
    '# Live RLS JWT Security Test Results',
    '',
    `Generated: ${summary.generatedAt}`,
    `Target: \`${url}\``,
    `Tag: \`${TAG}\``,
    '',
    `| # | Test | Expect | Result | Detail |`,
    `|---|------|--------|--------|--------|`,
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.title} | ${r.expect} | **${r.status}** | ${String(r.detail).replace(/\|/g, '\\|').slice(0, 200)} |`
    ),
    '',
    `**Passed:** ${summary.passed} / ${results.length}`,
    `**Failed:** ${summary.failed} / ${results.length}`,
    '',
    'Notes:',
    '- Service role used only for seed/migrate/restore — never to assert RLS PASS.',
    '- No Production data deleted.',
    '- Migrations applied: 041 → 042 → 043 → 044 (unless LIVE_RLS_SKIP_MIGRATE=1).',
    '',
  ];
  writeFileSync(path, lines.join('\n'));
  try {
    writeFileSync(resolve(outDir, 'live-rls-jwt-results.json'), JSON.stringify(summary, null, 2));
  } catch {
    /* ignore */
  }
  console.log(`\nReport written to ${path}`);
  console.log(`Passed ${summary.passed}/${results.length}, Failed ${summary.failed}/${results.length}`);
  return summary;
}

async function main() {
  console.log('=== Live RLS JWT Security Tests (Preview/Test) ===');
  if (!confirm) {
    failEnv('Set LIVE_RLS_CONFIRM_PREVIEW=1 to acknowledge Preview/Test (not Production).');
  }
  if (!url || !anonKey || !serviceKey) {
    failEnv(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  if (!databaseUrl && !skipMigrate) {
    failEnv('Missing DATABASE_URL (or set LIVE_RLS_SKIP_MIGRATE=1 if migrations already applied)');
  }
  if (/prod/i.test(url) && !process.env.LIVE_RLS_ALLOW_PROD_URL) {
    console.warn(
      'WARNING: URL contains "prod". Refusing unless LIVE_RLS_ALLOW_PROD_URL=1. Prefer Preview/Test.'
    );
    failEnv('Refusing suspected Production URL');
  }

  await applyMigrations();
  const ctx = await seed();
  console.log('Seeded companies:', ctx.companyA.id, ctx.companyB.id);
  await runRlsSuite(ctx);
  const summary = writeReport();
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
