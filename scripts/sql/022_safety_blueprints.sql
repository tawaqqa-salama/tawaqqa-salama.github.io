-- Safety blueprint file slots metadata (logical keys stored also in project_engineering_data JSONB)
-- Optional attachments rows can reference these kinds via related_entity_type.

ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS blueprint_kind text;

COMMENT ON COLUMN public.attachments.blueprint_kind IS
  'architectural_base | fire_fighting_file | fire_alarm_file | life_safety_file';

CREATE INDEX IF NOT EXISTS idx_attachments_blueprint_kind
  ON public.attachments (blueprint_kind)
  WHERE blueprint_kind IS NOT NULL;
