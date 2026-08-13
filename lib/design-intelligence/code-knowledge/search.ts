/**
 * Code knowledge RAG search — tenant-safe, edition-filtered.
 * Returns citations only. Never authoritative for PASS.
 */

import { cosineSimilarity, embedText } from '@/lib/design-intelligence/embeddings';
import { getCodeKnowledgeStore } from '@/lib/design-intelligence/code-knowledge/store';
import type {
  CodeKnowledgeSearchHit,
  CodeKnowledgeSearchParams,
} from '@/lib/design-intelligence/code-knowledge/types';

export function searchCodeKnowledge(
  params: CodeKnowledgeSearchParams
): CodeKnowledgeSearchHit[] {
  const companyId = String(params.companyId || '').trim();
  const code = String(params.code || '').trim();
  const edition = String(params.edition || '').trim();
  const query = String(params.query || '').trim();
  const topK = Math.max(1, Math.min(params.topK ?? 8, 40));

  if (!companyId || !code || !edition || !query) {
    return [];
  }

  const store = getCodeKnowledgeStore();
  const includePlatform = params.includePlatformDocuments === true;

  const documentId = params.documentId ? String(params.documentId).trim() : '';
  const sectionFilter = params.section ? String(params.section).trim() : '';
  const pageFilter = typeof params.page === 'number' ? params.page : null;

  const docs = store.documents.filter((d) => {
    if (d.deleted_at) return false;
    if (d.status === 'superseded' || d.ingestion_status === 'superseded') return false;
    if (d.code !== code || d.edition !== edition) return false;
    if (documentId && d.id !== documentId) return false;
    if (d.company_id === companyId) return true;
    if (includePlatform && d.company_id == null) return true;
    return false;
  });

  const docById = new Map(docs.map((d) => [d.id, d]));
  const qVec = embedText(query);
  const qLower = query.toLowerCase();

  const scored: CodeKnowledgeSearchHit[] = [];
  for (const chunk of store.chunks) {
    const doc = docById.get(chunk.document_id);
    if (!doc) continue;
    // Defense in depth: chunk company must match doc / tenant
    if (chunk.company_id != null && chunk.company_id !== companyId) {
      if (!(includePlatform && chunk.company_id == null)) continue;
    }
    if (chunk.code && chunk.code !== code) continue;
    if (chunk.edition && chunk.edition !== edition) continue;
    if (sectionFilter && chunk.section !== sectionFilter) continue;
    if (pageFilter != null) {
      const start = chunk.page_start ?? chunk.page_number;
      const end = chunk.page_end ?? chunk.page_number;
      if (start == null || end == null) continue;
      if (pageFilter < start || pageFilter > end) continue;
    }

    const emb = chunk.embedding?.length ? chunk.embedding : embedText(chunk.content);
    const cos = cosineSimilarity(qVec, emb);
    const hay = chunk.content.toLowerCase();
    const lexical = qLower
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .reduce((acc, t) => acc + (hay.includes(t) ? 0.08 : 0), 0);
    const score = cos + lexical;
    if (score < 0.05 && lexical === 0) continue;

    scored.push({
      chunk,
      document: doc,
      code: doc.code,
      edition: doc.edition,
      section: chunk.section ?? null,
      table: chunk.table_reference ?? null,
      figure: chunk.figure_reference ?? null,
      page: chunk.page_number ?? null,
      relevance_score: Number(score.toFixed(6)),
      source_verification_status: chunk.source_verification_status || 'NOT_VERIFIED',
      document_scope: doc.company_id == null ? 'platform' : 'tenant',
    });
  }

  scored.sort((a, b) => b.relevance_score - a.relevance_score);
  return scored.slice(0, topK);
}

/**
 * Build a non-authoritative RAG answer summary.
 * Explicitly cannot produce compliance PASS.
 */
export function explainCodeKnowledgeHits(hits: CodeKnowledgeSearchHit[]): {
  answer: string;
  citations: CodeKnowledgeSearchHit[];
  authoritative: false;
  can_produce_pass: false;
  message: string;
} {
  if (!hits.length) {
    return {
      answer: '',
      citations: [],
      authoritative: false,
      can_produce_pass: false,
      message: 'No matching code knowledge chunks for this company/code/edition.',
    };
  }
  const top = hits[0];
  const citeBits = hits.slice(0, 3).map((h) => {
    const parts = [
      h.code,
      h.edition,
      h.section ? `§${h.section}` : null,
      h.table,
      h.page != null ? `p.${h.page}` : null,
      `src=${h.source_verification_status}`,
    ].filter(Boolean);
    return parts.join(' · ');
  });
  return {
    answer: top.chunk.content.slice(0, 600),
    citations: hits,
    authoritative: false,
    can_produce_pass: false,
    message: `Advisory RAG only. Citations: ${citeBits.join(' | ')}. Cannot produce PASS.`,
  };
}
