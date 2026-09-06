import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const migration = read('scripts/sql/065_pr_a1_security_remediation.sql');
const b4a = read('scripts/sql/062_stage6b4a_correspondence_attachment_contract.sql');
const b4b = read('scripts/sql/063_stage6b4b_attachment_broker_finalization.sql');
const broker = read('supabase/functions/project-correspondence-attachment-broker/index.ts');
const approval = read('scripts/sql/061_stage6b3d1_approval_orchestration.sql');
const liveStore = read('scripts/sql/040_all_stages_engineering_live.sql');

const policyBlock = (source: string, name: string) => {
  const start = source.indexOf(`CREATE POLICY ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\n\nDROP POLICY IF EXISTS', start + 10);
  return source.slice(start, next === -1 ? source.length : next);
};

describe('PR-A1 security remediation', () => {
  it('closes the policyless RLS gap with the exact attachment ownership chain', () => {
    expect(migration).toContain('ALTER TABLE public.project_correspondence_attachments ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('CREATE POLICY project_correspondence_attachments_tenant_select');
    expect(migration).toContain('CREATE POLICY project_correspondence_attachments_tenant_insert');
    expect(migration).toContain('CREATE POLICY project_correspondence_attachments_tenant_update');
    expect(migration).toContain('CREATE POLICY project_correspondence_attachments_tenant_delete');
    for (const policy of ['select', 'insert', 'update', 'delete']) {
      const block = policyBlock(migration, `project_correspondence_attachments_tenant_${policy}`);
      expect(block).toContain('project_correspondences AS pc');
      expect(block).toContain('projects AS p');
      expect(block).toContain('clients AS c');
      expect(block).toContain('primary_engineering_project_mappings AS m');
      expect(block).toContain('c.company_id = public.current_app_company_id()');
      expect(block).toContain('pc.id = project_correspondence_attachments.correspondence_id');
      expect(block).toContain('pc.project_id = project_correspondence_attachments.project_id');
      expect(block).toContain('pc.client_id = project_correspondence_attachments.client_id');
    }
  });

  it('keeps authenticated direct table DML revoked and preserves broker RPC authority', () => {
    expect(migration).toContain('REVOKE ALL ON public.project_correspondence_attachments FROM authenticated;');
    expect(migration).toContain('GRANT ALL ON public.project_correspondence_attachments TO service_role;');
    expect(b4a).toContain('GRANT EXECUTE ON FUNCTION public.prepare_project_correspondence_attachment(uuid, text, text, bigint, text) TO authenticated;');
    expect(b4a).toContain('GRANT EXECUTE ON FUNCTION public.list_project_correspondence_attachments(uuid) TO authenticated;');
    expect(b4a).toContain('GRANT EXECUTE ON FUNCTION public.request_delete_project_correspondence_attachment(uuid) TO authenticated;');
    expect(b4b).toContain('GRANT EXECUTE ON FUNCTION public.finalize_project_correspondence_attachment(uuid, bigint, text, text) TO service_role;');
    expect(b4b).toContain('GRANT EXECUTE ON FUNCTION public.mark_project_correspondence_attachment_cleanup_required(uuid, text) TO service_role;');
    expect(broker).toContain("admin.rpc('finalize_project_correspondence_attachment'");
    expect(broker).not.toContain("supabase.from('project_correspondence_attachments').insert");
  });

  it('removes only the confirmed anonymous Storage grants and elevated authenticated table privileges', () => {
    expect(migration).toContain('REVOKE ALL ON storage.objects FROM anon;');
    expect(migration).toContain('REVOKE ALL ON storage.buckets FROM anon;');
    for (const table of ['clients', 'project_engineering_live', 'project_supervision_reports', 'report_pdf_snapshots']) {
      expect(migration).toContain(`REVOKE REFERENCES, TRIGGER, TRUNCATE ON public.${table} FROM authenticated;`);
    }
    expect(migration).not.toContain('ALTER TABLE storage.buckets');
    expect(migration).not.toContain('DROP BUCKET');
    expect(migration).not.toContain('DELETE FROM storage.objects');
    expect(migration).not.toContain('UPDATE storage.objects');
  });

  it('removes authenticated access to the obsolete B4A finalize overload', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid)');
    expect(migration).toContain('FROM authenticated;');
    expect(migration).toContain('FROM service_role;');
    expect(b4b).toContain("IF auth.role() <> 'service_role'");
  });

  it('documents individually reviewed SECURITY DEFINER entry points instead of bulk revocation', () => {
    for (const source of [approval, b4a, b4b]) {
      expect(source).toContain('SECURITY DEFINER');
      expect(source).toContain('SET search_path = pg_catalog, public');
    }
    expect(liveStore).toContain('SECURITY DEFINER');
    expect(liveStore).toContain('SET search_path = public');
    expect(liveStore).toContain('save_project_engineering_live');
    expect(approval).toContain('approve_stage6_documents_and_transition');
    expect(b4a).toContain('prepare_project_correspondence_attachment');
    expect(b4a).toContain('list_project_correspondence_attachments');
    expect(b4b).toContain('finalize_project_correspondence_attachment');
    expect(b4b).toContain('mark_project_correspondence_attachment_cleanup_required');
    expect(migration).not.toContain('REVOKE ALL ON FUNCTION public.save_project_engineering_live');
    expect(migration).not.toContain('REVOKE ALL ON FUNCTION public.approve_stage6_documents_and_transition');
  });

  it('does not introduce technical-report lifecycle, PDF, workflow, classification, or data backfill changes', () => {
    expect(migration).not.toContain('technical_report_revision');
    expect(migration).not.toContain('technical_report_artifact');
    expect(migration).not.toContain('CREATE TABLE public.technical');
    expect(migration).not.toContain('project_classification');
    expect(migration).not.toContain('transition_project_engineering_stage');
    expect(migration).not.toContain('approve_stage6_documents_and_transition');
    expect(migration).not.toContain('INSERT INTO public.project_correspondence_attachments\nSELECT');
    expect(migration).toContain('REVOKE ALL ON storage.objects FROM anon;');
  });
});
