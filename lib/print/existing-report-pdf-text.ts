import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { foldArabicPdfText } from '@/lib/projects/existing-report-presentation';

export type ExistingReportPdfTextExtraction = {
  engine: 'pdftotext' | 'pdfjs';
  text: string;
  arabicCharCount: number;
  folded: string;
};

export const EXISTING_REPORT_ARABIC_EXACT_PHRASES = [
  'التقرير الفني لتقييم الموقع القائم',
  'بيانات المنشأة',
  'أنظمة مكافحة الحريق',
  'الاعتماد والتوقيعات',
] as const;

function normalizeArabicSearchText(value: string): string {
  return foldArabicPdfText(value)
    .normalize('NFKC')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[يى]/g, 'ي');
}

export function existingReportPhrasePresent(extraction: ExistingReportPdfTextExtraction, phrase: string): boolean {
  const normalizedPhrase = normalizeArabicSearchText(phrase);
  const haystacks = [extraction.text, extraction.folded].map(normalizeArabicSearchText);
  return haystacks.some((haystack) => haystack.includes(normalizedPhrase));
}

export async function extractExistingReportPdfText(pdfBuffer: Buffer): Promise<ExistingReportPdfTextExtraction> {
  const pdftotext = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', '-', '-'], { input: pdfBuffer, encoding: 'utf8' });
  if (pdftotext.status === 0 && pdftotext.stdout?.trim()) {
    const text = pdftotext.stdout;
    return {
      engine: 'pdftotext',
      text,
      arabicCharCount: (text.match(/[\u0600-\u06FF]/g) || []).length,
      folded: foldArabicPdfText(text),
    };
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  const text = pages.join('\n');
  return {
    engine: 'pdfjs',
    text,
    arabicCharCount: (text.match(/[\u0600-\u06FF]/g) || []).length,
    folded: foldArabicPdfText(text),
  };
}

export function assertExistingReportArabicExactPhrases(extraction: ExistingReportPdfTextExtraction): {
  ok: boolean;
  exactPhrases: Record<string, boolean>;
  missing: string[];
  notes: string[];
} {
  const exactPhrases = Object.fromEntries(
    EXISTING_REPORT_ARABIC_EXACT_PHRASES.map((phrase) => [phrase, existingReportPhrasePresent(extraction, phrase)])
  ) as Record<string, boolean>;
  const missing = EXISTING_REPORT_ARABIC_EXACT_PHRASES.filter((phrase) => !exactPhrases[phrase]);
  const notes: string[] = [];

  if (extraction.engine === 'pdfjs') {
    notes.push('pdfjs extraction may split Arabic glyphs; install poppler-utils/pdftotext for strict phrase verification.');
  }
  if (extraction.arabicCharCount < 40) {
    notes.push(`Low Arabic character count (${extraction.arabicCharCount}).`);
  }

  const ok = missing.length === 0 && extraction.engine === 'pdftotext';
  return { ok, exactPhrases, missing, notes };
}

/** @deprecated Prefer assertExistingReportArabicExactPhrases for strict verification. */
export function assertExistingReportArabicPhrases(extraction: ExistingReportPdfTextExtraction): {
  ok: boolean;
  found: string[];
  missing: string[];
  notes: string[];
} {
  const strict = assertExistingReportArabicExactPhrases(extraction);
  const found = EXISTING_REPORT_ARABIC_EXACT_PHRASES.filter((phrase) => strict.exactPhrases[phrase]);
  return {
    ok: strict.ok,
    found,
    missing: strict.missing,
    notes: strict.notes,
  };
}

export function pdftotextAvailable(): boolean {
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  return probe.status === 0 || probe.stderr?.includes('pdftotext') || existsSync('/usr/bin/pdftotext');
}
