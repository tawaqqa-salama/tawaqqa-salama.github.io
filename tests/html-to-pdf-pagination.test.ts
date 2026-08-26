import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'lib/print/html-to-pdf.ts'), 'utf8');
const embeddedFonts = readFileSync(resolve(process.cwd(), 'lib/projects/engineering-report-engine/renderer/embedded-fonts.ts'), 'utf8');

describe('HTML to PDF pagination', () => {
  it('selects semantic report boundaries before rasterizing PDF pages', () => {
    expect(source).toContain('collectSafeBreaks');
    expect(source).toContain('chooseNextBreak');
    expect(source).toContain("'.official-table-wrap'");
    expect(source).toContain("'.official-approvals'");
    expect(source).toContain('while (rendered < canvas.height)');
    expect(source).not.toContain("import('pagedjs')");
  });

  it('keeps a guarded fallback only where no semantic boundary is available', () => {
    expect(source).toContain('const following = safeBreaks.find((point) => point > desired)');
    expect(source).toContain('تعذر إنهاء تقسيم صفحات PDF بأمان');
    expect(source).toContain('host.remove()');
  });

  it('waits for embedded Arabic fonts before raster capture', () => {
    expect(source).toContain('await waitForDocumentFonts(doc)');
    expect(source).toContain('fonts.load');
    expect(source).toContain('Noto Naskh Arabic');
    expect(source).toContain('900 16px');
  });

  it('declares Arabic-capable heavy weights instead of allowing browser fallback', () => {
    expect(embeddedFonts).toContain('font-weight: 700');
    expect(embeddedFonts).toContain('font-weight: 800');
    expect(embeddedFonts).toContain('font-weight: 900');
    expect(embeddedFonts).toContain('NOTO_NASKH_ARABIC_BOLD_BASE64');
  });
});
