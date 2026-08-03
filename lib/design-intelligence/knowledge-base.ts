import { EKB_TOPICS } from '@/lib/compliance/ekb-catalog';
import { cosineSimilarity, embedText, chunkText, extractTextFromFile } from '@/lib/design-intelligence/embeddings';
import { completeIndexingJob, enqueueIndexingJob } from '@/lib/design-intelligence/jobs';
import type {
  DiKnowledgeChunk,
  DiKnowledgeDocument,
  KnowledgeDocStatus,
  RagAnswer,
  RagCitation,
} from '@/lib/design-intelligence/types';
import { KNOWLEDGE_CATEGORIES } from '@/lib/design-intelligence/types';
import { isDemoMode, supabase } from '@/lib/supabase';

const LOCAL_DOCS_KEY = 'tawaqqa_di_knowledge_docs_v1';
const LOCAL_CHUNKS_KEY = 'tawaqqa_di_knowledge_chunks_v1';
const BUCKET = 'design-knowledge';

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readLocalDocs(): DiKnowledgeDocument[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DOCS_KEY) || '[]') as DiKnowledgeDocument[];
  } catch {
    return [];
  }
}

function writeLocalDocs(docs: DiKnowledgeDocument[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_DOCS_KEY, JSON.stringify(docs.slice(0, 200)));
}

function readLocalChunks(): DiKnowledgeChunk[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CHUNKS_KEY) || '[]') as DiKnowledgeChunk[];
  } catch {
    return [];
  }
}

function writeLocalChunks(chunks: DiKnowledgeChunk[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_CHUNKS_KEY, JSON.stringify(chunks.slice(0, 5000)));
}

/** Seed built-in EKB topics as indexed knowledge (offline, no internet). */
export function ensureSeedKnowledgeBase(): { docs: DiKnowledgeDocument[]; chunks: DiKnowledgeChunk[] } {
  const existing = readLocalDocs();
  if (existing.some((d) => d.source_kind === 'ekb-seed')) {
    return { docs: existing, chunks: readLocalChunks() };
  }

  const now = new Date().toISOString();
  const docs: DiKnowledgeDocument[] = [];
  const chunks: DiKnowledgeChunk[] = [];

  for (const topic of EKB_TOPICS) {
    const id = uid('ekb');
      const text = [
      topic.title,
      topic.summary,
      `Standards: ${topic.standard}`,
      `Tags: ${(topic.tags || []).join(', ')}`,
    ].join('\n\n');
    const parts = chunkText(text, 700);
    docs.push({
      id,
      title: topic.title,
      category: 'SBC',
      discipline: 'Fire Protection',
      revision: '1',
      author_name: 'EKB Catalog',
      version_label: '1.0',
      tags: topic.tags || [],
      keywords: topic.tags || [],
      applicable_codes: topic.standard === 'BOTH' ? ['SBC', 'NFPA'] : [topic.standard],
      status: 'active',
      notes: 'Seeded from Engineering Knowledge Base catalog',
      file_name: `${topic.id}.md`,
      source_kind: 'ekb-seed',
      index_status: 'indexed',
      indexed_at: now,
      chunk_count: parts.length,
      ocr_used: false,
      extracted_text: text,
      created_at: now,
      updated_at: now,
    });
    parts.forEach((part, i) => {
      chunks.push({
        id: uid('chk'),
        document_id: id,
        chunk_index: i,
        page_number: part.pageGuess,
        paragraph_ref: `§${i + 1}`,
        code_reference: topic.standard === 'BOTH' ? 'SBC/NFPA' : topic.standard,
        content: part.content,
        embedding: embedText(part.content),
        document_title: topic.title,
      });
    });
  }

  const mergedDocs = [...docs, ...existing];
  const mergedChunks = [...chunks, ...readLocalChunks().filter((c) => !docs.some((d) => d.id === c.document_id))];
  writeLocalDocs(mergedDocs);
  writeLocalChunks(mergedChunks);
  return { docs: mergedDocs, chunks: mergedChunks };
}

export function listKnowledgeDocumentsSync(): DiKnowledgeDocument[] {
  ensureSeedKnowledgeBase();
  return readLocalDocs();
}

export async function listKnowledgeDocuments(): Promise<DiKnowledgeDocument[]> {
  ensureSeedKnowledgeBase();
  if (!isDemoMode) {
    const { data, error } = await supabase
      .from('di_knowledge_documents')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && data?.length) return data as DiKnowledgeDocument[];
  }
  return readLocalDocs();
}

async function tryUploadToStorage(file: File, docId: string): Promise<{ path: string | null; bucket: string }> {
  if (isDemoMode || typeof window === 'undefined') return { path: null, bucket: BUCKET };
  try {
    const path = `${docId}/${file.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) return { path: null, bucket: BUCKET };
    return { path, bucket: BUCKET };
  } catch {
    return { path: null, bucket: BUCKET };
  }
}

export async function indexDocumentText(
  doc: DiKnowledgeDocument,
  text: string,
  ocrUsed = false
): Promise<{ doc: DiKnowledgeDocument; chunks: DiKnowledgeChunk[] }> {
  const parts = chunkText(text);
  const chunks: DiKnowledgeChunk[] = parts.map((part, i) => ({
    id: uid('chk'),
    document_id: doc.id,
    chunk_index: i,
    page_number: part.pageGuess,
    paragraph_ref: `§${i + 1}`,
    code_reference: doc.applicable_codes?.[0] || null,
    content: part.content,
    embedding: embedText(part.content),
    document_title: doc.title,
  }));

  const updated: DiKnowledgeDocument = {
    ...doc,
    extracted_text: text,
    ocr_used: ocrUsed,
    index_status: 'indexed',
    indexed_at: new Date().toISOString(),
    chunk_count: chunks.length,
    status: (doc.status || 'active') as KnowledgeDocStatus,
    updated_at: new Date().toISOString(),
  };

  // Local store (always — works on GitHub Pages / demo)
  const docs = readLocalDocs().filter((d) => d.id !== doc.id);
  docs.unshift(updated);
  writeLocalDocs(docs);
  const otherChunks = readLocalChunks().filter((c) => c.document_id !== doc.id);
  writeLocalChunks([...chunks, ...otherChunks]);

  if (!isDemoMode) {
    await supabase.from('di_knowledge_documents').upsert({
      id: updated.id,
      title: updated.title,
      category: updated.category,
      discipline: updated.discipline,
      revision: updated.revision,
      issue_date: updated.issue_date,
      author_name: updated.author_name,
      version_label: updated.version_label,
      version_no: updated.version_no || 1,
      parent_document_id: updated.parent_document_id || null,
      tags: updated.tags,
      keywords: updated.keywords,
      project_type: updated.project_type,
      building_type: updated.building_type,
      hazard_classification: updated.hazard_classification,
      applicable_codes: updated.applicable_codes,
      status: updated.status,
      notes: updated.notes,
      file_name: updated.file_name,
      file_mime: updated.file_mime,
      file_size_bytes: updated.file_size_bytes,
      storage_bucket: updated.storage_bucket,
      storage_path: updated.storage_path,
      source_kind: updated.source_kind,
      index_status: updated.index_status,
      indexed_at: updated.indexed_at,
      chunk_count: updated.chunk_count,
      ocr_used: updated.ocr_used,
      updated_at: updated.updated_at,
    });
    await supabase.from('di_knowledge_chunks').delete().eq('document_id', doc.id);
    if (chunks.length) {
      await supabase.from('di_knowledge_chunks').insert(
        chunks.map((c) => ({
          id: c.id,
          document_id: c.document_id,
          chunk_index: c.chunk_index,
          page_number: c.page_number,
          paragraph_ref: c.paragraph_ref,
          code_reference: c.code_reference,
          content: c.content,
          token_estimate: Math.ceil(c.content.length / 4),
          embedding_json: c.embedding,
        }))
      );
    }
  }

  await completeIndexingJob(doc.id, true);
  return { doc: updated, chunks };
}

export async function uploadAndIndexKnowledgeFile(input: {
  file: File;
  meta: Partial<DiKnowledgeDocument> & { title: string };
}): Promise<DiKnowledgeDocument> {
  const id = uid('doc');
  const { text, ocrUsed } = await extractTextFromFile(input.file);
  const storage = await tryUploadToStorage(input.file, id);
  let dataUrl: string | null = null;
  if (!storage.path && input.file.size < 1_200_000) {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(input.file);
    }).catch(() => null);
  }

  const draft: DiKnowledgeDocument = {
    id,
    title: input.meta.title,
    category: input.meta.category || KNOWLEDGE_CATEGORIES[0],
    discipline: input.meta.discipline || 'Fire Protection',
    revision: input.meta.revision || 'A',
    issue_date: input.meta.issue_date || new Date().toISOString().slice(0, 10),
    author_name: input.meta.author_name || '',
    version_label: input.meta.version_label || '1.0',
    version_no: input.meta.version_no || 1,
    parent_document_id: input.meta.parent_document_id || null,
    tags: input.meta.tags || [],
    keywords: input.meta.keywords || [],
    project_type: input.meta.project_type || '',
    building_type: input.meta.building_type || '',
    hazard_classification: input.meta.hazard_classification || '',
    applicable_codes: input.meta.applicable_codes || [],
    status: 'active',
    notes: input.meta.notes || '',
    file_name: input.file.name,
    file_mime: input.file.type,
    file_size_bytes: input.file.size,
    storage_bucket: storage.bucket,
    storage_path: storage.path,
    data_url: dataUrl,
    source_kind: 'upload',
    index_status: 'processing',
    chunk_count: 0,
    ocr_used: ocrUsed,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await enqueueIndexingJob({ documentId: id, jobType: 'index' });
  const { doc } = await indexDocumentText(draft, text, ocrUsed);

  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'CREATE',
      module: 'design',
      details: `Knowledge document indexed: ${doc.title}`,
      metadata: {
        documentId: doc.id,
        chunkCount: doc.chunk_count,
        category: doc.category,
        ocrUsed: doc.ocr_used,
      },
    })
  );

  return doc;
}

const CONFIDENCE_FLOOR = 0.18;

export async function ragQuery(question: string, topK = 5): Promise<RagAnswer> {
  ensureSeedKnowledgeBase();
  const q = question.trim();
  if (!q) {
    return {
      answer: 'No reliable reference found.',
      citations: [],
      confidence: 0,
      reliable: false,
      message: 'Empty question',
    };
  }

  let chunks = readLocalChunks();
  if (!chunks.length && !isDemoMode) {
    const { data } = await supabase.from('di_knowledge_chunks').select('*').limit(2000);
    if (data?.length) {
      chunks = data.map((row) => ({
        id: row.id,
        document_id: row.document_id,
        chunk_index: row.chunk_index,
        page_number: row.page_number,
        paragraph_ref: row.paragraph_ref,
        code_reference: row.code_reference,
        content: row.content,
        embedding: (row.embedding_json as number[]) || embedText(row.content),
        document_title: undefined,
      }));
    }
  }

  const docs = readLocalDocs();
  const qVec = embedText(q);
  const scored = chunks
    .map((chunk) => {
      const emb = chunk.embedding?.length ? chunk.embedding : embedText(chunk.content);
      const sim = cosineSimilarity(qVec, emb);
      return { chunk, sim };
    })
    .sort((a, b) => b.sim - a.sim)
    .slice(0, topK);

  const best = scored[0]?.sim ?? 0;
  if (best < CONFIDENCE_FLOOR || !scored.length) {
    return {
      answer: 'No reliable reference found.',
      citations: [],
      confidence: Math.round(best * 100),
      reliable: false,
      message: 'No reliable reference found.',
    };
  }

  const citations: RagCitation[] = scored.map(({ chunk, sim }) => {
    const doc = docs.find((d) => d.id === chunk.document_id);
    return {
      documentId: chunk.document_id,
      documentTitle: chunk.document_title || doc?.title || 'Document',
      pageNumber: chunk.page_number ?? null,
      paragraph: chunk.content.slice(0, 420),
      codeReference: chunk.code_reference || doc?.applicable_codes?.[0] || null,
      confidence: Math.round(sim * 100),
      chunkId: chunk.id,
    };
  });

  const top = citations[0];
  const answer = [
    `Based on indexed company knowledge (offline RAG):`,
    '',
    top.paragraph,
    '',
    `Reference: ${top.documentTitle}${top.pageNumber != null ? ` · p.${top.pageNumber}` : ''}${
      top.codeReference ? ` · ${top.codeReference}` : ''
    }`,
    `Confidence: ${top.confidence}%`,
  ].join('\n');

  return {
    answer,
    citations,
    confidence: top.confidence,
    reliable: true,
  };
}

export function knowledgeCategories(): readonly string[] {
  return KNOWLEDGE_CATEGORIES;
}
