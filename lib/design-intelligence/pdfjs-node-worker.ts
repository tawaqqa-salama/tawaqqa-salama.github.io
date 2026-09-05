/**
 * Server-side pdfjs worker entry — bundler-visible static import.
 *
 * Vercel/Next must see this import so output tracing / bundling includes
 * `pdf.worker.min.mjs` inside the serverless function. Do not use
 * webpackIgnore / dynamic string imports here.
 *
 * Only imported from Node paths in pdfjs-runtime.ts (never from browser).
 */

import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';

export type PdfJsWorkerModule = {
  WorkerMessageHandler?: {
    setup: (handler: unknown, port: unknown) => void;
  };
};

/** Return the statically imported worker module (bundles/traces into the server function). */
export function loadPdfjsNodeWorkerModule(): PdfJsWorkerModule {
  return pdfjsWorker as PdfJsWorkerModule;
}

/**
 * Prime globalThis.pdfjsWorker so pdfjs Node fake-worker uses WorkerMessageHandler
 * without resolving a filesystem worker path at runtime.
 */
export function primePdfjsNodeWorkerOnGlobalThis(): PdfJsWorkerModule {
  const worker = loadPdfjsNodeWorkerModule();
  if (!worker?.WorkerMessageHandler) {
    throw new Error(
      'pdf_worker_module_invalid: WorkerMessageHandler missing from pdfjs worker import'
    );
  }
  const g = globalThis as typeof globalThis & { pdfjsWorker?: PdfJsWorkerModule };
  g.pdfjsWorker = worker;
  return worker;
}
