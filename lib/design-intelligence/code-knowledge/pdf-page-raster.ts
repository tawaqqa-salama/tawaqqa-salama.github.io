/**
 * Server-side PDF page rasterization for selective Arabic OCR.
 * Uses pdf.js + @napi-rs/canvas when available (Node). Never invents text.
 * Browser path is intentionally unsupported here — OCR fallback is server-only.
 */

import { openPdfDocumentFromBytes } from '@/lib/design-intelligence/pdfjs-runtime';

export type PdfPageRasterResult = {
  bytes: Uint8Array;
  mimeType: 'image/png';
  width: number;
  height: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Render one PDF page to PNG bytes for OCR (ara+eng).
 * Returns null when canvas/runtime is unavailable — caller must treat as OCR failure.
 */
export async function rasterizePdfPageToPng(
  pdfBytes: Uint8Array,
  pageNumber: number,
  opts?: { scale?: number }
): Promise<PdfPageRasterResult | null> {
  if (isBrowser()) return null;
  if (!pdfBytes?.byteLength || pageNumber < 1) return null;

  let createCanvas: ((w: number, h: number) => {
    width: number;
    height: number;
    getContext: (type: '2d') => unknown;
    toBuffer: (mime?: string) => Buffer;
  }) | null = null;

  try {
    const canvasMod = await import('@napi-rs/canvas');
    createCanvas = canvasMod.createCanvas as typeof createCanvas;
  } catch {
    return null;
  }
  if (!createCanvas) return null;

  const scale = Math.min(3, Math.max(1.25, opts?.scale ?? 2));
  let pdf;
  try {
    ({ pdf } = await openPdfDocumentFromBytes(pdfBytes));
  } catch {
    return null;
  }

  try {
    if (pageNumber > pdf.numPages) return null;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;

    await page.render({
      canvasContext: context as CanvasRenderingContext2D,
      viewport,
    }).promise;

    const buf = canvas.toBuffer('image/png');
    return {
      bytes: new Uint8Array(buf),
      mimeType: 'image/png',
      width,
      height,
    };
  } catch {
    return null;
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* ignore */
    }
  }
}
