import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  attachmentErrorMessage,
  CORRESPONDENCE_ATTACHMENT_DOWNLOAD_TTL_SECONDS,
  CORRESPONDENCE_ATTACHMENT_MAX_BYTES,
  matchingRetryFile,
  validateAttachmentForUpload,
  type CorrespondenceAttachmentMetadata,
} from '@/lib/projects/correspondence-attachment-broker';

const read = (path: string) => readFileSync(path, 'utf8');
const adapter = read('lib/projects/correspondence-attachment-broker.ts');
const workspace = read('components/projects/ReadOnlyCorrespondenceWorkspace.tsx');
const reader = read('lib/projects/read-only-correspondence-workspace.ts');
const b4a = read('scripts/sql/062_stage6b4a_correspondence_attachment_contract.sql');
const b4b = read('scripts/sql/063_stage6b4b_attachment_broker_finalization.sql');
const broker = read('supabase/functions/project-correspondence-attachment-broker/index.ts');
const stage055 = read('scripts/sql/055_stage6_transmittal_contract_gate.sql');
const stage061 = read('scripts/sql/061_stage6b3d1_approval_orchestration.sql');

const pending: CorrespondenceAttachmentMetadata = {
  id: '11111111-1111-4111-8111-111111111111',
  displayFileName: 'ملف طويل.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  state: 'pending_upload',
  createdAt: '2026-08-23T00:00:00.000Z',
  cleanupRequestedAt: null,
};

describe('Stage 6B-4C correspondence attachment UI broker integration', () => {
  it('uses the B4A metadata list/prepare contract and preserves the internal correspondence handle without rendering it', () => {
    expect(reader).toContain(".select(\n        'id, correspondence_type");
    expect(reader).toContain('id: string;');
    expect(adapter).toContain("supabase.rpc('list_project_correspondence_attachments'");
    expect(adapter).toContain("supabase.rpc('prepare_project_correspondence_attachment'");
    expect(workspace).toContain('key={record.id}');
    expect(workspace).not.toContain('>{record.id}<');
    expect(workspace).not.toMatch(/storage_path|storage_bucket|signed_url/);
  });

  it('contains no browser Storage SDK, public URL, signed URL creation, signed upload URL, raw path or bucket selection', () => {
    const clientScope = `${adapter}\n${workspace}`;
    expect(clientScope).not.toMatch(/supabase\.storage\.(from|createSignedUrl|getPublicUrl|createSignedUploadUrl)/);
    expect(clientScope).not.toContain('getPublicUrl');
    expect(clientScope).not.toContain('createSignedUrl');
    expect(clientScope).not.toContain('createSignedUploadUrl');
    expect(clientScope).not.toContain('storage_path');
    expect(clientScope).not.toContain('storage_bucket');
    expect(clientScope).not.toContain("project-files");
  });

  it('uses raw POST bytes, the session JWT and x-attachment-id only, then requests download through the broker with a 300-second contract', () => {
    expect(adapter).toContain("method: 'POST'");
    expect(adapter).toContain('body: file');
    expect(adapter).toContain('Authorization: `Bearer ${token}`');
    expect(adapter).toContain("'x-attachment-id': attachmentIdValue");
    expect(adapter).toContain("method: 'GET'");
    expect(adapter).toContain('attachment_id=${encodeURIComponent(attachmentIdValue)}');
    expect(adapter).toContain('CORRESPONDENCE_ATTACHMENT_DOWNLOAD_TTL_SECONDS');
    expect(CORRESPONDENCE_ATTACHMENT_DOWNLOAD_TTL_SECONDS).toBe(300);
    expect(broker).toContain('const DOWNLOAD_TTL_SECONDS = 5 * 60');
  });

  it('does not let the browser call finalization or delete RPCs, and exposes no delete UI/action', () => {
    const clientScope = `${adapter}\n${workspace}`;
    expect(clientScope).not.toContain("rpc('finalize_project_correspondence_attachment'");
    expect(clientScope).not.toContain("rpc('request_delete_project_correspondence_attachment'");
    expect(clientScope).not.toMatch(/\bdelete\s*(button|attachment|action)/i);
    expect(workspace).toContain('لا تتوفر إجراءات حذف ضمن هذه المرحلة');
  });

  it('keeps approved correspondence download-only and leaves legacy forms separate', () => {
    expect(workspace).toContain("record.documentStatus !== 'approved'");
    expect(workspace).toContain("record.documentStatus === 'approved'");
    expect(workspace).toContain('المراسلة معتمدة، والمرفقات المتاحة للعرض والتنزيل فقط.');
    expect(workspace).toContain('لم يتم ترحيل أي منها إلى مساحة المراسلات أو مرفقاتها');
    expect(workspace).not.toContain('attachments_count');
    expect(workspace).not.toContain('attachments_note');
  });

  it('implements view/upload permission-aware controls while leaving the broker authoritative', () => {
    expect(workspace).toContain("has('documents.view')");
    expect(workspace).toContain("has('documents.upload')");
    expect(workspace).toContain('لا تملك صلاحية عرض مرفقات هذه المراسلة.');
    expect(workspace).toContain('لا تملك صلاحية استئناف الرفع حاليًا.');
    expect(b4a).toContain("stage6b4_document_permission_allowed('documents.view')");
    expect(b4a).toContain("stage6b4_document_permission_allowed('documents.upload')");
  });

  it('renders available, pending-upload, pending-delete and cleanup-required states with manual retry only', () => {
    for (const state of ['pending_upload', 'available', 'pending_delete', 'cleanup_required']) {
      expect(workspace).toContain(`'${state}'`);
    }
    expect(workspace).toContain('إعادة اختيار الملف المطابق للرفع اليدوي');
    expect(workspace).toContain('يتطلب معالجة من مسؤول النظام');
    expect(workspace).toContain('هذه الحالة للعرض فقط');
    expect(workspace).not.toContain('automatic retry');
    expect(matchingRetryFile(pending, { name: 'ملف طويل.pdf', type: 'application/pdf', size: 1024 })).toBe(true);
    expect(matchingRetryFile(pending, { name: 'different.pdf', type: 'application/pdf', size: 1024 })).toBe(false);
    expect(matchingRetryFile({ ...pending, state: 'available' }, { name: 'ملف طويل.pdf', type: 'application/pdf', size: 1024 })).toBe(false);
  });

  it('uses client prechecks only for allowed nonempty PDF/JPEG/PNG within 20 MiB', () => {
    expect(CORRESPONDENCE_ATTACHMENT_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(validateAttachmentForUpload({ name: 'a.pdf', type: 'application/pdf', size: 1 })).toBe('application/pdf');
    expect(validateAttachmentForUpload({ name: 'a.JPG', type: 'image/jpeg', size: 1 })).toBe('image/jpeg');
    expect(validateAttachmentForUpload({ name: 'a.png', type: 'image/png', size: 1 })).toBe('image/png');
    expect(() => validateAttachmentForUpload({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toThrow();
    expect(() => validateAttachmentForUpload({ name: 'a.html', type: 'text/html', size: 1 })).toThrow();
    expect(() => validateAttachmentForUpload({ name: 'a.pdf', type: 'application/pdf', size: 20 * 1024 * 1024 + 1 })).toThrow();
    expect(workspace).toContain('validateAttachmentForUpload(file)');
  });

  it('normalizes broker failures, refreshes metadata after uncertain outcome and protects duplicate clicks', () => {
    for (const code of ['DOCUMENT_PERMISSION_DENIED', 'CORRESPONDENCE_APPROVED_IMMUTABLE', 'ATTACHMENT_BYTE_VALIDATION_FAILED', 'ATTACHMENT_LIMIT_REACHED', 'ATTACHMENT_OBJECT_CONFLICT', 'ATTACHMENT_CLEANUP_REQUIRED', 'SIGNED_URL_FAILED', 'NETWORK_UNCERTAINTY']) {
      expect(attachmentErrorMessage(code as Parameters<typeof attachmentErrorMessage>[0])).not.toBe('');
    }
    expect(workspace).toContain('await refreshAttachments(record.id);');
    expect(workspace).toContain('uploadInFlightRef.current.has(record.id)');
    expect(workspace).toContain('disabled={disabled}');
    expect(adapter).not.toMatch(/localStorage|sessionStorage|query string/);
  });

  it('keeps mobile/desktop RTL-safe layout and safe filename wrapping inside each existing correspondence card', () => {
    expect(workspace).toContain('sm:flex-row');
    expect(workspace).toContain('sm:w-auto');
    expect(workspace).toContain('w-full');
    expect(workspace).toContain('min-w-0');
    expect(workspace).toContain('break-words');
    expect(workspace).toContain('grid-cols-1');
    expect(workspace).not.toContain('overflow-x-auto');
  });

  it('does not modify frozen PDF/workflow/migrations contracts and retains B4A/B4B broker boundaries', () => {
    expect(stage055).toContain('Stage 6');
    expect(stage061).toContain('Stage 6B-3D1');
    expect(b4a).toContain('No file-byte upload');
    expect(b4b).toContain('Stage 6B-4B');
    expect(broker).toContain("admin.storage.from('project-files')");
    expect(workspace).not.toContain('Stage 7');
    expect(adapter).not.toContain('workflow');
  });
});
