import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const migration = read('scripts/sql/058_project_identity_foundation.sql');
const stage6aGate = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const stage6b1Schema = read('scripts/sql/056_stage6b_project_correspondences_schema.sql');
const stage6b2Rpcs = read('scripts/sql/057_stage6b_correspondence_persistence_rpcs.sql');
const projectRoute = read('app/projects/file/page.tsx');
const engineeringLiveStore = read('lib/projects/engineering-live-store.ts');

describe('IDENTITY-1 project identity foundation contract', () => {
  it('creates an explicit primary engineering mapping without imposing UNIQUE(projects.client_id)', () => {
    expect(migration).toContain('CREATE TABLE public.primary_engineering_project_mappings');
    expect(migration).toContain('client_id uuid PRIMARY KEY');
    expect(migration).toContain('project_id uuid NOT NULL UNIQUE');
    expect(migration).toContain('FOREIGN KEY (project_id, client_id)');
    expect(migration).toContain('REFERENCES public.projects(id, client_id)');
    expect(migration).not.toContain('ADD CONSTRAINT projects_client_id_key');
    expect(migration).not.toContain('UNIQUE (client_id)');
  });

  it('uses the approved global calendar-year PRJ code format and technical project name', () => {
    expect(migration).toContain('CREATE TABLE public.project_code_year_sequences');
    expect(migration).toContain('calendar_year integer PRIMARY KEY');
    expect(migration).toContain("CHECK (project_code ~ '^PRJ-[0-9]{4}-[0-9]{6}$')");
    expect(migration).toContain("format('PRJ-%s-%s', v_calendar_year, lpad(v_sequence_value::text, 6, '0'))");
    expect(migration).toContain("format('مشروع هندسي — %s', v_project_code)");
    expect(migration).not.toContain('client.business_name');
    expect(migration).not.toContain('client.name');
  });

  it('allocates code numbers server-side atomically without MAX()+1 or a browser-supplied identity', () => {
    const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.ensure_or_resolve_engineering_project_for_client(');
    const resolver = migration.slice(start);

    expect(resolver).toContain('FOR UPDATE;');
    expect(resolver).toContain('UPDATE public.project_code_year_sequences');
    expect(resolver).toContain('last_value = last_value + 1');
    expect(resolver).toContain('WHEN unique_violation THEN');
    expect(resolver).toContain('pg_advisory_xact_lock(hashtext(p_client_id::text))');
    expect(resolver).not.toMatch(/SELECT\s+MAX\s*\(/i);
    expect(resolver).not.toContain('p_project_id');
    expect(resolver).not.toContain('p_project_code');
    expect(resolver).not.toContain('INSERT INTO public.projects (\n    id');
  });

  it('resolves an existing mapping before any eligibility or sequence allocation, making retry idempotent', () => {
    const resolver = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.ensure_or_resolve_engineering_project_for_client(')
    );
    const existingLookup = resolver.indexOf('FROM public.primary_engineering_project_mappings AS m');
    const engineeringGate = resolver.indexOf('FROM public.project_engineering_live AS pel');
    const sequenceAllocation = resolver.indexOf('v_calendar_year := EXTRACT(YEAR FROM CURRENT_DATE)::integer');

    expect(existingLookup).toBeGreaterThan(-1);
    expect(engineeringGate).toBeGreaterThan(existingLookup);
    expect(sequenceAllocation).toBeGreaterThan(engineeringGate);
    expect(resolver).toContain('IF FOUND THEN');
    expect(resolver).toContain('RETURN QUERY\n    SELECT v_existing_project_id, p_client_id, v_project_code;');
  });

  it('creates identity only for a tenant-owned client with canonical engineering state', () => {
    const resolver = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.ensure_or_resolve_engineering_project_for_client(')
    );

    expect(resolver).toContain('IF auth.uid() IS NULL THEN');
    expect(resolver).toContain('v_company_id := public.current_app_company_id();');
    expect(resolver).toContain('public.is_platform_admin()');
    expect(resolver).toContain("'PROJECT_IDENTITY_CLIENT_NOT_FOUND_OR_FORBIDDEN'");
    expect(resolver).toContain('FROM public.project_engineering_live AS pel');
    expect(resolver).toContain("'PROJECT_IDENTITY_ENGINEERING_STATE_REQUIRED'");
  });

  it('uses a SECURITY DEFINER resolver with safe search_path and least-privilege execution', () => {
    expect(migration).toContain('LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = pg_catalog, public');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.ensure_or_resolve_engineering_project_for_client(uuid) FROM PUBLIC;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.ensure_or_resolve_engineering_project_for_client(uuid) FROM anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.ensure_or_resolve_engineering_project_for_client(uuid) TO authenticated;');
  });

  it('hardens projects to tenant SELECT only and keeps mapping reads tenant-scoped', () => {
    expect(migration).toContain('REVOKE ALL ON public.projects FROM authenticated;');
    expect(migration).toContain('GRANT SELECT ON public.projects TO authenticated;');
    expect(migration).toContain('CREATE POLICY projects_tenant_select');
    expect(migration).toContain('FOR SELECT\n  TO authenticated');
    expect(migration).not.toContain('FOR ALL\n  TO authenticated');
    expect(migration).toContain('REVOKE ALL ON public.primary_engineering_project_mappings FROM authenticated;');
    expect(migration).toContain('GRANT SELECT ON public.primary_engineering_project_mappings TO authenticated;');
    expect(migration).toContain('CREATE POLICY primary_engineering_project_mappings_tenant_select');
    expect(migration).toContain('GRANT ALL ON public.projects TO service_role;');
  });

  it('preserves existing correspondence, workflow, route, and canonical-engineering contracts', () => {
    expect(stage6b1Schema).toContain('FOREIGN KEY (project_id, client_id)');
    expect(stage6b2Rpcs).toContain('CREATE OR REPLACE FUNCTION public.create_project_correspondence_draft(');
    expect(stage6b2Rpcs).toContain('p.id = p_project_id');
    expect(stage6aGate).toContain("v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')");
    expect(projectRoute).toContain('const full = await fetchClientById(id);');
    expect(projectRoute).toContain('preferredStage={preferredStage}');
    expect(engineeringLiveStore).toContain('loadEngineeringLive(client.id)');
    expect(migration).not.toContain('project_engineering_live\n  SET');
    expect(migration).not.toContain('transition_project_engineering_stage');
    expect(migration).not.toContain('storage.objects');
  });
});
