/**
 * READ-ONLY Production audit for Design Intelligence knowledge documents.
 *
 * Saudi-only policy: classify each document as SAUDI / NON_SAUDI / AMBIGUOUS
 * using title, filename, storage_path, metadata, and content samples —
 * NEVER the `code` column alone (known mislabels: Saudi title + code=NFPA-13).
 *
 * Safety:
 * - SELECT only (documents + chunks)
 * - Does NOT delete Storage objects
 * - Does NOT delete / update DB rows
 * - Does NOT reingest
 * - Does NOT modify RLS
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   COMPANY_ID   (default: Production company)
 *   AUDIT_OUT    (default: artifacts/saudi-only-knowledge-audit.json)
 *
 * Usage:
 *   npx tsx scripts/audit-saudi-only-knowledge.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_COMPANY_ID = '3580b47a-a57b-4b3c-8f0d-db72870c8a85';
const DEFAULT_OUT = 'artifacts/saudi-only-knowledge-audit.json';

export type AuditClassification = 'SAUDI' | 'NON_SAUDI' | 'AMBIGUOUS';
export type AuditAction = 'KEEP' | 'DELETE' | 'MANUAL_REVIEW';

export type AuditRow = {
  document_id: string;
  title: string;
  filename: string;
  current_code: string | null;
  edition: string | null;
  page_count: number | null;
  chunk_count: number;
  storage_path: string | null;
  classification: AuditClassification;
  recommended_action: AuditAction;
  reason: string;
  mislabeled: boolean;
  applicable_codes: string[];
  index_status: string | null;
  deleted_at: string | null;
  content_sample_preview: string | null;
};

const SAUDI_TITLE_RE =
  /الكود\s*السعودي|saudi\s*building\s*code|saudi\s*fire\s*code|\bSBC\b|كود\s*البناء\s*السعودي|الحماية\s*من\s*الحريق/i;
const NFPA_RE = /\bnfpa\b|نفبا/i;
const SBC_CODE_RE = /\bSBC\s*-?\s*\d+\b/i;
const NFPA_CODE_RE = /\bNFPA\s*-?\s*\d+\b/i;
const INTL_RE =
  /\b(IBC|IFC|IMC|IPC|IECC|ASHRAE|ASME|ISO\s*\d|EN\s*\d|BS\s*\d|UL\s*\d|FM\s*Global|ICC)\b/i;

function requireEnv(name: string): string {
  const v = (process.env[name] || '').trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function codeLooksNfpa(code: string | null | undefined): boolean {
  return NFPA_CODE_RE.test(String(code || '')) || /^NFPA/i.test(String(code || ''));
}

function codeLooksSbc(code: string | null | undefined): boolean {
  return SBC_CODE_RE.test(String(code || '')) || /^SBC/i.test(String(code || ''));
}

/**
 * Classify without trusting `code` alone.
 * Exported for unit tests.
 */
export function classifyKnowledgeDocument(input: {
  title?: string | null;
  filename?: string | null;
  storage_path?: string | null;
  code?: string | null;
  edition?: string | null;
  applicable_codes?: string[] | null;
  content_sample?: string | null;
}): {
  classification: AuditClassification;
  recommended_action: AuditAction;
  reason: string;
  mislabeled: boolean;
} {
  const title = String(input.title || '').trim();
  const filename = String(input.filename || '').trim();
  const path = String(input.storage_path || '').trim();
  const code = String(input.code || '').trim();
  const edition = String(input.edition || '').trim();
  const content = String(input.content_sample || '');
  const applicable = input.applicable_codes || [];

  const saudiTitle = SAUDI_TITLE_RE.test(title) || SAUDI_TITLE_RE.test(filename);
  const saudiPath = /\/code-knowledge\/(SBC|SAUDI)/i.test(path);
  const saudiContent = SAUDI_TITLE_RE.test(content.slice(0, 2500));

  const nfpaTitle = NFPA_RE.test(title) || NFPA_RE.test(filename);
  const nfpaPath = /\/code-knowledge\/NFPA/i.test(path);
  const nfpaContent = NFPA_RE.test(content.slice(0, 2500));
  const intlName =
    INTL_RE.test(title) || INTL_RE.test(filename) || INTL_RE.test(path);

  const codeIsNfpa = codeLooksNfpa(code);
  const codeIsSbc = codeLooksSbc(code);
  const mislabeled = (saudiTitle && codeIsNfpa) || (nfpaTitle && codeIsSbc);

  // Strong SAUDI signals win even when code=NFPA-* (known Production mislabel).
  if (saudiTitle || (saudiPath && !nfpaTitle)) {
    return {
      classification: 'SAUDI',
      recommended_action: 'KEEP',
      reason: mislabeled
        ? `Saudi/SBC identity from title/filename/path; persisted code=${code || 'null'} edition=${edition || 'null'} is MISLABELED — repair metadata, do not delete`
        : `Saudi/SBC identity from title/filename/path`,
      mislabeled,
    };
  }

  if (nfpaTitle || nfpaPath || (nfpaContent && !saudiContent) || intlName) {
    return {
      classification: 'NON_SAUDI',
      recommended_action: 'DELETE',
      reason: `Non-Saudi reference evidence (nfpaTitle=${nfpaTitle}, nfpaPath=${nfpaPath}, intl=${intlName}, code=${code || 'null'})`,
      mislabeled,
    };
  }

  if (saudiContent && !nfpaTitle && !nfpaPath) {
    return {
      classification: 'SAUDI',
      recommended_action: 'KEEP',
      reason: `Saudi/SBC signals in extracted content sample; code=${code || 'null'}`,
      mislabeled,
    };
  }

  if (codeIsNfpa || codeIsSbc || applicable.some((c) => /nfpa|sbc/i.test(c))) {
    return {
      classification: 'AMBIGUOUS',
      recommended_action: 'MANUAL_REVIEW',
      reason: `Insufficient title/filename/path/content evidence; code/applicable_codes alone are not trusted (code=${code || 'null'})`,
      mislabeled,
    };
  }

  return {
    classification: 'AMBIGUOUS',
    recommended_action: 'MANUAL_REVIEW',
    reason:
      'No clear Saudi or non-Saudi identity from title, filename, path, or content sample',
    mislabeled: false,
  };
}

async function fetchContentSample(
  sb: SupabaseClient,
  documentId: string
): Promise<string | null> {
  const { data, error } = await sb
    .from('di_knowledge_chunks')
    .select('content, chunk_index, page_number')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })
    .limit(3);
  if (error || !data?.length) return null;
  return data
    .map((row) => String((row as { content?: string }).content || ''))
    .join('\n---\n')
    .slice(0, 4000);
}

async function countChunks(
  sb: SupabaseClient,
  documentId: string
): Promise<number> {
  const { count, error } = await sb
    .from('di_knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);
  if (error) {
    throw new Error(`chunk count failed for ${documentId}: ${error.message}`);
  }
  return count || 0;
}

async function listDocuments(sb: SupabaseClient, companyId: string) {
  const pageSize = 200;
  const rows: Array<Record<string, unknown>> = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from('di_knowledge_documents')
      .select(
        [
          'id',
          'title',
          'file_name',
          'code',
          'edition',
          'page_count',
          'chunk_count',
          'storage_path',
          'applicable_codes',
          'index_status',
          'ingestion_status',
          'platform_verification_status',
          'verification_status',
          'deleted_at',
          'company_id',
          'created_at',
          'updated_at',
        ].join(',')
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`di_knowledge_documents select failed: ${error.message}`);
    }
    if (!data?.length) break;
    rows.push(...(data as Array<Record<string, unknown>>));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function toMarkdownTable(rows: AuditRow[]): string {
  const header = [
    'document_id',
    'title',
    'filename',
    'current_code',
    'edition',
    'page_count',
    'chunk_count',
    'storage_path',
    'classification',
    'recommended_action',
    'reason',
  ];
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ];
  for (const r of rows) {
    const cells = [
      r.document_id,
      r.title.replace(/\|/g, '\\|'),
      r.filename.replace(/\|/g, '\\|'),
      r.current_code ?? '',
      r.edition ?? '',
      r.page_count ?? '',
      r.chunk_count,
      (r.storage_path || '').replace(/\|/g, '\\|'),
      r.classification,
      r.recommended_action,
      r.reason.replace(/\|/g, '\\|').replace(/\n/g, ' '),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

export async function runSaudiOnlyKnowledgeAudit(options?: {
  companyId?: string;
  outPath?: string;
  client?: SupabaseClient;
}): Promise<{
  STATUS: string;
  PRODUCTION_AUDIT: string;
  TOTAL_DOCUMENTS: number;
  SAUDI_KEEP: number;
  NON_SAUDI_DELETE: number;
  AMBIGUOUS_REVIEW: number;
  TOTAL_CHUNKS_AFFECTED: number;
  MISLABELED_DOCUMENTS: number;
  SAFE_TO_DELETE: string;
  DELETION_EXECUTED: string;
  rows: AuditRow[];
}> {
  const companyId = (options?.companyId || process.env.COMPANY_ID || DEFAULT_COMPANY_ID).trim();
  const outPath = (options?.outPath || process.env.AUDIT_OUT || DEFAULT_OUT).trim();

  const sb =
    options?.client ||
    createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

  const docs = await listDocuments(sb, companyId);
  const rows: AuditRow[] = [];

  for (const doc of docs) {
    // Soft-deleted rows are still listed for transparency but flagged in reason path.
    const documentId = String(doc.id);
    const liveChunkCount = await countChunks(sb, documentId);
    const sample = await fetchContentSample(sb, documentId);
    const classified = classifyKnowledgeDocument({
      title: doc.title as string,
      filename: doc.file_name as string,
      storage_path: doc.storage_path as string,
      code: doc.code as string,
      edition: doc.edition as string,
      applicable_codes: (doc.applicable_codes as string[]) || [],
      content_sample: sample,
    });

    rows.push({
      document_id: documentId,
      title: String(doc.title || ''),
      filename: String(doc.file_name || ''),
      current_code: (doc.code as string) || null,
      edition: (doc.edition as string) || null,
      page_count: (doc.page_count as number) ?? null,
      chunk_count: liveChunkCount || Number(doc.chunk_count || 0),
      storage_path: (doc.storage_path as string) || null,
      classification: classified.classification,
      recommended_action: classified.recommended_action,
      reason: classified.reason,
      mislabeled: classified.mislabeled,
      applicable_codes: (doc.applicable_codes as string[]) || [],
      index_status: (doc.index_status as string) || null,
      deleted_at: (doc.deleted_at as string) || null,
      content_sample_preview: sample ? sample.slice(0, 240) : null,
    });
  }

  const saudi = rows.filter((r) => r.classification === 'SAUDI');
  const nonSaudi = rows.filter((r) => r.classification === 'NON_SAUDI');
  const ambiguous = rows.filter((r) => r.classification === 'AMBIGUOUS');
  const mislabeled = rows.filter((r) => r.mislabeled);
  const chunksAffected = nonSaudi.reduce((sum, r) => sum + r.chunk_count, 0);

  const report = {
    STATUS: 'PRODUCTION_AUDIT_COMPLETE',
    PRODUCTION_AUDIT: 'READ ONLY',
    company_id: companyId,
    generated_at: new Date().toISOString(),
    TOTAL_DOCUMENTS: rows.length,
    SAUDI_KEEP: saudi.length,
    NON_SAUDI_DELETE: nonSaudi.length,
    AMBIGUOUS_REVIEW: ambiguous.length,
    TOTAL_CHUNKS_AFFECTED: chunksAffected,
    MISLABELED_DOCUMENTS: mislabeled.length,
    DELETION_EXECUTED: 'NO',
    SAFE_TO_DELETE:
      ambiguous.length === 0 && nonSaudi.length >= 0
        ? 'PENDING_OWNER_APPROVAL'
        : 'NO',
    rows,
    SAUDI_DOCUMENTS_TO_KEEP: saudi.map((r) => r.document_id),
    NON_SAUDI_DOCUMENTS_TO_DELETE: nonSaudi.map((r) => r.document_id),
    AMBIGUOUS_DOCUMENTS: ambiguous.map((r) => r.document_id),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  const mdPath = outPath.replace(/\.json$/i, '.md');
  const md = [
    '# Saudi-only Design Intelligence knowledge audit (READ ONLY)',
    '',
    `Generated: ${report.generated_at}`,
    `Company: \`${companyId}\``,
    '',
    toMarkdownTable(rows),
    '',
    `SAUDI DOCUMENTS TO KEEP = ${saudi.length}`,
    `NON-SAUDI DOCUMENTS TO DELETE = ${nonSaudi.length}`,
    `AMBIGUOUS DOCUMENTS = ${ambiguous.length}`,
    `TOTAL DOCUMENTS = ${rows.length}`,
    `TOTAL CHUNKS AFFECTED = ${chunksAffected}`,
    `MISLABELED DOCUMENTS = ${mislabeled.length}`,
    'DELETION EXECUTED = NO',
    '',
  ].join('\n');
  writeFileSync(mdPath, md, 'utf8');

  return {
    STATUS: report.STATUS,
    PRODUCTION_AUDIT: report.PRODUCTION_AUDIT,
    TOTAL_DOCUMENTS: report.TOTAL_DOCUMENTS,
    SAUDI_KEEP: report.SAUDI_KEEP,
    NON_SAUDI_DELETE: report.NON_SAUDI_DELETE,
    AMBIGUOUS_REVIEW: report.AMBIGUOUS_REVIEW,
    TOTAL_CHUNKS_AFFECTED: report.TOTAL_CHUNKS_AFFECTED,
    MISLABELED_DOCUMENTS: report.MISLABELED_DOCUMENTS,
    SAFE_TO_DELETE: report.SAFE_TO_DELETE,
    DELETION_EXECUTED: report.DELETION_EXECUTED,
    rows,
  };
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1] && /audit-saudi-only-knowledge\.ts$/.test(process.argv[1]));

if (isDirectRun) {
  runSaudiOnlyKnowledgeAudit()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
