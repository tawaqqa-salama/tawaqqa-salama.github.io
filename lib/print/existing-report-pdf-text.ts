import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { foldArabicPdfText } from '@/lib/projects/existing-report-presentation';

export type ExistingReportPdfTextExtraction = {
  engine: 'pdftotext' | 'pdfjs';
  text: string;
  arabicCharCount: number;
  folded: string;
};

export async function extractExistingReportPdfText(pdfBuffer: Buffer): Promise<ExistingReportPdfTextExtraction> {
  const pdftotext = spawnSync('pdftotext', ['-', '-'], { input: pdfBuffer, encoding: 'utf8' });
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

export function assertExistingReportArabicPhrases(extraction: ExistingReportPdfTextExtraction): {
  ok: boolean;
  found: string[];
  missing: string[];
  notes: string[];
} {
  const phrases = ['بيانات المنشأة', 'مكونات المشروع', 'أنظمة مكافحة الحريق'];
  const found = phrases.filter((phrase) => extraction.folded.includes(foldArabicPdfText(phrase)));
  const missing = phrases.filter((phrase) => !found.includes(phrase));
  const notes: string[] = [];

  if (extraction.engine === 'pdfjs' && missing.length > 0) {
    notes.push('pdfjs extraction may split Arabic glyphs; pdftotext unavailable in this environment.');
  }
  if (extraction.arabicCharCount < 40) {
    notes.push(`Low Arabic character count (${extraction.arabicCharCount}).`);
  }

  const ok =
    found.length === phrases.length
    || (extraction.arabicCharCount >= 80 && found.length >= 2)
    || (extraction.engine === 'pdfjs' && extraction.arabicCharCount >= 200);
  return { ok, found, missing, notes };
}

export function pdftotextAvailable(): boolean {
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  return probe.status === 0 || probe.stderr?.includes('pdftotext') || existsSync('/usr/bin/pdftotext');
}
