-- DDS v1.0 — الباب ٦ هيكل المشروع
-- مشروع → مبنى → طابق → منطقة → غرفة → أنظمة السلامة → معدات → مرفقات

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  -- Canonical project identity uses public.clients.id (uuid). Legacy text
  -- client references remain on older non-identity tables; project identity and
  -- Stage 6B contracts require this column to be UUID-compatible.
  client_id uuid,
  project_code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'جديد',
  pipeline_stage text DEFAULT 'projects',
  start_date date,
  end_date date,
  assigned_engineer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  license_number text,
  license_expiry_date date,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  archived_at timestamptz,
  UNIQUE (company_id, project_code)
);

CREATE TABLE IF NOT EXISTS public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  building_code text NOT NULL,
  name text NOT NULL,
  building_type_id uuid REFERENCES public.ref_building_types(id) ON DELETE SET NULL,
  activity_type_id uuid REFERENCES public.ref_activity_types(id) ON DELETE SET NULL,
  floors_count integer,
  basement_floors integer DEFAULT 0,
  land_area numeric,
  building_area numeric,
  height_m numeric,
  occupancy_load integer,
  address text,
  gps_lat numeric,
  gps_lng numeric,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz,
  UNIQUE (project_id, building_code)
);

CREATE TABLE IF NOT EXISTS public.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  floor_code text NOT NULL,
  name text NOT NULL,
  floor_number integer,
  area_m2 numeric,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (building_id, floor_code)
);

CREATE TABLE IF NOT EXISTS public.zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  floor_id uuid NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  zone_code text NOT NULL,
  name text NOT NULL,
  zone_type text,
  area_m2 numeric,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (floor_id, zone_code)
);

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  room_code text NOT NULL,
  name text NOT NULL,
  room_type text,
  area_m2 numeric,
  occupancy integer,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (zone_id, room_code)
);

CREATE TABLE IF NOT EXISTS public.safety_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  building_id uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES public.floors(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  system_code text NOT NULL,
  system_category text NOT NULL CHECK (system_category IN ('fire_suppression', 'fire_alarm', 'smoke_control', 'emergency_lighting', 'egress', 'other')),
  name text NOT NULL,
  standard_ref text,
  status text DEFAULT 'مقترح',
  notes text,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  safety_system_id uuid NOT NULL REFERENCES public.safety_systems(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  equipment_code text NOT NULL,
  name text NOT NULL,
  manufacturer_id uuid REFERENCES public.ref_manufacturers(id) ON DELETE SET NULL,
  model text,
  quantity numeric DEFAULT 1,
  unit_id uuid REFERENCES public.ref_units(id) ON DELETE SET NULL,
  specs jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'مخطط',
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id text,
  visit_number text,
  visit_date timestamptz NOT NULL DEFAULT now(),
  visit_type text,
  engineer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text DEFAULT 'مجدولة',
  summary text,
  notes text,
  gps_lat numeric,
  gps_lng numeric,
  version_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.visit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES public.site_visits(id) ON DELETE CASCADE,
  related_entity_type text,
  related_entity_id uuid,
  note_text text NOT NULL,
  severity text DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_projects_company ON public.projects(company_id);
CREATE INDEX IF NOT EXISTS idx_buildings_project ON public.buildings(project_id);
CREATE INDEX IF NOT EXISTS idx_floors_building ON public.floors(building_id);
CREATE INDEX IF NOT EXISTS idx_zones_floor ON public.zones(floor_id);
CREATE INDEX IF NOT EXISTS idx_rooms_zone ON public.rooms(zone_id);
CREATE INDEX IF NOT EXISTS idx_safety_systems_project ON public.safety_systems(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_system ON public.equipment(safety_system_id);
CREATE INDEX IF NOT EXISTS idx_visits_project ON public.site_visits(project_id);
