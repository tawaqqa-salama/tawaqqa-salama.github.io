/**
 * HTTP app for saudi-code-ocr. JSON only — never HTML error pages.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { authorizeBearer } from './auth.js';
import { getMaxBodyBytes } from './limits.js';
import { logOcr } from './log.js';
import { detectInputType, processOcrRequest, type ProcessOcrDeps } from './process.js';
import {
  OcrHttpError,
  type HealthResponse,
  type OcrErrorResponse,
  type OcrRequestBody,
  type OcrSuccessResponse,
} from './types.js';

export type AppOptions = {
  apiKey: string;
  processDeps?: ProcessOcrDeps;
};

function sendJson(
  res: ServerResponse,
  status: number,
  body: OcrSuccessResponse | OcrErrorResponse | HealthResponse
): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.byteLength;
      if (size > maxBytes) {
        // Drain remaining data without tearing down the socket mid-response
        req.resume();
        fail(new OcrHttpError(413, 'request_body_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))));
  });
}

export function createRequestHandler(options: AppOptions) {
  const { apiKey, processDeps } = options;

  return async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const method = (req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (method === 'GET' && (path === '/health' || path === '/')) {
      const health: HealthResponse = {
        ok: true,
        service: 'saudi-code-ocr',
        ocrEngine: 'tesseract',
        languages: ['ara', 'eng'],
      };
      sendJson(res, 200, health);
      return;
    }

    if (method === 'POST' && (path === '/ocr' || path === '/')) {
      const started = Date.now();
      let inputType: 'image' | 'pdf' | 'none' | 'unknown' = 'unknown';
      let pageNumber: number | undefined;
      let byteSize = 0;

      try {
        if (!authorizeBearer(req.headers.authorization, apiKey)) {
          logOcr({
            event: 'ocr_auth_failed',
            ok: false,
            status: 401,
            reason: 'unauthorized',
          });
          sendJson(res, 401, { error: 'unauthorized' });
          return;
        }

        const raw = await readBody(req, getMaxBodyBytes());
        byteSize = raw.byteLength;

        let body: OcrRequestBody;
        try {
          body = JSON.parse(raw.toString('utf8')) as OcrRequestBody;
        } catch {
          throw new OcrHttpError(400, 'invalid_json');
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new OcrHttpError(400, 'invalid_json');
        }

        inputType = detectInputType(body);
        if (typeof body.pageNumber === 'number') pageNumber = body.pageNumber;

        const result = await processOcrRequest(body, processDeps);
        pageNumber = result.pageNumber;

        logOcr({
          event: 'ocr_ok',
          ok: true,
          status: 200,
          pageNumber: result.pageNumber,
          inputType,
          durationMs: Date.now() - started,
          byteSize,
        });
        sendJson(res, 200, result);
        return;
      } catch (err) {
        const status = err instanceof OcrHttpError ? err.status : 500;
        const code = err instanceof OcrHttpError ? err.code : 'internal_error';
        logOcr({
          event: 'ocr_failed',
          ok: false,
          status,
          pageNumber,
          inputType,
          durationMs: Date.now() - started,
          byteSize,
          reason: code,
        });
        sendJson(res, status, { error: code });
        return;
      }
    }

    sendJson(res, 404, { error: 'not_found' });
  };
}
