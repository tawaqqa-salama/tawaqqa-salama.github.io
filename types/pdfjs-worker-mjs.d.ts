/**
 * Ambient module for the pdfjs legacy worker entry used by the Node/Vercel
 * fake-worker priming path. Keeps the import bundler-visible for Next NFT.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' {
  /** pdfjs fake-worker entry — same export the runtime reads from globalThis.pdfjsWorker */
  export const WorkerMessageHandler: {
    setup: (handler: unknown, port: unknown) => void;
  };
}
