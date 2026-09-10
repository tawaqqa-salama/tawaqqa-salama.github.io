/**
 * Browser stub for OCR provider — never runs OCR or touches secrets.
 * Wired via next.config resolveAlias so client bundles never load Node OCR.
 */

export type OcrProviderEngine = 'http' | 'tesseract';

export type OcrProviderInput = {
  pageNumber: number;
  pdfText: string;
  pageImageBytes?: Uint8Array | null;
  pdfBytes?: Uint8Array | null;
};

export type OcrProviderResult =
  | { text: string; engine: OcrProviderEngine }
  | { text: null; error: string; engine: OcrProviderEngine | null };

export function getOcrTimeoutMs(): number {
  return 45_000;
}

export function resolveOcrProviderMode(): 'http' | 'tesseract' | 'none' {
  return 'none';
}

export function isConfiguredOcrProviderAvailable(): boolean {
  return false;
}

export async function invokeConfiguredOcrProvider(
  _input: OcrProviderInput
): Promise<OcrProviderResult> {
  return { text: null, error: 'ocr_server_only', engine: null };
}
