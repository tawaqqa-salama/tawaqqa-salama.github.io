import { beforeEach, describe, expect, it, vi } from 'vitest';

const convertToPdf = vi.fn();
const logActivity = vi.fn();

vi.mock('@/lib/print/html-to-pdf', () => ({
  htmlDocumentToPdfFile: (...args: unknown[]) => convertToPdf(...args),
}));

vi.mock('@/lib/activity/logger', () => ({
  logActivity: (...args: unknown[]) => logActivity(...args),
}));

import { downloadPdfDocument } from '@/lib/print/document-preview';

describe('document preview PDF download', () => {
  const click = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:technical-report');
  const revokeObjectURL = vi.fn();
  const anchor = { href: '', download: '', click };

  beforeEach(() => {
    convertToPdf.mockReset();
    logActivity.mockReset();
    click.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    anchor.href = '';
    anchor.download = '';

    vi.stubGlobal('document', {
      createElement: vi.fn(() => anchor),
    });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    convertToPdf.mockResolvedValue(
      new File([new Uint8Array([37, 80, 68, 70])], 'engineering-study-CL-001.pdf', {
        type: 'application/pdf',
      })
    );
  });

  it('converts report HTML to a real PDF file before downloading', async () => {
    await downloadPdfDocument('<!doctype html><title>التقرير الفني</title>', 'engineering-study-CL-001');

    expect(convertToPdf).toHaveBeenCalledWith(
      '<!doctype html><title>التقرير الفني</title>',
      'engineering-study-CL-001'
    );
    expect(anchor.href).toBe('blob:technical-report');
    expect(anchor.download).toBe('engineering-study-CL-001.pdf');
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'application/pdf' })
    );
  });
});
