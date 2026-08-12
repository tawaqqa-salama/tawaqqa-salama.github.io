-- ============================================================================
-- Final open-policy audit (read-only)
-- Lists leftover Allow-public / USING(true) policies and tables
-- with RLS disabled that still grant authenticated/anon access.
-- ============================================================================

-- 1) Open / overly permissive policies
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual AS using_expr,
  with_check AS with_check_expr
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND (
    policyname LIKE 'Allow public %'
    OR policyname LIKE '%_all'
    OR policyname LIKE '%_open%'
    OR COALESCE(qual, '') IN ('true', '(true)')
    OR COALESCE(with_check, '') IN ('true', '(true)')
  )
ORDER BY schemaname, tablename, policyname;

-- 2) Tables in public with RLS disabled (potential exposure if GRANTed)
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;

-- 3) users policies (expect insert_admin/update_admin, not *_tenant write)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY policyname;
