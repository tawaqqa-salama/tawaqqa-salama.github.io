/**
 * Production OCR providers for Design Intelligence selective page fallback.
 * Server-side only. Never fabricate engineering text.
 * Never import @napi-rs/canvas here — it breaks Next client bundles.
 *
 * Env (server-only — never NEXT_PUBLIC_*):
 * - DI_OCR_ENABLED=1
 * - DI_OCR_ENDPOINT=https://…   (HTTP provider; preferred on Vercel)
 * - DI_OCR_API_KEY=…           (optional Authorization bearer)
 * - DI_OCR_PROVIDER=http|tesseract|auto  (default auto)
 * - DI_OCR_TIMEOUT_MS=45000
 *
 * HTTP providers should rasterize from pdfBase64+pageNumber when imageBase64
 * is absent. Local tesseract requires pageImageBytes (no in-process PDF raster).
 */

export type OcrProviderEngine = 'http' | 'tesseract';

export type OcrProviderInput = {
  pageNumber: number;
  pdfText: string;
  pageImageBytes?: Uint8Array | null;
  pdfBytes?: Uint8Array | null;
};

export type OcrProviderSuccess = {
  text: string;
  engine: OcrProviderEngine;
};

export type OcrProviderFailure = {
  text: null;
  error: string;
  engine: OcrProviderEngine | null;
};

export type OcrProviderResult = OcrProviderSuccess | OcrProviderFailure;

const DEFAULT_TIMEOUT_MS = 45_000;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getOcrTimeoutMs(): number {
  const raw = Number(process.env.DI_OCR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < 1_000) return DEFAULT_TIMEOUT_MS;
  return Math.min(180_000, Math.floor(raw));
}

export function resolveOcrProviderMode(): 'http' | 'tesseract' | 'none' {
  if (isBrowser()) return 'none';
  if (process.env.DI_OCR_ENABLED !== '1') return 'none';
  const explicit = String(process.env.DI_OCR_PROVIDER || 'auto').toLowerCase();
  if (explicit === 'tesseract') return 'tesseract';
  if (explicit === 'http') {
    return process.env.DI_OCR_ENDPOINT ? 'http' : 'none';
  }
  // auto: Production path requires managed HTTP endpoint (no fake local OCR)
  return process.env.DI_OCR_ENDPOINT ? 'http' : 'none';
}

export function isConfiguredOcrProviderAvailable(): boolean {
  return resolveOcrProviderMode() !== 'none';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}_timeout_after_${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function runHttpOcr(input: OcrProviderInput, timeoutMs: number): Promise<OcrProviderResult> {
  const endpoint = String(process.env.DI_OCR_ENDPOINT || '').trim();
  if (!endpoint) {
    return { text: null, error: 'ocr_http_endpoint_missing', engine: 'http' };
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  const apiKey = String(process.env.DI_OCR_API_KEY || '').trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  let imageBase64: string | null = null;
  if (input.pageImageBytes?.byteLength) {
    imageBase64 = Buffer.from(input.pageImageBytes).toString('base64');
  }

  const body = {
    pageNumber: input.pageNumber,
    languages: ['ara', 'eng'],
    languageHints: ['ara', 'eng'],
    digits: true,
    imageBase64,
    imageMimeType: imageBase64 ? 'image/png' : null,
    // Remote service rasterizes the requested page when local image is absent
    pdfBase64:
      !imageBase64 && input.pdfBytes?.byteLength
        ? Buffer.from(input.pdfBytes).toString('base64')
        : null,
  };

  if (!body.imageBase64 && !body.pdfBase64) {
    return { text: null, error: 'ocr_http_missing_page_image_or_pdf', engine: 'http' };
  }

  try {
    const res = await withTimeout(
      fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      timeoutMs,
      'ocr_http'
    );
    if (!res.ok) {
      return {
        text: null,
        error: `ocr_http_status_${res.status}`,
        engine: 'http',
      };
    }
    const json = (await res.json()) as { text?: unknown; error?: unknown };
    const text = typeof json.text === 'string' ? json.text.trim() : '';
    if (!text) {
      return {
        text: null,
        error: typeof json.error === 'string' ? json.error : 'ocr_http_empty_text',
        engine: 'http',
      };
    }
    return { text, engine: 'http' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'ocr_http_failed');
    return { text: null, error: message.slice(0, 200), engine: 'http' };
  }
}

async function runTesseractOcr(
  input: OcrProviderInput,
  timeoutMs: number
): Promise<OcrProviderResult> {
  const imageBytes = input.pageImageBytes || null;
  if (!imageBytes?.byteLength) {
    return {
      text: null,
      error: 'ocr_tesseract_missing_page_image',
      engine: 'tesseract',
    };
  }

  try {
    const Tesseract = await import('tesseract.js');
    const recognize = async () => {
      const worker = await Tesseract.createWorker('ara+eng', 1);
      try {
        await worker.setParameters({
          preserve_interword_spaces: '1',
        });
        const result = await worker.recognize(Buffer.from(imageBytes));
        return String(result.data?.text || '').trim();
      } finally {
        await worker.terminate();
      }
    };

    const text = await withTimeout(recognize(), timeoutMs, 'ocr_tesseract');
    if (!text) {
      return { text: null, error: 'ocr_tesseract_empty_text', engine: 'tesseract' };
    }
    return { text, engine: 'tesseract' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'ocr_tesseract_failed');
    return { text: null, error: message.slice(0, 200), engine: 'tesseract' };
  }
}

/**
 * Invoke the configured OCR provider for a single page.
 * Always returns structured success/failure — never silently substitutes guesses.
 */
export async function invokeConfiguredOcrProvider(
  input: OcrProviderInput
): Promise<OcrProviderResult> {
  if (isBrowser()) {
    return { text: null, error: 'ocr_server_only', engine: null };
  }
  const mode = resolveOcrProviderMode();
  if (mode === 'none') {
    return { text: null, error: 'ocr_provider_not_configured', engine: null };
  }
  const timeoutMs = getOcrTimeoutMs();
  if (mode === 'http') return runHttpOcr(input, timeoutMs);
  return runTesseractOcr(input, timeoutMs);
}
