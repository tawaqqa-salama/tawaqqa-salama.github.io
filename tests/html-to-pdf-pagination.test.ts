import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'lib/print/html-to-pdf.ts'), 'utf8');

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
});
