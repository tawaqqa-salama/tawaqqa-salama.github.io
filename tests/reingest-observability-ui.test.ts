/**
 * Reingest observability + UI hang / timeout / duplicate-click regressions.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createReingestTimer,
  logReingest,
  sanitizeReingestErrorMessage,
} from '@/lib/design-intelligence/reingest-log';

const root = process.cwd();

describe('reingest observability logs', () => {
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
  });

  it('emits ordered stage progression with safe metadata only', () => {
    const timer = createReingestTimer();
    const documentId = 'deb74a38-b94c-443a-831d-c8765a872809';
    const companyId = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';

    const stages = [
      'REINGEST_START',
      'AUTH_OK',
      'TENANT_OK',
      'DOCUMENT_LOADED',
      'STORAGE_DOWNLOAD_START',
      'STORAGE_DOWNLOAD_OK',
      'PDF_EXTRACT_START',
      'PDF_EXTRACT_OK',
      'CHUNK_BUILD_START',
      'CHUNK_BUILD_OK',
      'OLD_CHUNKS_DELETE_START',
      'OLD_CHUNKS_DELETE_OK',
      'CHUNK_INSERT_START',
      'CHUNK_INSERT_PROGRESS',
      'CHUNK_INSERT_OK',
      'DOCUMENT_UPDATE_OK',
      'REINGEST_DONE',
    ] as const;

    for (const stage of stages) {
      logReingest({
        stage,
        documentId,
        companyId,
        pageCount: 595,
        chunkCount: 4200,
        elapsedMs: timer.elapsedMs(),
      });
    }

    expect(logs.length).toBe(stages.length);
    const parsed = logs.map((l) => JSON.parse(l) as { stage: string; event: string });
    expect(parsed.map((p) => p.stage)).toEqual([...stages]);
    expect(parsed.every((p) => p.event === 'kb_reingest')).toBe(true);

    for (const line of logs) {
      expect(line).not.toMatch(/eyJ[a-zA-Z0-9_-]+\./);
      expect(line).not.toMatch(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/i);
      expect(line).not.toMatch(/service_role/i);
      expect(line).not.toMatch(/sprinkler density|Section 8\.1/i);
    }
  });

  it('sanitizes secrets from error messages', () => {
    const cleaned = sanitizeReingestErrorMessage(
      'fail Bearer eyJhbGciOiJIUzI1NiJ9.abc.def service_role=secret'
    );
    expect(cleaned).not.toMatch(/eyJ/);
    expect(cleaned).not.toMatch(/Bearer\s+eyJ/i);
    expect(cleaned.toLowerCase()).not.toContain('service_role=secret');
    expect(cleaned).toMatch(/\[redacted\]/i);
  });

  it('knowledge-base and route emit stage logs (source contract)', () => {
    const kb = readFileSync(join(root, 'lib/design-intelligence/knowledge-base.ts'), 'utf8');
    const route = readFileSync(
      join(root, 'app/api/design/knowledge/reingest/route.ts'),
      'utf8'
    );
    for (const stage of [
      'REINGEST_START',
      'DOCUMENT_LOADED',
      'STORAGE_DOWNLOAD_START',
      'PDF_EXTRACT_START',
      'CHUNK_INSERT_PROGRESS',
      'REINGEST_DONE',
      'REINGEST_FAILED',
    ]) {
      expect(kb).toContain(`'${stage}'`);
    }
    expect(route).toContain("'AUTH_OK'");
    expect(route).toContain("'TENANT_OK'");
    expect(route).toContain('logReingest');
    expect(kb).toContain('logReingest');
  });
});

describe('reingest / resume UI hang prevention', () => {
  const panel = readFileSync(
    join(root, 'components/design/CodeKnowledgePanel.tsx'),
    'utf8'
  );

  it('exits busy state on API failure and timeout', () => {
    expect(panel).toMatch(/AbortController/);
    expect(panel).toMatch(/REINGEST_CLIENT_TIMEOUT_MS|290_000/);
    expect(panel).toMatch(/Reingest exceeded server execution time/);
    expect(panel).toMatch(/setBusy\(false\)/);
    expect(panel).toMatch(/setUploadPhase\('failed'\)|setIndexStatus\('failed'\)/);
  });

  it('shows elapsed time and explicit stage text while busy', () => {
    expect(panel).toMatch(/formatElapsed\(operationElapsedMs\)/);
    expect(panel).toMatch(/operationStage/);
    expect(panel).toMatch(/startOperationTimer/);
  });

  it('blocks duplicate reingest/resume clicks while a request is active', () => {
    expect(panel).toMatch(/if \(busy \|\| reingestingId\) return/);
    expect(panel).toMatch(/disabled=\{busy \|\| Boolean\(reingestingId\)\}/);
  });

  it('resume path cannot stay at indexing forever without failure handling', () => {
    expect(panel).toMatch(/Resuming chunks from Storage \(no re-upload\)/);
    expect(panel).toMatch(/RESUME_CLIENT_TIMEOUT_MS/);
    expect(panel).toMatch(/exceeded server execution time/);
  });
});
