/**
 * Deterministic OCR HTTP service regressions (A–L).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createRequestHandler } from '../src/app.js';
import { authorizeBearer } from '../src/auth.js';
import { logOcr, sanitizeLogReason } from '../src/log.js';
import type { ProcessOcrDeps } from '../src/process.js';

const API_KEY = 'test-ocr-secret-key-32chars-min!!';

/** Minimal valid 1×1 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** Minimal PDF with %PDF magic (not a full multi-page render target — mocked). */
const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
  'utf8'
);

function mockDeps(text = 'أنظمة الرش Section 903.4.1 SBC-801'): ProcessOcrDeps {
  return {
    pdf: {
      pdfInfoFn: async () => 3,
      execFileFn: async () => ({ stdout: '', stderr: '' }) as never,
      writeFileFn: async () => undefined as never,
      readFileFn: async (p: string) => {
        if (String(p).endsWith('.png')) return TINY_PNG;
        return Buffer.alloc(0);
      },
      mkdtempFn: async () => '/tmp/saudi-ocr-pdf-mock',
      rmFn: async () => undefined,
    },
    tesseract: {
      recognizeFn: async () => text,
      mkdtempFn: async () => '/tmp/saudi-ocr-tess-mock',
      writeFileFn: async () => undefined as never,
      rmFn: async () => undefined,
    },
  };
}

async function withServer(
  deps: ProcessOcrDeps,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const handler = createRequestHandler({ apiKey: API_KEY, processDeps: deps });
  const server: Server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no_port');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

describe('saudi-code-ocr HTTP service', () => {
  const logs: string[] = [];
  const originalInfo = console.info;

  beforeEach(() => {
    logs.length = 0;
    console.info = ((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    }) as typeof console.info;
  });

  afterEach(() => {
    console.info = originalInfo;
    vi.restoreAllMocks();
  });

  it('A: missing auth -> 401', async () => {
    await withServer(mockDeps(), async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pageNumber: 1,
          imageBase64: TINY_PNG.toString('base64'),
        }),
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    });
  });

  it('B: wrong auth -> 401', async () => {
    expect(authorizeBearer('Bearer wrong-key', API_KEY)).toBe(false);
    await withServer(mockDeps(), async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer wrong-key',
        },
        body: JSON.stringify({
          pageNumber: 1,
          imageBase64: TINY_PNG.toString('base64'),
        }),
      });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    });
  });

  it('C: invalid JSON -> 400', async () => {
    await withServer(mockDeps(), async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: '{not-json',
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_json' });
    });
  });

  it('D: missing input -> 400', async () => {
    await withServer(mockDeps(), async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ pageNumber: 1 }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'missing_image_or_pdf' });
    });
  });

  it('E: invalid pageNumber -> 400', async () => {
    await withServer(mockDeps(), async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          pageNumber: 0,
          imageBase64: TINY_PNG.toString('base64'),
        }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_page_number' });
    });
  });

  it('F: image OCR request -> valid JSON', async () => {
    await withServer(mockDeps('hello 903.4.1 مرحبا'), async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          pageNumber: 12,
          languages: ['ara', 'eng'],
          languageHints: ['ara', 'eng'],
          digits: true,
          imageBase64: TINY_PNG.toString('base64'),
          imageMimeType: 'image/png',
          pdfBase64: null,
        }),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        text: string;
        engine: string;
        languages: string[];
        pageNumber: number;
      };
      expect(json.text).toContain('903.4.1');
      expect(json.engine).toBe('tesseract');
      expect(json.languages).toEqual(['ara', 'eng']);
      expect(json.pageNumber).toBe(12);
    });
  });

  it('G: PDF page OCR request -> only requested page processed', async () => {
    let requestedPage: number | null = null;
    const deps = mockDeps('PDF page OCR Arabic الرش 7 bar');
    deps.pdf = {
      ...deps.pdf,
      pdfInfoFn: async () => 10,
      execFileFn: async (_cmd: string, args: readonly string[] | null | undefined) => {
        const list = [...(args || [])];
        const fIdx = list.indexOf('-f');
        const lIdx = list.indexOf('-l');
        requestedPage = Number(list[fIdx + 1]);
        expect(Number(list[lIdx + 1])).toBe(requestedPage);
        expect(requestedPage).toBe(7);
        return { stdout: '', stderr: '' } as never;
      },
    };

    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          pageNumber: 7,
          imageBase64: null,
          pdfBase64: TINY_PDF.toString('base64'),
        }),
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { text: string; pageNumber: number };
      expect(json.pageNumber).toBe(7);
      expect(json.text).toMatch(/Arabic|الرش|7 bar/);
      expect(requestedPage).toBe(7);
    });
  });

  it('H: Arabic + English output preserved (no LLM rewrite)', async () => {
    const faithful = 'يجب توفير أنظمة الرش — Section 903.4.1 / SBC-801';
    await withServer(mockDeps(faithful), async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          pageNumber: 1,
          imageBase64: TINY_PNG.toString('base64'),
        }),
      });
      const json = (await res.json()) as { text: string };
      expect(json.text).toBe(faithful);
    });
  });

  it('I: timeout -> JSON failure', async () => {
    const deps = mockDeps();
    deps.tesseract = {
      recognizeFn: async () => {
        throw Object.assign(new Error('spawn tesseract ETIMEDOUT'), {
          code: 'ETIMEDOUT',
        });
      },
      mkdtempFn: async () => '/tmp/saudi-ocr-tess-mock',
      writeFileFn: async () => undefined as never,
      rmFn: async () => undefined,
    };
    // Force path through execFile timeout messaging
    deps.tesseract.recognizeFn = undefined;
    deps.tesseract.execFileFn = async () => {
      throw Object.assign(new Error('timeout'), { killed: true, signal: 'SIGTERM' });
    };

    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          pageNumber: 1,
          imageBase64: TINY_PNG.toString('base64'),
        }),
      });
      expect([504, 500]).toContain(res.status);
      const json = (await res.json()) as { error: string };
      expect(json.error).toMatch(/ocr_timeout|tesseract_failed/);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
    });
  });

  it('J: payload too large -> rejected', async () => {
    const prev = process.env.OCR_MAX_BODY_BYTES;
    process.env.OCR_MAX_BODY_BYTES = '2048';
    try {
      await withServer(mockDeps(), async (base) => {
        const huge = 'A'.repeat(5000);
        const res = await fetch(`${base}/ocr`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            pageNumber: 1,
            imageBase64: huge,
          }),
        });
        expect(res.status).toBe(413);
        const json = (await res.json()) as { error: string };
        expect(json.error).toMatch(/too_large|payload/);
      });
    } finally {
      if (prev === undefined) delete process.env.OCR_MAX_BODY_BYTES;
      else process.env.OCR_MAX_BODY_BYTES = prev;
    }
  });

  it('K: health endpoint -> 200', async () => {
    await withServer(mockDeps(), async (base) => {
      const res = await fetch(`${base}/health`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        ok: boolean;
        service: string;
        ocrEngine: string;
        languages: string[];
      };
      expect(json.ok).toBe(true);
      expect(json.service).toBe('saudi-code-ocr');
      expect(json.ocrEngine).toBe('tesseract');
      expect(json.languages).toEqual(['ara', 'eng']);
      expect(JSON.stringify(json)).not.toMatch(/OCR_API_KEY|Bearer|secret/i);
    });
  });

  it('L: secrets/base64/full OCR text not logged', async () => {
    const longText = 'يجب توفير أنظمة الرش الآلي '.repeat(20) + 'Section 903.4.1';
    await withServer(mockDeps(longText), async (base) => {
      await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          pageNumber: 99,
          imageBase64: TINY_PNG.toString('base64'),
        }),
      });
    });

    const joined = logs.join('\n');
    expect(joined).toContain('ocr_ok');
    expect(joined).not.toContain(API_KEY);
    expect(joined).not.toContain('Bearer ');
    expect(joined).not.toContain(TINY_PNG.toString('base64').slice(0, 40));
    expect(joined).not.toContain(longText);
    expect(sanitizeLogReason(`Bearer ${API_KEY}`)).not.toContain(API_KEY);

    logOcr({
      event: 'probe',
      reason: `fail Bearer ${API_KEY} ${TINY_PNG.toString('base64')}`,
    });
    const last = logs[logs.length - 1];
    expect(last).not.toContain(API_KEY);
    expect(last).toMatch(/\[redacted\]/);
  });

  it('pageNumber out of PDF range -> 400', async () => {
    const deps = mockDeps();
    deps.pdf = {
      ...deps.pdf,
      pdfInfoFn: async () => 2,
    };
    await withServer(deps, async (base) => {
      const res = await fetch(`${base}/ocr`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          pageNumber: 9,
          pdfBase64: TINY_PDF.toString('base64'),
        }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'page_number_out_of_range' });
    });
  });
});
