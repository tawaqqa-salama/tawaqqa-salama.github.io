import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const migration = read('scripts/sql/053_engineering_workflow_transition_rpc.sql');
const modal = read('components/projects/ProjectReportModal.tsx');
const wrapper = read('lib/projects/engineering-workflow-transition.ts');
const businessPipeline = read('lib/types/client.ts');

describe('Phase 5A dedicated engineering workflow transition RPC', () => {
  it('keeps business pipeline values separate from engineering workflow targets', () => {
    expect(businessPipeline).toContain("'marketing' | 'sales' | 'finance' | 'projects' | 'completed'");
    expect(migration).not.toMatch(/UPDATE\s+public\.clients\s+SET\s+pipeline_stage/i);
    expect(migration).not.toContain('p_pipeline_stage');
    expect(migration).toContain("'supervision_visits'");
    expect(migration).toContain("'transmittals'");
  });

  it('uses a dedicated least-permissive RPC and trusted persisted engineering state', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.transition_project_engineering_stage');
    expect(migration).toContain('v_company_id := public.current_app_company_id();');
    expect(migration).toContain('FROM public.clients AS c');
    expect(migration).toContain('c.id = p_client_id');
    expect(migration).toContain('c.company_id = v_company_id');
    expect(migration).toContain("MESSAGE = 'PROJECT_NOT_FOUND_OR_FORBIDDEN'");
    expect(migration.indexOf('v_company_id := public.current_app_company_id();')).toBeLessThan(
      migration.indexOf('FROM public.project_engineering_live')
    );
    expect(migration).toContain('FROM public.project_engineering_live');
    expect(migration).toContain("v_payload->'field_visits'");
    expect(migration).toContain("'{supervision_report,status}'");
    expect(migration).toContain("'{technical_notes,status}'");
    expect(migration).toContain("'INVALID_STAGE_TRANSITION'");
    expect(migration).toContain("'PREVIOUS_STAGE_NOT_APPROVED'");
  });

  it('specifies every Stage 5 server blocker and validates before state mutation', () => {
    for (const code of [
      'NO_FIELD_VISITS',
      'FIELD_VISIT_NOT_APPROVED',
      'SUPERVISION_NOT_APPROVED',
      'TECHNICAL_NOTES_NOT_APPROVED',
      'OPEN_CRITICAL_DEFICIENCY',
      'OPEN_HIGH_DEFICIENCY',
    ]) {
      expect(migration).toContain(`'${code}'`);
    }
    expect(migration).toContain("MESSAGE = 'WORKFLOW_STAGE_BLOCKED'");
    expect(migration.indexOf('IF jsonb_array_length(v_blockers) > 0')).toBeLessThan(
      migration.indexOf('UPDATE public.field_visit_reports')
    );
  });

  it('preserves authentication and tenant protections without changing RLS or tables', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.transition_project_engineering_stage');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.transition_project_engineering_stage');
    expect(migration).not.toMatch(/CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+POLICY|DROP\s+POLICY/i);
  });

  it('routes the Stage 5 approval action through the dedicated RPC while ordinary saves retain their existing path', () => {
    expect(wrapper).toContain("supabase.rpc('transition_project_engineering_stage'");
    expect(modal).toContain("transitionProjectEngineeringStage(client.id, 'transmittals')");
    expect(modal).toContain('const pipelineStage = client.pipeline_stage === \'completed\' ? \'completed\' : \'projects\';');
    expect(modal).toContain('saveReportData(client.id, stamped');
  });
});
