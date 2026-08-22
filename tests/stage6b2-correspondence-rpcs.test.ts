import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const migration = read('scripts/sql/057_stage6b_correspondence_persistence_rpcs.sql');
const stage6aContract = read('lib/projects/stage6-contract.ts');
const stage6aGate = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const stage6b1Schema = read('scripts/sql/056_stage6b_project_correspondences_schema.sql');

describe('Stage 6B-2 server-controlled correspondence RPC contract', () => {
  it('adds only the five schema fields proven necessary for Stage 6A-equivalent approval and concurrency', () => {
    for (const field of [
      'ADD COLUMN recipient_name text',
      'ADD COLUMN responsible_engineer_name text',
      'ADD COLUMN responsible_manager_name text',
      'ADD COLUMN lock_version integer NOT NULL DEFAULT 0',
      'ADD COLUMN approved_at timestamptz',
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain('CHECK (lock_version >= 0)');
    expect(migration).toContain("document_status = 'approved' AND approved_at IS NOT NULL");
    expect(migration).toContain("document_status <> 'approved' AND approved_at IS NULL");
    expect(migration).not.toContain('ADD COLUMN details');
    expect(migration).not.toContain('ADD COLUMN sent_at');
    expect(migration).not.toContain('ADD COLUMN received_at');
    expect(migration).not.toContain('ADD COLUMN response_at');
  });

  it('proves the otherwise missing Stage 6A responsibility and recipient fields are required before relational approval', () => {
    for (const requiredField of [
      'delivery.delivered_to',
      'delivery.safety_engineer_name',
      'delivery.manager_name',
      'cover.addressee',
      'cover.safety_engineer_name',
      'cover.manager_name',
    ]) {
      expect(stage6aContract).toContain(requiredField);
    }
    for (const relationalField of [
      'v_current.recipient_name',
      'v_current.responsible_engineer_name',
      'v_current.responsible_manager_name',
    ]) {
      expect(migration).toContain(relationalField);
    }
  });

  it('creates only outgoing drafts through a server-validated project/client tenant pair', () => {
    const createStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.create_project_correspondence_draft(');
    const updateStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.update_project_correspondence_draft(');
    const createSignature = migration.slice(createStart, updateStart);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_project_correspondence_draft(');
    expect(migration).toContain('IF auth.uid() IS NULL THEN');
    expect(migration).toContain('v_company_id := public.current_app_company_id();');
    expect(migration).toContain('JOIN public.clients AS c ON c.id = p.client_id');
    expect(migration).toContain('p.id = p_project_id');
    expect(migration).toContain('p.client_id = p_client_id');
    expect(migration).toContain('c.company_id = v_company_id');
    expect(migration).toContain("v_type NOT IN ('engineering_delivery', 'cd_cover_letter')");
    expect(migration).toContain("IF v_direction <> 'outgoing' THEN");
    expect(migration).toContain("'PROJECT_CLIENT_MISMATCH'");
    expect(migration).toContain("'INVALID_CORRESPONDENCE_TYPE'");
    expect(migration).toContain("'INVALID_CORRESPONDENCE_DIRECTION'");
    expect(migration).toContain("'CORRESPONDENCE_INCOMPLETE'");
    expect(migration).toContain("'draft',\n    0,\n    NULL,");
    expect(createSignature).not.toMatch(/\bp_company_id\b/);
    expect(createSignature).not.toMatch(/\bp_tenant_id\b/);
  });

  it('does not let creation accept browser-supplied approved state, timestamps, or lock version', () => {
    const createStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.create_project_correspondence_draft(');
    const updateStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.update_project_correspondence_draft(');
    const createSignature = migration.slice(createStart, updateStart);

    expect(createSignature).not.toContain('p_document_status');
    expect(createSignature).not.toContain('p_approved_at');
    expect(createSignature).not.toContain('p_lock_version');
    expect(createSignature).toContain('created_at,\n    updated_at');
    expect(createSignature).toContain('now(),\n    now()');
  });

  it('updates only editable content with an expected version and atomically increments lock_version', () => {
    const updateStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.update_project_correspondence_draft(');
    const approveStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_project_correspondence(');
    const updateFunction = migration.slice(updateStart, approveStart);

    expect(updateFunction).toContain('p_expected_lock_version integer');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text) FROM PUBLIC;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text) FROM anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.update_project_correspondence_draft(uuid, integer, text, text, text, date, text) TO authenticated;');
    expect(updateFunction).toContain('FOR UPDATE OF pc;');
    expect(updateFunction).toContain("v_current.document_status = 'approved'");
    expect(updateFunction).toContain("p_expected_lock_version <> v_current.lock_version");
    expect(updateFunction).toContain("v_status NOT IN ('draft', 'preparing', 'ready')");
    expect(updateFunction).toContain('lock_version = lock_version + 1');
    expect(updateFunction).toContain('AND lock_version = p_expected_lock_version');
    expect(updateFunction).toContain("'CORRESPONDENCE_STALE_VERSION'");
    expect(updateFunction).toContain("'CORRESPONDENCE_NOT_EDITABLE'");
    for (const immutableParameter of [
      'p_project_id',
      'p_client_id',
      'p_correspondence_type',
      'p_direction',
      'p_approved_at',
    ]) {
      expect(updateFunction).not.toContain(immutableParameter);
    }
  });

  it('approves only a current ready record that satisfies the Stage 6A-equivalent relational contract', () => {
    const approveStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.approve_project_correspondence(');
    const approveFunction = migration.slice(approveStart);

    expect(approveFunction).toContain('p_expected_lock_version integer');
    expect(approveFunction).toContain('FOR UPDATE OF pc;');
    expect(approveFunction).toContain("v_current.document_status <> 'ready'");
    for (const field of [
      'v_current.subject',
      'v_current.reference_number',
      'v_current.correspondence_date IS NULL',
      'v_current.recipient_name',
      'v_current.responsible_engineer_name',
      'v_current.responsible_manager_name',
    ]) {
      expect(approveFunction).toContain(field);
    }
    expect(approveFunction).toContain("document_status = 'approved'");
    expect(approveFunction).toContain('approved_at = now()');
    expect(approveFunction).toContain('lock_version = lock_version + 1');
    expect(approveFunction).toContain("'CORRESPONDENCE_INCOMPLETE'");
    expect(approveFunction).toContain("'CORRESPONDENCE_STALE_VERSION'");
  });

  it('uses SECURITY DEFINER RPCs with a locked search path and least-privilege execution grants', () => {
    expect(migration.match(/LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = pg_catalog, public/g)).toHaveLength(3);
    for (const functionName of [
      'create_project_correspondence_draft',
      'update_project_correspondence_draft',
      'approve_project_correspondence',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${functionName}`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${functionName}`);
    }
    expect(migration).not.toContain('TO authenticated, service_role');
  });

  it('preserves direct authenticated write denial from Stage 6B-1 and adds no DELETE path', () => {
    expect(stage6b1Schema).toContain('GRANT SELECT ON public.project_correspondences TO authenticated');
    expect(stage6b1Schema).toContain('REVOKE INSERT, UPDATE, DELETE ON public.project_correspondences FROM authenticated');
    expect(stage6b1Schema).toContain('FOR SELECT');
    expect(stage6b1Schema).not.toContain('FOR ALL');
    expect(migration).not.toContain('CREATE OR REPLACE FUNCTION public.delete_project_correspondence');
    expect(migration).not.toContain('CREATE POLICY');
    expect(migration).not.toContain('GRANT INSERT ON public.project_correspondences TO authenticated');
    expect(migration).not.toContain('GRANT UPDATE ON public.project_correspondences TO authenticated');
    expect(migration).not.toContain('GRANT DELETE ON public.project_correspondences TO authenticated');
  });

  it('does not adopt legacy singletons, change Stage 6A, or alter the Stage 7 gate', () => {
    expect(migration).not.toContain('project_engineering_live');
    expect(migration).not.toContain('legacy');
    expect(migration).not.toContain('payload');
    expect(migration).not.toContain('transition_project_engineering_stage');
    expect(stage6aGate).toContain("v_target NOT IN ('supervision_visits', 'transmittals', 'final_report')");
    expect(stage6aGate).toContain("'{workflow,active_stage}'");
  });

  it('does not introduce Stage 6B-3 or later relational workspace features', () => {
    for (const forbiddenTable of [
      'correspondence_recipients',
      'correspondence_attachments',
      'correspondence_replies',
      'correspondence_revisions',
      'correspondence_events',
      'correspondence_snapshots',
    ]) {
      expect(migration).not.toContain(`CREATE TABLE public.${forbiddenTable}`);
    }
    expect(migration).not.toContain('storage.objects');
    expect(migration).not.toContain('project_report');
  });
});
