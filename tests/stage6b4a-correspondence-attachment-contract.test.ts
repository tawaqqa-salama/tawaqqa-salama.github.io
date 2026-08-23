import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

const migration = read('scripts/sql/062_stage6b4a_correspondence_attachment_contract.sql');
const correspondenceSchema = read('scripts/sql/056_stage6b_project_correspondences_schema.sql');
const stage6Gate = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const approvalOrchestration = read('scripts/sql/061_stage6b3d1_approval_orchestration.sql');
const officialTypes = read('lib/types/project-reports.ts');

function between(source: string, start: string, end?: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : source.length;
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('Stage 6B-4A correspondence attachment metadata contract', () => {
  const prepare = between(
    migration,
    'CREATE OR REPLACE FUNCTION public.prepare_project_correspondence_attachment(',
    'CREATE OR REPLACE FUNCTION public.finalize_project_correspondence_attachment('
  );
  const finalize = between(
    migration,
    'CREATE OR REPLACE FUNCTION public.finalize_project_correspondence_attachment(',
    'CREATE OR REPLACE FUNCTION public.request_delete_project_correspondence_attachment('
  );
  const deleteRequest = between(
    migration,
    'CREATE OR REPLACE FUNCTION public.request_delete_project_correspondence_attachment(',
    'CREATE OR REPLACE FUNCTION public.list_project_correspondence_attachments('
  );
  const list = between(
    migration,
    'CREATE OR REPLACE FUNCTION public.list_project_correspondence_attachments(',
    'REVOKE ALL ON FUNCTION public.stage6b4_document_permission_allowed'
  );

  it('adds one additive metadata table, not the historical generic attachments table or correspondence JSON', () => {
    expect(migration).toContain('CREATE TABLE public.project_correspondence_attachments');
    expect(migration).not.toContain('CREATE TABLE public.attachments');
    expect(migration).not.toContain('ALTER TABLE public.project_correspondences\n  ADD COLUMN');
    expect(migration).not.toContain('project_correspondences JSON');
  });

  it('defines exactly the justified metadata, lifecycle, audit, and cleanup fields', () => {
    for (const field of [
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid()',
      'correspondence_id uuid NOT NULL',
      'project_id uuid NOT NULL',
      'client_id uuid NOT NULL',
      'display_file_name text NOT NULL',
      'mime_type text NOT NULL',
      'size_bytes bigint NOT NULL',
      "storage_bucket text NOT NULL DEFAULT 'project-files'",
      'storage_path text NOT NULL',
      "state text NOT NULL DEFAULT 'pending_upload'",
      'idempotency_key text NOT NULL',
      'created_at timestamptz NOT NULL DEFAULT now()',
      'created_by uuid NOT NULL',
      'cleanup_requested_at timestamptz',
      'cleanup_attempts integer NOT NULL DEFAULT 0',
      'last_cleanup_error text',
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).not.toContain('category text');
    expect(migration).not.toContain('checksum');
  });

  it('enforces exact correspondence/project/client integrity and safe restrictive deletion', () => {
    expect(correspondenceSchema).toContain('FOREIGN KEY (project_id, client_id)');
    expect(migration).toContain('UNIQUE (id, project_id, client_id)');
    expect(migration).toContain('FOREIGN KEY (correspondence_id, project_id, client_id)');
    expect(migration).toContain('REFERENCES public.project_correspondences(id, project_id, client_id)');
    expect(migration).toContain('ON DELETE RESTRICT');
  });

  it('makes project-files the only attachment bucket and permits no arbitrary bucket', () => {
    expect(migration).toContain("CHECK (storage_bucket = 'project-files')");
    expect(prepare).not.toContain('p_storage_bucket');
    expect(prepare).not.toContain('p_storage_path');
    expect(prepare).toContain("'project-files',");
  });

  it('defines only the approved metadata lifecycle states and rejects invalid state data', () => {
    expect(migration).toContain("CHECK (state IN ('pending_upload', 'available', 'pending_delete', 'cleanup_required'))");
    expect(prepare).toContain("'pending_upload'");
    expect(deleteRequest).toContain("state = 'pending_delete'");
    expect(finalize).toContain("v_attachment.state <> 'pending_upload'");
    expect(finalize).toContain("'ATTACHMENT_INVALID_STATE'");
  });

  it('enforces 20 MiB and MIME metadata allowlists while deferring byte proof to the broker', () => {
    expect(migration).toContain('size_bytes <= 20971520');
    expect(prepare).toContain('p_size_bytes > 20971520');
    expect(migration).toContain("mime_type IN ('application/pdf', 'image/jpeg', 'image/png')");
    expect(prepare).toContain("p_mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png')");
    expect(migration).toContain("'ATTACHMENT_INVALID_SIZE'");
    expect(migration).toContain("'ATTACHMENT_INVALID_MIME'");
    expect(finalize).toContain("'ATTACHMENT_FINALIZATION_REQUIRES_TRUSTED_BROKER'");
    expect(finalize).not.toContain("state = 'available'");
  });

  it('blocks traversal/control filename input while preserving Arabic display names and server-normalizing object names only', () => {
    expect(migration).toContain("position('/' IN display_file_name) = 0");
    expect(migration).toContain("position(E'\\\\' IN display_file_name) = 0");
    expect(migration).toContain("position('..' IN display_file_name) = 0");
    expect(migration).toContain("display_file_name !~ '[[:cntrl:]]'");
    expect(prepare).toContain("v_safe_name := left(regexp_replace(lower(p_display_file_name), '[^a-z0-9._-]+'" );
    expect(migration).not.toContain('ascii(display_file_name)');
    expect(migration).toContain("'ATTACHMENT_INVALID_FILENAME'");
  });

  it('uses correspondence-scoped idempotency, rejects divergent replay, and serializes the max-ten limit', () => {
    expect(migration).toContain('UNIQUE (correspondence_id, idempotency_key)');
    expect(prepare).toContain('FOR UPDATE OF pc;');
    expect(prepare).toContain('FOR UPDATE;');
    expect(prepare).toContain('v_existing.created_by IS DISTINCT FROM auth.uid()');
    expect(prepare).toContain("'ATTACHMENT_IDEMPOTENCY_CONFLICT'");
    expect(prepare).toContain("a.state IN ('pending_upload', 'available', 'pending_delete', 'cleanup_required')");
    expect(prepare).toContain('IF v_active_count >= 10 THEN');
    expect(prepare).toContain("'ATTACHMENT_LIMIT_REACHED'");
  });

  it('constructs a unique client-prefixed path only from server-resolved IDs and never returns it to the client', () => {
    expect(prepare).toContain("'%s/correspondences/%s/attachments/%s/%s'");
    expect(prepare).toContain('v_correspondence.client_id');
    expect(prepare).toContain('v_correspondence.id');
    expect(prepare).toContain('v_attachment_id');
    expect(prepare).not.toContain("'storage_path', v_storage_path");
    expect(list).not.toContain('a.storage_path');
    expect(list).not.toContain('a.idempotency_key');
  });

  it('derives tenant and project ownership through the exact correspondence and primary identity mapping', () => {
    for (const functionBody of [prepare, finalize, deleteRequest, list]) {
      expect(functionBody).toContain('auth.uid() IS NULL');
      expect(functionBody).toContain('public.current_app_company_id()');
      expect(functionBody).toContain('public.clients AS c');
      expect(functionBody).toContain('public.primary_engineering_project_mappings AS m');
      expect(functionBody).toContain('m.project_id = pc.project_id');
    }
    const prepareSignature = between(prepare, 'CREATE OR REPLACE FUNCTION', 'RETURNS jsonb');
    expect(prepareSignature).not.toContain('p_company_id');
    expect(prepareSignature).not.toContain('p_project_id');
    expect(prepareSignature).not.toContain('p_client_id');
  });

  it('uses the existing server RBAC model, including explicit document permissions and user grants', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.stage6b4_document_permission_allowed(');
    expect(migration).toContain("p_permission = 'documents.view'");
    expect(migration).toContain("p_permission = 'documents.upload'");
    expect(migration).toContain("p_permission = 'documents.delete'");
    expect(prepare).toContain("public.stage6b4_document_permission_allowed('documents.upload')");
    expect(finalize).toContain("public.stage6b4_document_permission_allowed('documents.upload')");
    expect(deleteRequest).toContain("public.stage6b4_document_permission_allowed('documents.delete')");
    expect(list).toContain("public.stage6b4_document_permission_allowed('documents.view')");
    expect(migration).toContain("MESSAGE = 'DOCUMENT_PERMISSION_DENIED'");
  });

  it('makes all approved correspondence mutations immutable while preserving metadata read', () => {
    for (const functionBody of [prepare, finalize, deleteRequest]) {
      expect(functionBody).toContain("v_correspondence.document_status = 'approved'");
      expect(functionBody).toContain("'CORRESPONDENCE_APPROVED_IMMUTABLE'");
    }
    expect(list).not.toContain("document_status = 'approved'");
    expect(migration).not.toContain('UPDATE public.project_correspondences');
    expect(migration).not.toContain('transition_project_engineering_stage');
  });

  it('uses metadata-first delete request without claiming cross-system Storage deletion', () => {
    expect(deleteRequest).toContain("state = 'pending_delete'");
    expect(deleteRequest).toContain('cleanup_requested_at = now()');
    expect(deleteRequest).toContain('cleanup_attempts = cleanup_attempts + 1');
    expect(deleteRequest).not.toContain('DELETE FROM storage.objects');
    expect(deleteRequest).not.toContain('.remove(');
    expect(migration).toContain('it does not delete a Storage object');
  });

  it('enables RLS with RPC-only mutation authority and least-privilege function grants', () => {
    expect(migration).toContain('ALTER TABLE public.project_correspondence_attachments ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('REVOKE ALL ON public.project_correspondence_attachments FROM authenticated;');
    expect(migration).not.toContain('CREATE POLICY project_correspondence_attachments');
    expect(migration.match(/LANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = pg_catalog, public/g)?.length).toBeGreaterThanOrEqual(4);
    const permissionHelper = between(
      migration,
      'CREATE OR REPLACE FUNCTION public.stage6b4_document_permission_allowed(',
      'CREATE OR REPLACE FUNCTION public.prepare_project_correspondence_attachment('
    );
    expect(permissionHelper).toContain('SECURITY DEFINER');
    expect(permissionHelper).toContain('SET search_path = pg_catalog, public');
    for (const functionName of [
      'prepare_project_correspondence_attachment',
      'finalize_project_correspondence_attachment',
      'request_delete_project_correspondence_attachment',
      'list_project_correspondence_attachments',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${functionName}`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${functionName}`);
    }
  });

  it('does not add UI, byte upload, signed URL, Storage policy, generic path signing, or legacy backfill', () => {
    expect(migration).not.toContain('CREATE POLICY');
    expect(migration).not.toContain('ALTER POLICY');
    expect(migration).not.toContain('storage.objects');
    expect(migration).not.toContain('createSignedUrl');
    expect(migration).not.toContain('/api/documents/signed-url');
    expect(migration).not.toContain('tenant-signed-url');
    expect(migration).not.toContain('INSERT INTO public.project_correspondence_attachments\nSELECT');
    expect(migration).not.toContain('FROM storage.objects');
    expect(migration).not.toContain('attachments_count');
    expect(migration).not.toContain('attachments_note');
    expect(migration).not.toContain('upload(');
  });

  it('keeps approved forms, PDFs, Stage 6 authority, and orchestration contracts unchanged', () => {
    expect(officialTypes).toContain('attachments_note?: string');
    expect(officialTypes).toContain('attachments_count?: number | string');
    expect(stage6Gate).toContain('transition_project_engineering_stage');
    expect(approvalOrchestration).toContain('approve_stage6_documents_and_transition');
    expect(migration).not.toContain('EngineeringDeliveryReport');
    expect(migration).not.toContain('CdCoverLetterReport');
    expect(migration).not.toContain('project_report');
    expect(migration).not.toContain('EngineeringDeliveryReport');
    expect(migration).not.toContain('CdCoverLetterReport');
  });
});
