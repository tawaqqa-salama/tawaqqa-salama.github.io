/**
 * Regressions for Vercel/Next server bundling of pdfjs worker paths.
 *
 * Production failure:
 *   pdf_extraction_failed: The "path" argument must be of type string.
 *   Received type number (29083)
 *
 * Cause: require.resolve('pdfjs-dist/.../pdf.worker...') compiled to a numeric
 * webpack module id, then passed to pathToFileURL().
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  NODE_PDF_WORKER_SRC_SENTINEL,
  assertSafePdfWorkerSrc,
  ensureNodePdfjsFakeWorkerPrimed,
  ensurePdfJsWorkerConfigured,
  openPdfDocumentFromBytes,
  resetPdfJsWorkerConfigForTests,
  resolveNodePdfWorkerSrc,
} from '@/lib/design-intelligence/pdfjs-runtime';
import { extractPdfPagesFromBytes } from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';

const root = process.cwd();

/** Minimal one-page PDF with Helvetica text "Hello PDF". */
function minimalPdfBytes(): Uint8Array {
  const raw = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 12 Tf 50 150 Td (Hello PDF) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000361 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
433
%%EOF
`;
  return new TextEncoder().encode(raw);
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else if (/\.(js|mjs|cjs|ts)$/.test(name)) acc.push(full);
  }
  return acc;
}

describe('pdfjs Node/Vercel worker bundling safety', () => {
  beforeAll(() => {
    resetPdfJsWorkerConfigForTests();
  });

  it('assertSafePdfWorkerSrc rejects numeric webpack module ids', () => {
    expect(() => assertSafePdfWorkerSrc(29083)).toThrow(/pdf_worker_src_invalid/);
    expect(() => assertSafePdfWorkerSrc(29083)).toThrow(/number \(29083\)/);
    expect(() => assertSafePdfWorkerSrc(null)).toThrow(/pdf_worker_src_invalid/);
    expect(() => assertSafePdfWorkerSrc('')).toThrow(/pdf_worker_src_invalid/);
    expect(() => assertSafePdfWorkerSrc(NODE_PDF_WORKER_SRC_SENTINEL)).not.toThrow();
  });

  it('never passes numeric module ids to pathToFileURL (regression for 29083)', () => {
    const webpackModuleId = 29083 as unknown as string;
    expect(typeof webpackModuleId).toBe('number');
    expect(() => pathToFileURL(webpackModuleId as unknown as string)).toThrow(
      /path.*string|Received type number/i
    );

    const runtime = readFileSync(
      join(root, 'lib/design-intelligence/pdfjs-runtime.ts'),
      'utf8'
    );
    // Ignore comments — docs mention the forbidden APIs by name.
    const codeOnly = runtime
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(codeOnly).not.toMatch(/pathToFileURL\s*\(/);
    expect(codeOnly).not.toMatch(/createRequire\s*\(/);
    expect(codeOnly).not.toMatch(/require\.resolve\s*\(/);
    expect(codeOnly).not.toMatch(/from\s+['"]node:url['"]|from\s+['"]url['"]/);
  });

  it('Node resolveNodePdfWorkerSrc returns string sentinel, not file:// from resolve', async () => {
    const src = await resolveNodePdfWorkerSrc();
    expect(typeof src).toBe('string');
    expect(src).toBe(NODE_PDF_WORKER_SRC_SENTINEL);
    expect(src.startsWith('file:')).toBe(false);
    assertSafePdfWorkerSrc(src);
  });

  it('primes globalThis.pdfjsWorker so fake-worker never needs FS paths', async () => {
    resetPdfJsWorkerConfigForTests();
    await ensureNodePdfjsFakeWorkerPrimed();
    const g = globalThis as typeof globalThis & {
      pdfjsWorker?: { WorkerMessageHandler?: unknown };
    };
    expect(g.pdfjsWorker?.WorkerMessageHandler).toBeTruthy();

    const pdfjs = (await import(
      'pdfjs-dist/legacy/build/pdf.mjs'
    )) as unknown as {
      GlobalWorkerOptions: { workerSrc: string };
    };
    await ensurePdfJsWorkerConfigured(pdfjs as never);
    expect(typeof pdfjs.GlobalWorkerOptions.workerSrc).toBe('string');
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(NODE_PDF_WORKER_SRC_SENTINEL);
  });

  it('Node integration: openPdfDocumentFromBytes + extractPdfPagesFromBytes on real PDF', async () => {
    expect(typeof window).toBe('undefined');
    resetPdfJsWorkerConfigForTests();

    const { pdf } = await openPdfDocumentFromBytes(minimalPdfBytes());
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    await pdf.destroy();

    const extracted = await extractPdfPagesFromBytes(minimalPdfBytes());
    expect(extracted.page_count).toBeGreaterThanOrEqual(1);
    expect(extracted.pages_extracted).toBeGreaterThanOrEqual(1);
    expect(extracted.pages[0]?.page).toBe(1);
    expect(extracted.pages[0]?.text.toLowerCase()).toContain('hello');
  });

  it('next.config externalizes pdfjs-dist for server runtime', () => {
    const cfg = readFileSync(join(root, 'next.config.ts'), 'utf8');
    expect(cfg).toMatch(/serverExternalPackages:\s*\[[^\]]*["']pdfjs-dist["']/);
  });

  it('Next production server bundle must not pathToFileURL numeric ids for pdf worker', () => {
    const serverDir = join(root, '.next/server');
    if (!existsSync(serverDir)) {
      // Build may not have run yet in pure unit-test CI — skip soft.
      expect(existsSync(serverDir)).toBe(false);
      return;
    }

    const files = walkFiles(serverDir);
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      // Classic failure pattern: pathToFileURL(<number>) or pathToFileURL(29083)
      if (/pathToFileURL\s*\(\s*\d+\s*\)/.test(src)) {
        hits.push(`${file}: pathToFileURL(<number>)`);
      }
      // require.resolve of pdf worker still present in our app chunks (not pdfjs itself)
      if (
        /pdf\.worker/.test(src) &&
        /pathToFileURL\s*\(/.test(src) &&
        /require\.resolve|__webpack_require__\.resolve/.test(src)
      ) {
        hits.push(`${file}: pathToFileURL + resolve + pdf.worker`);
      }
    }
    expect(hits).toEqual([]);
  });
});
