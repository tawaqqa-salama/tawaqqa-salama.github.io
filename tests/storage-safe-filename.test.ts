import { describe, expect, it } from 'vitest';
import {
  buildStorageObjectPath,
  formatProjectFilesStorageError,
  sanitizeStorageFileName,
} from '@/lib/storage/project-files';

describe('sanitizeStorageFileName', () => {
  it('strips Arabic characters that cause Supabase Invalid key', () => {
    const safe = sanitizeStorageFileName('الفندق.pdf');
    expect(safe).toBe('file.pdf');
    expect(safe).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(safe).not.toMatch(/[\u0600-\u06FF]/);
  });

  it('keeps ASCII basename and extension', () => {
    expect(sanitizeStorageFileName('FIRE FIGHTING Plan.PDF')).toBe('FIRE_FIGHTING_Plan.pdf');
  });

  it('handles mixed Arabic + Latin', () => {
    const safe = sanitizeStorageFileName('مخطط Hotel-Floor1.dwg');
    expect(safe).toBe('Hotel-Floor1.dwg');
    expect(safe).not.toMatch(/[\u0600-\u06FF]/);
  });

  it('falls back when name is only non-ASCII', () => {
    expect(sanitizeStorageFileName('مخطط')).toBe('file');
  });
});

describe('buildStorageObjectPath', () => {
  it('keeps id/timestamp prefix and ASCII-safe segments', () => {
    const path = buildStorageObjectPath(
      ['25d51b92-810f-4d83-967e-bea5f4511a44', 'engineering_drawing'],
      'att-1710000000-abc12',
      'الفندق.pdf'
    );
    expect(path).toBe(
      '25d51b92-810f-4d83-967e-bea5f4511a44/engineering_drawing/att-1710000000-abc12-file.pdf'
    );
    expect(path).not.toMatch(/[\u0600-\u06FF]/);
  });
});

describe('formatProjectFilesStorageError', () => {
  it('explains Invalid key clearly', () => {
    const msg = formatProjectFilesStorageError('الفندق.pdf', 'Invalid key');
    expect(msg).toMatch(/العربية|مفتاح التخزين|Invalid key|غير مسموحة/i);
  });
});
