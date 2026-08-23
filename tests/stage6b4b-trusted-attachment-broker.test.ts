import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');
const migration = read('scripts/sql/063_stage6b4b_attachment_broker_finalization.sql');
const broker = read('supabase/functions/project-correspondence-attachment-broker/index.ts');
const config = read('supabase/config.toml');

describe('Stage 6B-4B trusted correspondence attachment broker', () => {
  it('adds only service-role finalization and cleanup compensation, without a Storage policy or workflow change', () => {
    expect(migration).toContain('ALTER TABLE public.project_correspondence_attachments');
    expect(migration).toContain('ADD COLUMN sha256_hex text');
    expect(migration).toContain('finalize_project_correspondence_attachment(');
    expect(migration).toContain('mark_project_correspondence_attachment_cleanup_required(');
    expect(migration).toContain("IF auth.role() <> 'service_role'");
    expect(migration).toContain('TRUSTED_BROKER_ONLY');
    expect(migration).not.toContain('storage.objects');
    expect(migration).not.toContain('CREATE POLICY');
    expect(migration).not.toContain('transition_project_engineering_stage');
    expect(migration).not.toContain('approve_stage6_documents_and_transition');
    expect(migration).not.toContain('EngineeringDeliveryReport');
    expect(migration).not.toContain('CdCoverLetterReport');
  });

  it('protects finalization with exact metadata, approved immutability, checksum, and least-privilege grants', () => {
    expect(migration).toContain("p_sha256_hex !~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("v_attachment.state <> 'pending_upload'");
    expect(migration).toContain('ATTACHMENT_FINALIZATION_MISMATCH');
    expect(migration).toContain("v_document_status = 'approved'");
    expect(migration).toContain('CORRESPONDENCE_APPROVED_IMMUTABLE');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.finalize_project_correspondence_attachment(uuid, bigint, text, text) TO service_role;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.finalize_project_correspondence_attachment(uuid, bigint, text, text) FROM authenticated;');
    expect(migration).toContain("SET search_path = pg_catalog, public");
  });

  it('uses a JWT-protected Edge Function and resolves identity and authorization server-side', () => {
    expect(config).toContain('[functions.project-correspondence-attachment-broker]');
    expect(config).toContain('verify_jwt = true');
    expect(broker).toContain("request.headers.get('authorization')");
    expect(broker).toContain('user.auth.getUser(token)');
    expect(broker).toContain(".from('users')");
    expect(broker).toContain(".from('clients')");
    expect(broker).toContain(".from('project_correspondences')");
    expect(broker).not.toContain('await request.json()');
    expect(broker).not.toContain("request.headers.get('x-company-id')");
    expect(broker).not.toContain("request.headers.get('x-project-id')");
    expect(broker).not.toContain("request.headers.get('x-client-id')");
    expect(broker).not.toContain("request.headers.get('x-correspondence-id')");
  });

  it('accepts raw POST bytes only through an attachment ID and rejects arbitrary bucket/path authority', () => {
    expect(broker).toContain("request.headers.get('x-attachment-id')");
    expect(broker).toContain('new Uint8Array(await request.arrayBuffer())');
    expect(broker).toContain("attachment.storage_bucket !== 'project-files'");
    expect(broker).toContain("admin.storage.from('project-files')");
    expect(broker).not.toContain("request.headers.get('x-storage-path')");
    expect(broker).not.toContain("searchParams.get('storage_path')");
    expect(broker).not.toContain("searchParams.get('bucket')");
    expect(broker).toContain('upsert: false');
  });

  it('enforces 20 MiB, exact declared MIME/size, filename extension, and PDF/JPEG/PNG magic bytes', () => {
    expect(broker).toContain('const MAX_BYTES = 20 * 1024 * 1024');
    expect(broker).toContain("'application/pdf'");
    expect(broker).toContain("'image/jpeg'");
    expect(broker).toContain("'image/png'");
    expect(broker).toContain('matchesMagic(body, expected.magic)');
    expect(broker).toContain('normalizedContentType(request) !== attachment.mime_type');
    expect(broker).toContain('body.byteLength !== attachment.size_bytes');
    expect(broker).toContain('ATTACHMENT_BYTE_VALIDATION_FAILED');
    expect(broker).not.toContain('image/svg+xml');
    expect(broker).not.toContain('text/html');
    expect(broker).not.toContain('application/octet-stream');
  });

  it('uses a 5-minute transient signed download only for available metadata and documents.view', () => {
    expect(broker).toContain('const DOWNLOAD_TTL_SECONDS = 5 * 60');
    expect(broker).toContain("request.method === 'GET'");
    expect(broker).toContain("hasPermission(actor, 'documents.view')");
    expect(broker).toContain("attachment.state !== 'available'");
    expect(broker).toContain('createSignedUrl(attachment.storage_path, DOWNLOAD_TTL_SECONDS)');
    expect(broker).toContain('expires_in_seconds: DOWNLOAD_TTL_SECONDS');
    expect(migration).not.toContain('signed_url');
  });

  it('preserves approved immutability and compensates storage/metadata mismatch without claiming atomicity', () => {
    expect(broker).toContain("correspondenceData.document_status === 'approved'");
    expect(broker).toContain('CORRESPONDENCE_APPROVED_IMMUTABLE');
    expect(broker).toContain("bucket.remove([attachment.storage_path])");
    expect(broker).toContain("admin.rpc('mark_project_correspondence_attachment_cleanup_required'");
    expect(broker).toContain('ATTACHMENT_CLEANUP_REQUIRED');
    expect(broker).toContain("admin.rpc('finalize_project_correspondence_attachment'");
    expect(broker).toContain('await sha256Hex(body)');
  });
});
