import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../lib/print/document-preview.ts', import.meta.url),
  'utf8'
);
const converter = readFileSync(
  new URL('../lib/print/html-to-pdf.ts', import.meta.url),
  'utf8'
);

describe('technical-report PDF download path', () => {
  it('uses the existing HTML-to-PDF converter and downloads its real PDF file without relabeling HTML', () => {
    expect(source).toContain("await import('@/lib/print/html-to-pdf')");
    expect(source).toContain('const pdf = await htmlDocumentToPdfFile(html, fileName)');
    expect(source).toContain("actionType: 'EXPORT'");
    expect(source).toContain("mimeType: pdf.type");
    expect(source).toContain('triggerDownload(pdf, pdf.name)');
    expect(converter).toContain("type: 'application/pdf'");
    expect(source).toContain("type: 'text/html;charset=utf-8'");
    expect(source).toContain('fileName.endsWith(\'.html\') ? fileName : `${fileName}.html`');
    expect(source).not.toContain("fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;\n  triggerDownload(new Blob([html]");
  });
});
