/**
 * Single intentional pdfjs-dist worker strategy for Knowledge / DI PDF extraction.
 *
 * Runtime note:
 * Knowledge Base upload currently runs in the browser (`DesignIntelligenceModule`
 * is a client component; GitHub Pages static export has no API Route Handlers).
 * Node/vitest also call the same extractor — configure both without CDN.
 *
 * Strategy:
 * - Browser: serve worker from `/pdfjs/pdf.worker.min.mjs` (copied from pdfjs-dist)
 * - Node: file:// URL to the installed package worker
 * - Never unpkg / cdnjs
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfJsModule = {
  getDocument: (src: unknown) => { promise: Promise<PDFDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
  version?: string;
};

let configuredFor: string | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Resolve a same-origin worker URL for static / Next browser builds.
 * Synced by `scripts/sync-pdfjs-worker.mjs` into public/pdfjs/.
 */
export function getBrowserPdfWorkerSrc(): string {
  const base =
    (typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '')) ||
    '';
  return `${base}/pdfjs/pdf.worker.min.mjs`;
}

export async function resolveNodePdfWorkerSrc(): Promise<string> {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const require = createRequire(import.meta.url);
  // Prefer legacy worker to match legacy/build/pdf.mjs used by extractors
  try {
    return pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
    ).href;
  } catch {
    return pathToFileURL(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'))
      .href;
  }
}

/**
 * Configure GlobalWorkerOptions.workerSrc once per runtime.
 * Safe to call repeatedly.
 */
export async function ensurePdfJsWorkerConfigured(
  pdfjs: PdfJsModule
): Promise<void> {
  const target = isBrowser()
    ? getBrowserPdfWorkerSrc()
    : await resolveNodePdfWorkerSrc();

  if (configuredFor === target && pdfjs.GlobalWorkerOptions.workerSrc === target) {
    return;
  }

  pdfjs.GlobalWorkerOptions.workerSrc = target;
  configuredFor = target;
}

/**
 * Load PDF document from bytes with a production-safe worker configuration.
 * Always passes a Uint8Array (not Node Buffer).
 */
export async function openPdfDocumentFromBytes(
  bytes: ArrayBuffer | Uint8Array
): Promise<{ pdf: PDFDocumentProxy; pdfjs: PdfJsModule }> {
  const source =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes);

  // Detached copy — pdfjs may transfer/own the buffer
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);

  const pdfjs = (await import(
    'pdfjs-dist/legacy/build/pdf.mjs'
  )) as unknown as PdfJsModule;

  await ensurePdfJsWorkerConfigured(pdfjs);

  try {
    const pdf = await pdfjs.getDocument({
      data: copy,
      useSystemFonts: true,
      // Keep network disabled — bytes are already local (Storage download / File)
      disableAutoFetch: true,
      disableStream: true,
    }).promise;
    return { pdf, pdfjs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`pdf_extraction_failed: ${message}`);
  }
}

/** Test helper — reset memo so workerSrc can be re-asserted. */
export function resetPdfJsWorkerConfigForTests(): void {
  configuredFor = null;
}
