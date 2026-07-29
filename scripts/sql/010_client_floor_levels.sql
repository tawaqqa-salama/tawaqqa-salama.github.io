-- Client floor levels detail (per-floor area + repeat count for typical floors)

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS floor_levels jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clients.floor_levels IS
  'تفصيل الأدوار: [{id,label,kind,area_m2,repeat_count}] — المتكرر صف واحد مع عدد التكرار';
