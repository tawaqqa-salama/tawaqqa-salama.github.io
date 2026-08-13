/**
 * Resume incomplete NFPA 13-2025 chunk persistence for an existing Storage object.
 *
 * Does NOT upload. Preserves valid chunks; inserts only missing pages/content.
 *
 * Target (Production):
 *   document_id = f2cb639d-ea72-4322-b851-d04a38ef930d
 *   company_id  = 3580b47a-a57b-4b3c-8f0d-db72870c8a85
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run resume:nfpa13-chunks
 *   DOCUMENT_ID=... npm run resume:nfpa13-chunks
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  applyOcrFallbackToPages,
  chunkPagesPreserving,
  extractPdfPagesFromBytes,
} from '../lib/design-intelligence/code-knowledge/pdf-page-extract';
import { detectSourceRefsFromText } from '../lib/design-intelligence/code-knowledge/source-refs';
import { embedText } from '../lib/design-intelligence/embeddings';
import { createHash } from 'node:crypto';

const COMPANY_ID = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';
const DEFAULT_DOC_ID = 'f2cb639d-ea72-4322-b851-d04a38ef930d';
const BUCKET = 'design-knowledge';
const BATCH_SIZE = 8;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 400;

function requireEnv(name: string): string {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fingerprint(pageStart: number | null, content: string): string {
  const page = pageStart ?? 0;
  const body = String(content || '').trim();
  let h = 2166136261;
  const s = `${page}|${body.length}|${body.slice(0, 160)}|${body.slice(-80)}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${page}:${body.length}:${(h >>> 0).toString(16)}`;
}

function isTransient(message: string): boolean {
  return /timeout|57014|57P01|502|503|504|429|fetch failed|network|ECONNRESET|ETIMEDOUT|cloudflare|statement timeout|serializing|too large|payload/i.test(
    message
  );
}

async function listExisting(sb: SupabaseClient, documentId: string) {
  const out: Array<{
    chunk_index: number;
    page_start: number | null;
    page_end: number | null;
    fingerprint: string;
  }> = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('di_knowledge_chunks')
      .select('chunk_index, page_start, page_end, content')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`list chunks failed: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      out.push({
        chunk_index: row.chunk_index ?? 0,
        page_start: row.page_start ?? null,
        page_end: row.page_end ?? null,
        fingerprint: fingerprint(row.page_start, row.content || ''),
      });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function coverageFromRows(
  rows: Array<{ page_start: number | null; page_end: number | null; content?: string }>,
  expectedPages?: number
) {
  const covered = new Set<number>();
  let min_page: number | null = null;
  let max_page_end: number | null = null;
  let empty = 0;
  const fps = new Map<string, number>();
  for (const row of rows) {
    const content = String(row.content || '').trim();
    if (!content) empty += 1;
    const start = row.page_start ?? row.page_end;
    const end = row.page_end ?? row.page_start;
    if (typeof start === 'number') {
      min_page = min_page == null ? start : Math.min(min_page, start);
      for (let p = start; p <= (end ?? start); p += 1) covered.add(p);
    }
    if (typeof end === 'number') {
      max_page_end = max_page_end == null ? end : Math.max(max_page_end, end);
    }
    const fp = fingerprint(row.page_start ?? null, content);
    fps.set(fp, (fps.get(fp) || 0) + 1);
  }
  let duplicate_fingerprint_count = 0;
  for (const n of fps.values()) if (n > 1) duplicate_fingerprint_count += n - 1;
  const missing_pages: number[] = [];
  if (expectedPages) {
    for (let p = 1; p <= expectedPages; p += 1) {
      if (!covered.has(p)) missing_pages.push(p);
    }
  }
  return {
    chunk_count: rows.length,
    min_page,
    max_page_end,
    covered_pages: Array.from(covered).sort((a, b) => a - b),
    empty_chunk_count: empty,
    duplicate_fingerprint_count,
    missing_pages,
  };
}

async function insertWithRetry(
  sb: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    let batch = rows.slice(i, i + BATCH_SIZE);
    let attempt = 0;
    while (true) {
      attempt += 1;
      const { error } = await sb.from('di_knowledge_chunks').insert(batch);
      if (!error) break;
      if (!isTransient(error.message) || attempt >= MAX_RETRIES) {
        if (batch.length > 1) {
          const mid = Math.ceil(batch.length / 2);
          await insertWithRetry(sb, batch.slice(0, mid));
          await insertWithRetry(sb, batch.slice(mid));
          break;
        }
        throw new Error(`chunk insert failed @${i}: ${error.message}`);
      }
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

async function main() {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const documentId = (process.env.DOCUMENT_ID || DEFAULT_DOC_ID).trim();
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: doc, error: docErr } = await sb
    .from('di_knowledge_documents')
    .select('*')
    .eq('id', documentId)
    .eq('company_id', COMPANY_ID)
    .maybeSingle();
  if (docErr || !doc) {
    throw new Error(`document not found: ${docErr?.message || documentId}`);
  }
  if (!doc.storage_path) throw new Error('storage_path_missing');

  console.log('ROOT document', {
    id: doc.id,
    storage_path: doc.storage_path,
    page_count: doc.page_count,
    ingestion_status: doc.ingestion_status,
    chunk_count: doc.chunk_count,
  });

  const existing = await listExisting(sb, documentId);
  const before = coverageFromRows(
    existing.map((e) => ({
      page_start: e.page_start,
      page_end: e.page_end,
      content: 'x',
    })),
    doc.page_count || undefined
  );
  // Re-fetch contents for accurate empty/dup counts
  const beforeFull = coverageFromRows(
    (
      await sb
        .from('di_knowledge_chunks')
        .select('page_start, page_end, content')
        .eq('document_id', documentId)
        .limit(100000)
    ).data || [],
    doc.page_count || undefined
  );
  console.log('Coverage BEFORE', beforeFull);

  const { data: blob, error: dlErr } = await sb.storage
    .from(BUCKET)
    .download(doc.storage_path);
  if (dlErr || !blob) throw new Error(`download failed: ${dlErr?.message}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const extracted = await extractPdfPagesFromBytes(bytes);
  const afterOcr = applyOcrFallbackToPages(extracted.pages);
  const parts = chunkPagesPreserving(afterOcr.pages, 700, {
    includeEmptyPagePlaceholders: true,
  });
  console.log('Expected parts', {
    page_count: afterOcr.page_count,
    parts: parts.length,
    pages_extracted: afterOcr.pages_extracted,
    pages_ocr: afterOcr.pages_ocr,
  });

  const existingFp = new Set(existing.map((e) => e.fingerprint));
  let nextIndex = existing.reduce((m, e) => Math.max(m, e.chunk_index), -1) + 1;
  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const p of parts) {
    const fp = fingerprint(p.page_start, p.content);
    if (existingFp.has(fp)) {
      skipped += 1;
      continue;
    }
    const refs = detectSourceRefsFromText(p.content, {
      pageGuess: p.page_start,
      allowPageGuess: true,
    });
    toInsert.push({
      id: crypto.randomUUID(),
      company_id: COMPANY_ID,
      document_id: documentId,
      chunk_index: nextIndex++,
      page_number: refs.page_number ?? p.page_start,
      page_start: p.page_start,
      page_end: p.page_end,
      extraction_method: p.extraction_method,
      content: p.content,
      code: doc.code || 'NFPA-13',
      edition: doc.edition || '2025',
      section: refs.section,
      subsection: refs.subsection,
      table_reference: refs.table_reference,
      figure_reference: refs.figure_reference,
      paragraph_ref: refs.paragraph_reference || null,
      code_reference: refs.code_reference || null,
      source_document_id: doc.source_document_id || `storage:${doc.storage_path}`,
      source_verification_status: refs.source_verification_status,
      token_estimate: Math.ceil(p.content.length / 4),
      embedding_json: embedText(p.content),
    });
  }

  console.log('Resume insert', { toInsert: toInsert.length, skipped });
  if (toInsert.length) await insertWithRetry(sb, toInsert);

  const { data: afterRows } = await sb
    .from('di_knowledge_chunks')
    .select('page_start, page_end, content')
    .eq('document_id', documentId)
    .limit(100000);
  const after = coverageFromRows(afterRows || [], afterOcr.page_count);
  console.log('Coverage AFTER', after);

  const ok =
    after.max_page_end === afterOcr.page_count &&
    after.missing_pages.length === 0 &&
    after.empty_chunk_count === 0 &&
    after.duplicate_fingerprint_count === 0;

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from('di_knowledge_documents')
    .update({
      ingestion_status: ok ? 'indexed' : 'failed',
      index_status: ok ? 'indexed' : 'failed',
      extraction_status: 'indexed',
      extract_status: 'indexed',
      embedding_status: ok ? 'indexed' : doc.embedding_status,
      chunk_count: after.chunk_count,
      page_count: afterOcr.page_count,
      pages_extracted: afterOcr.pages_extracted,
      pages_ocr: afterOcr.pages_ocr,
      sha256,
      content_sha256: sha256,
      updated_at: now,
      last_ingestion_at: now,
    })
    .eq('id', documentId)
    .eq('company_id', COMPANY_ID);
  if (upErr) throw new Error(`doc update failed: ${upErr.message}`);

  console.log(
    JSON.stringify(
      {
        ok,
        sha256,
        chunks_before: beforeFull.chunk_count,
        chunks_after: after.chunk_count,
        coverage_before: {
          min_page: beforeFull.min_page,
          max_page_end: beforeFull.max_page_end,
        },
        coverage_after: {
          min_page: after.min_page,
          max_page_end: after.max_page_end,
        },
        missing_pages: after.missing_pages,
        duplicate_chunks: after.duplicate_fingerprint_count,
        empty_chunks: after.empty_chunk_count,
        inserted: toInsert.length,
        skipped,
      },
      null,
      2
    )
  );

  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
