/**
 * Offline embedding — deterministic bag-of-tokens hash vector (384-d).
 * Production can swap for OpenAI/voyage embeddings written into pgvector;
 * this keeps RAG isolated from the internet by default.
 *
 * Tokenization uses search-only normalization + small lexical aliases.
 * Display / citation text must never be overwritten with this normalized form.
 */

const DIM = 384;

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;
const TATWEEL = /\u0640/g;

/** Lexical aliases for retrieval only — not engineering rules. */
const TOKEN_ALIASES: Record<string, string[]> = {
  رشاش: ['رشاشات', 'sprinkler', 'sprinklers'],
  رشاشات: ['رشاش', 'sprinkler', 'sprinklers'],
  sprinkler: ['sprinklers', 'رشاش', 'رشاشات'],
  sprinklers: ['sprinkler', 'رشاش', 'رشاشات'],
  مضخة: ['مضخات', 'pump', 'pumps'],
  مضخات: ['مضخة', 'pump', 'pumps'],
  pump: ['pumps', 'مضخة', 'مضخات'],
  pumps: ['pump', 'مضخة', 'مضخات'],
  خزان: ['خزانات', 'tank', 'tanks'],
  خزانات: ['خزان', 'tank', 'tanks'],
  tank: ['tanks', 'خزان', 'خزانات'],
  tanks: ['tank', 'خزان', 'خزانات'],
  انذار: ['إنذار', 'alarm'],
  إنذار: ['انذار', 'alarm'],
  alarm: ['انذار', 'إنذار'],
  دخان: ['smoke'],
  smoke: ['دخان'],
  اطفاء: ['إطفاء', 'firefighting'],
  إطفاء: ['اطفاء', 'firefighting'],
  firefighting: ['اطفاء', 'إطفاء'],
  'الدفاع المدني': ['civil defense', 'civildefence'],
  'civil defense': ['الدفاع المدني', 'civildefence'],
};

/**
 * Search-only normalization. Do NOT overwrite stored/display evidence with this.
 */
export function normalizeKnowledgeSearchText(text: string): string {
  let s = String(text || '');
  s = s.replace(ARABIC_DIACRITICS, '');
  s = s.replace(TATWEEL, '');
  // Alef variants → ا
  s = s.replace(/[أإآ]/g, 'ا');
  // Yeh / alef maqsura — safe for search
  s = s.replace(/ى/g, 'ي');
  // Canonical code tokens (keep numbers)
  s = s.replace(/\bNFPA[\s-]?(\d+(?:\.\d+)*)\b/gi, (_m, n) => ` nfpa${String(n).replace(/\./g, '')} nfpa ${n} `);
  s = s.replace(/\bSBC[\s-]?(\d+(?:\.\d+)*)\b/gi, (_m, n) => ` sbc${String(n).replace(/\./g, '')} sbc ${n} `);
  // Punctuation → spaces (keep digits and letters)
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s;
}

function expandAliases(token: string): string[] {
  const out = new Set<string>([token]);
  const aliases = TOKEN_ALIASES[token];
  if (aliases) {
    for (const a of aliases) out.add(a.toLowerCase());
  }
  // Also check if any alias key matches after alef norm
  return [...out];
}

function tokenize(text: string): string[] {
  const normalized = normalizeKnowledgeSearchText(text);
  const base = normalized.split(/\s+/).filter((t) => t.length > 1);
  const expanded: string[] = [];
  for (const t of base) {
    for (const e of expandAliases(t)) {
      if (e.length > 1) expanded.push(e);
    }
  }
  return expanded;
}

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function embedText(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) return vec;
  for (const token of tokens) {
    const idx = hashToken(token) % DIM;
    const sign = hashToken(`${token}#`) % 2 === 0 ? 1 : -1;
    vec[idx] += sign;
  }
  // L2 normalize
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export function chunkText(text: string, maxChars = 900): { content: string; index: number; pageGuess: number }[] {
  const clean = String(text || '').replace(/\r/g, '').trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: { content: string; index: number; pageGuess: number }[] = [];
  let buffer = '';
  let index = 0;
  let page = 1;
  const flush = () => {
    if (!buffer.trim()) return;
    chunks.push({ content: buffer.trim(), index, pageGuess: page });
    index += 1;
    if (index % 3 === 0) page += 1;
    buffer = '';
  };
  for (const para of paragraphs.length ? paragraphs : [clean]) {
    if ((buffer + '\n\n' + para).length > maxChars) {
      flush();
      if (para.length > maxChars) {
        for (let i = 0; i < para.length; i += maxChars) {
          buffer = para.slice(i, i + maxChars);
          flush();
        }
      } else {
        buffer = para;
      }
    } else {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
    }
  }
  flush();
  return chunks;
}

/** Extract text from uploaded files. PDFs use real page-by-page extraction (no invented body). */
export async function extractTextFromFile(file: File): Promise<{
  text: string;
  ocrUsed: boolean;
  page_count?: number;
  pages_extracted?: number;
  pages_ocr?: number;
  page_texts?: string[];
  extraction_method?: string;
}> {
  const name = file.name.toLowerCase();
  const mime = file.type || '';

  if (
    mime.startsWith('text/') ||
    name.endsWith('.txt') ||
    name.endsWith('.csv') ||
    name.endsWith('.md')
  ) {
    const text = await file.text();
    const { pagesFromPlainText } = await import(
      '@/lib/design-intelligence/code-knowledge/pdf-page-extract'
    );
    const pages = pagesFromPlainText(text);
    return {
      text: pages.combined_text || text,
      ocrUsed: false,
      page_count: pages.page_count || 1,
      pages_extracted: pages.pages_extracted,
      pages_ocr: 0,
      page_texts: pages.pages.map((p) => p.text),
      extraction_method: 'text',
    };
  }

  if (name.endsWith('.json')) {
    const text = await file.text();
    return {
      text,
      ocrUsed: false,
      page_count: 1,
      pages_extracted: 1,
      pages_ocr: 0,
      page_texts: [text],
      extraction_method: 'text',
    };
  }

  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    const { extractPdfPagesFromBytes, applyOcrFallbackToPages } = await import(
      '@/lib/design-intelligence/code-knowledge/pdf-page-extract'
    );
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      let extracted = await extractPdfPagesFromBytes(bytes);
      const needsOcr =
        extracted.page_count === 0 ||
        extracted.pages.every((p) => !p.text.trim());
      if (needsOcr || extracted.pages.some((p) => !p.text.trim())) {
        // OCR fallback marks empty pages; does not invent NFPA body text
        extracted = applyOcrFallbackToPages(extracted.pages);
      }
      return {
        text: extracted.combined_text,
        ocrUsed: extracted.ocr_used,
        page_count: extracted.page_count,
        pages_extracted: extracted.pages_extracted,
        pages_ocr: extracted.pages_ocr,
        page_texts: extracted.pages.map((p) => p.text),
        extraction_method: extracted.extraction_method,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Surface truthful PDF stage failure — never silently become chunks_missing
      throw new Error(
        message.startsWith('pdf_extraction_failed:')
          ? message
          : `pdf_extraction_failed: ${message}`
      );
    }
  }

  // Images / Office / CAD: metadata only until dedicated parsers exist — never invent standards text
  const meta = [
    `File: ${file.name}`,
    `MIME: ${mime || 'unknown'}`,
    `Size: ${file.size} bytes`,
    'Note: Full OCR/DWG parsing runs via background indexing job when Storage + worker are configured.',
    'Indexed keywords from filename for offline semantic search.',
    name.replace(/[_\-.]+/g, ' '),
  ].join('\n');
  return {
    text: meta,
    ocrUsed: true,
    page_count: 1,
    pages_extracted: 0,
    pages_ocr: 1,
    page_texts: [meta],
    extraction_method: 'ocr',
  };
}
