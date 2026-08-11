/**
 * SECURITY DEFINER hardening migration regressions (20260812).
 * Static checks only — does not execute SQL against Supabase.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIG = join(
  process.cwd(),
  'scripts/sql/20260812_security_definer_hardening.sql'
);

describe('20260812 SECURITY DEFINER hardening', () => {
  const sql = readFileSync(MIG, 'utf8');

  it('exists and never creates open RLS policies or drops functions', () => {
    expect(sql.length).toBeGreaterThan(500);
    expect(sql).not.toMatch(
      /CREATE\s+POLICY[\s\S]{0,200}USING\s*\(\s*true\s*\)/i
    );
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it('locks search_path on session helpers and live RPCs', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.current_app_company_id[\s\S]*?SET search_path = pg_catalog, public/
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.current_app_user_id[\s\S]*?SET search_path = pg_catalog, public/
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.is_platform_admin[\s\S]*?SET search_path = pg_catalog, public/
    );
    expect(sql).toMatch(/assert_client_tenant_access/);
    expect(sql).toMatch(/SET search_path TO pg_catalog, public/);
  });

  it('adds tenant guards to merge/save/slim/stage5 RPCs used by the app', () => {
    for (const name of [
      'merge_project_engineering_patch',
      'merge_supervision_report_json',
      'save_project_engineering_data',
      'slim_project_engineering_data_urls',
      'save_stage5_live_bundle',
      'save_project_engineering_live',
      'save_stage4_live_bundle',
    ]) {
      expect(sql, name).toContain(name);
    }
    expect(sql).toMatch(
      /merge_project_engineering_patch[\s\S]*?PERFORM public\.assert_client_tenant_access\(p_client_id\)/
    );
    expect(sql).toMatch(
      /save_stage5_live_bundle[\s\S]*?PERFORM public\.assert_client_tenant_access\(p_client_id\)/
    );
    expect(sql).toMatch(/tenant_isolation: client_id required/);
  });

  it('revokes anon/PUBLIC and keeps authenticated for user RPCs; server-only for provision_employee_auth', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION %s FROM anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO service_role/);
    expect(sql).toMatch(/provision_employee_auth/);
    expect(sql).toMatch(/allow_auth := fn <> 'provision_employee_auth'/);
  });

  it('handles optional Advisor helpers not present in repo SQL', () => {
    expect(sql).toContain('client_belongs_to_current_company');
    expect(sql).toContain('project_belongs_to_current_company');
  });
});

describe('App RPC usages still point at hardened function names', () => {
  it('browser live-store modules call expected RPC names', () => {
    const files = [
      'lib/projects/engineering-live-store.ts',
      'lib/projects/stage4-live-store.ts',
      'lib/projects/stage5-live-store.ts',
      'lib/projects/save-report-pdf.ts',
      'lib/projects/save-supervision-report.ts',
    ];
    const blob = files.map((f) => readFileSync(join(process.cwd(), f), 'utf8')).join('\n');
    expect(blob).toContain("rpc('save_project_engineering_live'");
    expect(blob).toContain("rpc('save_stage4_live_bundle'");
    expect(blob).toContain("rpc('save_stage5_live_bundle'");
    expect(blob).toContain("rpc('merge_project_engineering_patch'");
    expect(blob).toContain("rpc('merge_supervision_report_json'");
    expect(blob).toContain("rpc('save_project_engineering_data'");
    expect(blob).toContain("rpc('slim_project_engineering_data_urls'");
  });
});
