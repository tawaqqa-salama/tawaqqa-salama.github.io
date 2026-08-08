import { describe, expect, it } from 'vitest';
import { formatProjectFilesStorageError } from '@/lib/storage/project-files';

describe('formatProjectFilesStorageError', () => {
  it('explains failed save and that picker filename is not success', () => {
    const msg = formatProjectFilesStorageError('طفاية حريق.pdf', 'Bucket not found');
    expect(msg).toContain('طفاية حريق.pdf');
    expect(msg).toContain('project-files');
    expect(msg).toContain('إدارة إصدارات المخططات');
    expect(msg).not.toMatch(/link_project_files_storage\.txt/);
    expect(msg).not.toMatch(/scripts\/sql\/028_project_files_storage\.sql/);
  });
});
