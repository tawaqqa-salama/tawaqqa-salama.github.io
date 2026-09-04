/**
 * PDF.js worker + page extraction regressions (no CDN).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  ensurePdfJsWorkerConfigured,
  getBrowserPdfWorkerSrc,
  openPdfDocumentFromBytes,
  NODE_PDF_WORKER_SRC_SENTINEL,
  resetPdfJsWorkerConfigForTests,
  resolveNodePdfWorkerSrc,
} from '@/lib/design-intelligence/pdfjs-runtime';
import {
  chunkPagesPreserving,
  extractPdfPagesFromBytes,
} from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';

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

describe('PDF extraction worker + pages', () => {
  beforeAll(() => {
    // Ensure public worker is synced for browser path assertions
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('child_process').execSync('node scripts/sync-pdfjs-worker.mjs', {
      cwd: root,
      stdio: 'pipe',
    });
    resetPdfJsWorkerConfigForTests();
  });

  it('A: real small PDF parses in Node/server-compatible runtime', async () => {
    const { pdf } = await openPdfDocumentFromBytes(minimalPdfBytes());
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    await pdf.destroy();
  });

  it('B: production extraction does not require external CDN worker', async () => {
    const runtime = readFileSync(
      join(root, 'lib/design-intelligence/pdfjs-runtime.ts'),
      'utf8'
    );
    expect(runtime).not.toMatch(/https?:\/\/[^\s'"`]*cdnjs/);
    expect(runtime).not.toMatch(/https?:\/\/[^\s'"`]*unpkg\.com/);
    expect(runtime).toMatch(/pdf\.worker\.min\.mjs/);
    // pdfjs-dist@4.10.38 removed disableWorker — must not rely on obsolete API
    expect(runtime).toMatch(/disableWorker was removed|does not support `disableWorker`/);
    expect(existsSync(join(root, 'public/pdfjs/pdf.worker.min.mjs'))).toBe(true);

    const nodeSrc = await resolveNodePdfWorkerSrc();
    // Sentinel string only — never file:// from require.resolve (webpack numeric ids).
    expect(typeof nodeSrc).toBe('string');
    expect(nodeSrc).toBe(NODE_PDF_WORKER_SRC_SENTINEL);
    expect(nodeSrc.startsWith('file:')).toBe(false);
    const codeOnly = runtime
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(codeOnly).not.toMatch(/pathToFileURL\s*\(/);
    expect(codeOnly).not.toMatch(/require\.resolve\s*\(/);

    expect(getBrowserPdfWorkerSrc()).toBe('/pdfjs/pdf.worker.min.mjs');

    const pdfjs = (await import(
      'pdfjs-dist/legacy/build/pdf.mjs'
    )) as unknown as {
      GlobalWorkerOptions: { workerSrc: string };
    };
    await ensurePdfJsWorkerConfigured(pdfjs as never);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).not.toMatch(/cdnjs|unpkg/);
    expect(typeof pdfjs.GlobalWorkerOptions.workerSrc).toBe('string');
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe(NODE_PDF_WORKER_SRC_SENTINEL);
  });

  it('G: build scripts sync local worker (no CDN) for production', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.postinstall).toMatch(/sync-pdfjs-worker/);
    expect(pkg.scripts.build).toMatch(/sync-pdfjs-worker/);
    expect(existsSync(join(root, 'scripts/sync-pdfjs-worker.mjs'))).toBe(true);
    const sync = readFileSync(join(root, 'scripts/sync-pdfjs-worker.mjs'), 'utf8');
    expect(sync).not.toMatch(/https?:\/\/[^\s'"`]*(cdnjs|unpkg)/);
    expect(sync).toMatch(/node_modules\/pdfjs-dist/);
  });

  it('C+D: extraction returns page text with page metadata', async () => {
    const extracted = await extractPdfPagesFromBytes(minimalPdfBytes());
    expect(extracted.page_count).toBeGreaterThanOrEqual(1);
    expect(extracted.pages[0]?.page).toBe(1);
    expect(extracted.pages[0]?.text.toLowerCase()).toContain('hello');
    expect(extracted.pages_extracted).toBeGreaterThanOrEqual(1);
  });

  it('E: PDF extraction failure returns pdf_extraction_failed not chunks_missing', async () => {
    await expect(extractPdfPagesFromBytes(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(
      /pdf_extraction_failed/
    );
    const emb = readFileSync(join(root, 'lib/design-intelligence/embeddings.ts'), 'utf8');
    expect(emb).toMatch(/pdf_extraction_failed/);
    expect(emb).toMatch(/throw new Error/);
    const kb = readFileSync(join(root, 'lib/design-intelligence/knowledge-base.ts'), 'utf8');
    expect(kb).toMatch(/pdf_extraction_failed/);
    expect(kb).toMatch(/FAILED: \$\{message\}|FAILED: pdf_extraction_failed/);
  });

  it('F: successful PDF extraction creates > 0 chunks', async () => {
    const extracted = await extractPdfPagesFromBytes(minimalPdfBytes());
    const chunks = chunkPagesPreserving(extracted.pages, 700);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.page_start).toBe(1);
    expect(chunks[0]?.page_end).toBe(1);
    expect(chunks[0]?.content.length).toBeGreaterThan(0);
  });

  it('repo has no remaining CDN pdf.worker configuration', () => {
    const files = [
      'lib/design-intelligence/pdfjs-runtime.ts',
      'lib/design-intelligence/code-knowledge/pdf-page-extract.ts',
      'lib/projects/design-center/vision/cadVisionEngine.ts',
      'lib/projects/building-permit-pdf-image.ts',
    ];
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).not.toMatch(/cdnjs\.cloudflare|unpkg\.com\/pdfjs-dist/);
    }
  });
});
