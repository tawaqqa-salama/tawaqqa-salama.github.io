import { describe, expect, it } from 'vitest';
import { formatProjectFilesStorageError } from '@/lib/storage/project-files';

describe('formatProjectFilesStorageError', () => {
  it('does not blame missing bucket when RLS/policy fails', () => {
    const msg = formatProjectFilesStorageError(
      'طفاية حريق.pdf',
      'new row violates row-level security policy'
    );
    expect(msg).toContain('طفاية حريق.pdf');
    expect(msg).toContain('صلاحيات');
    expect(msg).toContain('إدارة إصدارات المخططات');
    expect(msg).not.toMatch(/أنشئ bucket/);
  });

  it('mentions MIME when content-type is rejected', () => {
    const msg = formatProjectFilesStorageError(
      'plan.pdf',
      'mime type application/pdf is not supported'
    );
    expect(msg).toMatch(/MIME|نوع الملف/);
  });

  it('mentions create bucket only when bucket is truly missing', () => {
    const msg = formatProjectFilesStorageError('plan.pdf', 'Bucket not found');
    expect(msg).toMatch(/غير موجود|أنشئ bucket/);
  });
});
