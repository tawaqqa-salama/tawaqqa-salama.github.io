-- Fix: canceling statement due to statement timeout on clients.project_engineering_data
-- 1) Raise timeouts on lean merge RPCs
-- 2) One-shot slim of inline dataUrls that bloat JSONB TOAST
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.merge_project_engineering_patch(
  p_client_id uuid,
  p_patch jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Free/Pro projects often default to ~8s; fat JSONB TOAST rewrites need more headroom
  PERFORM set_config('statement_timeout', '180s', true);

  UPDATE public.clients
  SET
    project_engineering_data =
      COALESCE(project_engineering_data, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb),
    pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_supervision_report_json(
  p_client_id uuid,
  p_supervision jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '180s', true);

  UPDATE public.clients
  SET
    project_engineering_data =
      COALESCE(project_engineering_data, '{}'::jsonb)
      || jsonb_build_object('supervision_report', p_supervision),
    pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_project_engineering_data(
  p_client_id uuid,
  p_data jsonb,
  p_pipeline_stage text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('statement_timeout', '180s', true);

  UPDATE public.clients
  SET
    project_engineering_data = p_data,
    pipeline_stage = COALESCE(p_pipeline_stage, pipeline_stage),
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

-- Strip bulky inline data:image… URLs from JSONB (keep storagePath metadata).
-- Run once per project or for all clients after deploy.
CREATE OR REPLACE FUNCTION public.slim_project_engineering_data_urls(
  p_client_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
BEGIN
  PERFORM set_config('statement_timeout', '300s', true);

  WITH updated AS (
    UPDATE public.clients c
    SET
      project_engineering_data = regexp_replace(
        c.project_engineering_data::text,
        '"dataUrl"\s*:\s*"data:[^"]{2000,}"',
        '"dataUrl":null',
        'g'
      )::jsonb,
      updated_at = now()
    WHERE (p_client_id IS NULL OR c.id = p_client_id)
      AND c.project_engineering_data IS NOT NULL
      AND c.project_engineering_data::text LIKE '%data:image%'
    RETURNING 1
  )
  SELECT count(*)::integer INTO n FROM updated;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_project_engineering_patch(uuid, jsonb, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_supervision_report_json(uuid, jsonb, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_engineering_data(uuid, jsonb, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.slim_project_engineering_data_urls(uuid)
  TO anon, authenticated;

-- Optional one-shot cleanup for the whole tenants table (comment out if too heavy):
-- SELECT public.slim_project_engineering_data_urls(NULL);
