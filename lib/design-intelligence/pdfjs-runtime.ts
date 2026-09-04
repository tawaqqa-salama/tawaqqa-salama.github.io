/**
 * Single intentional pdfjs-dist worker strategy for Knowledge / DI PDF extraction.
 *
 * Versions: pdfjs-dist@4.10.38 — `disableWorker` was removed from DocumentInitParameters.
 * Do NOT pass `disableWorker: true` (obsolete; silently ignored).
 *
 * Runtime:
 * - Node / Vercel server: prime `globalThis.pdfjsWorker` by importing the worker
 *   module (pdfjs Node fake-worker path). Never pass `require.resolve(...)` through
 *   `pathToFileURL` — Next/webpack rewrites resolve results to numeric module ids
 *   (e.g. 29083), which crash with `pathToFileURL(number)`.
 * - Browser (Knowledge Base client upload on static Pages): same-origin
 *   `/pdfjs/pdf.worker.min.mjs` synced from the installed package by
 *   `scripts/sync-pdfjs-worker.mjs` (postinstall + build).
 *
 * Do not add `import 'server-only'` here: extractors are shared with client components
 * (GitHub Pages has no API Route Handler for KB upload).
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';

type PdfJsModule = {
  getDocument: (src: unknown) => { promise: Promise<PDFDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
  version?: string;
};

type PdfJsWorkerModule = {
  WorkerMessageHandler?: unknown;
};

/** Sentinel string only — Node fake worker uses globalThis.pdfjsWorker, not this path. */
export const NODE_PDF_WORKER_SRC_SENTINEL =
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs';

let configuredFor: string | null = null;
let nodeWorkerPrimed = false;

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

/**
 * Reject values that must never be passed to pathToFileURL / used as FS paths.
 * Webpack/Next often compile require.resolve(...) to a numeric module id.
 */
export function assertSafePdfWorkerSrc(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `pdf_worker_src_invalid: expected non-empty string workerSrc, received ${typeof value}` +
        (typeof value === 'number' ? ` (${value})` : '')
    );
  }
}

/**
 * Node / Vercel: load the worker as a JS module and expose WorkerMessageHandler
 * on globalThis so pdfjs's fake-worker path never does import(file://...) /
 * pathToFileURL(require.resolve(...)).
 *
 * webpackIgnore keeps the specifier as a runtime import from node_modules
 * (with serverExternalPackages: ['pdfjs-dist']).
 */
export async function ensureNodePdfjsFakeWorkerPrimed(): Promise<void> {
  if (isBrowser()) return;
  if (nodeWorkerPrimed) {
    const existing = (globalThis as typeof globalThis & { pdfjsWorker?: PdfJsWorkerModule })
      .pdfjsWorker;
    if (existing?.WorkerMessageHandler) return;
  }

  const g = globalThis as typeof globalThis & { pdfjsWorker?: PdfJsWorkerModule };
  if (!g.pdfjsWorker?.WorkerMessageHandler) {
    // Dynamic specifier (sentinel) avoids TS module resolution of the .mjs worker
    // and keeps webpack from rewriting a require.resolve path to a numeric id.
    const workerSpecifier: string = NODE_PDF_WORKER_SRC_SENTINEL;
    const worker = (await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      workerSpecifier
    )) as PdfJsWorkerModule;
    if (!worker?.WorkerMessageHandler) {
      throw new Error(
        'pdf_worker_module_invalid: WorkerMessageHandler missing from pdfjs worker import'
      );
    }
    g.pdfjsWorker = worker;
  }
  nodeWorkerPrimed = true;
}

/**
 * Node workerSrc value for GlobalWorkerOptions.
 * Intentionally NOT a file:// URL from require.resolve (Next turns those into numbers).
 */
export async function resolveNodePdfWorkerSrc(): Promise<string> {
  assertSafePdfWorkerSrc(NODE_PDF_WORKER_SRC_SENTINEL);
  return NODE_PDF_WORKER_SRC_SENTINEL;
}

/**
 * Configure GlobalWorkerOptions.workerSrc once per runtime.
 * Safe to call repeatedly. Never uses CDN (cdnjs / unpkg).
 */
export async function ensurePdfJsWorkerConfigured(
  pdfjs: PdfJsModule
): Promise<void> {
  if (isBrowser()) {
    const target = getBrowserPdfWorkerSrc();
    assertSafePdfWorkerSrc(target);
    if (configuredFor === target && pdfjs.GlobalWorkerOptions.workerSrc === target) {
      return;
    }
    pdfjs.GlobalWorkerOptions.workerSrc = target;
    configuredFor = target;
    return;
  }

  await ensureNodePdfjsFakeWorkerPrimed();
  const target = await resolveNodePdfWorkerSrc();
  assertSafePdfWorkerSrc(target);
  if (configuredFor === target && pdfjs.GlobalWorkerOptions.workerSrc === target) {
    return;
  }
  pdfjs.GlobalWorkerOptions.workerSrc = target;
  configuredFor = target;
}

/**
 * Load PDF document from bytes with a production-safe worker configuration.
 * Always passes a Uint8Array (not Node Buffer).
 *
 * Note: pdfjs-dist@4.10.38 does not support `disableWorker` — Node uses the
 * built-in fake worker (+ primed globalThis.pdfjsWorker); browser uses the
 * local `/pdfjs/` worker asset.
 */
export async function openPdfDocumentFromBytes(
  bytes: ArrayBuffer | Uint8Array
): Promise<{ pdf: PDFDocumentProxy; pdfjs: PdfJsModule }> {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

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
  nodeWorkerPrimed = false;
  try {
    delete (globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker;
  } catch {
    /* ignore */
  }
}
