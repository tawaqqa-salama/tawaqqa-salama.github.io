-- Restore إدارة المشتريات in role permissions and admin page_modules
-- Safe to re-run.

UPDATE public.roles
SET permissions = '["dept.projects","dept.hr","dept.procurement","me.page"]'::jsonb
WHERE code = 'engineer'
  AND is_system = true;

UPDATE public.roles
SET permissions = '["dept.marketing","dept.sales","dept.procurement","me.page"]'::jsonb
WHERE code = 'sales'
  AND is_system = true;

-- Ensure admin personal launcher includes procurement when page_modules is a non-empty list
UPDATE public.users
SET page_modules = (
  SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb)
  FROM (
    SELECT value FROM jsonb_array_elements_text(COALESCE(page_modules, '[]'::jsonb)) AS value
    UNION
    SELECT 'procurement'
  ) AS merged
)
WHERE role_code = 'admin'
  AND deleted_at IS NULL
  AND NOT (COALESCE(page_modules, '[]'::jsonb) ? 'procurement');
