/**
 * PDF page reconstruction + semantic chunking for Design Intelligence RAG.
 */

import { describe, expect, it } from 'vitest';
import {
  chunkPagesPreserving,
  pagesFromPlainText,
  reconstructPageText,
  type PositionedTextItem,
} from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';
import { normalizeKnowledgeSearchText } from '@/lib/design-intelligence/embeddings';

function item(str: string, x: number, y: number, order: number, height = 10): PositionedTextItem {
  return { str, x, y, height, order };
}

describe('reconstructPageText', () => {
  it('preserves line breaks instead of flattening to one line', () => {
    const items = [
      item('First line about sprinklers', 10, 700, 0),
      item('Second line continues the clause', 10, 680, 1),
      item('Third line after a gap', 10, 620, 2),
    ];
    const text = reconstructPageText(items);
    expect(text).toContain('\n');
    expect(text.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(text).toContain('First line');
    expect(text).toContain('Second line');
  });

  it('keeps Arabic line logical (no character reverse)', () => {
    const ar = 'متطلبات الرشاشات في المباني';
    const text = reconstructPageText([item(ar, 400, 500, 0)]);
    expect(text).toBe(ar);
    expect(text).not.toBe([...ar].reverse().join(''));
  });

  it('keeps NFPA 13 intact on English line', () => {
    const text = reconstructPageText([
      item('See ', 10, 400, 0),
      item('NFPA', 40, 400, 1),
      item(' ', 70, 400, 2),
      item('13', 75, 400, 3),
      item(' for sprinklers', 95, 400, 4),
    ]);
    expect(text).toContain('NFPA');
    expect(text).toContain('13');
    expect(text).toMatch(/NFPA\s*13/);
  });

  it('keeps clause 317.4.1 exactly', () => {
    const text = reconstructPageText([
      item('Clause ', 10, 300, 0),
      item('317', 50, 300, 1),
      item('.', 70, 300, 2),
      item('4', 75, 300, 3),
      item('.', 82, 300, 4),
      item('1', 87, 300, 5),
      item(' applies', 100, 300, 6),
    ]);
    expect(text).toContain('317.4.1');
    expect(text).not.toMatch(/1\.4\.713/);
  });

  it('does not reverse numeric references in mixed Arabic-English', () => {
    const text = reconstructPageText([
      item('متطلبات', 300, 200, 0),
      item(' ', 280, 200, 1),
      item('NFPA', 250, 200, 2),
      item(' ', 220, 200, 3),
      item('13', 200, 200, 4),
      item(' ', 180, 200, 5),
      item('للمضخات', 150, 200, 6),
    ]);
    expect(text).toContain('NFPA');
    expect(text).toContain('13');
    expect(text).toMatch(/NFPA\s*13/);
    expect(text).toContain('متطلبات');
    expect(text).toContain('للمضخات');
  });

  it('inserts paragraph gap for large vertical spacing', () => {
    const text = reconstructPageText([
      item('Paragraph one line', 10, 700, 0),
      item('Still para one', 10, 685, 1),
      // Large gap vs ~15pt line spacing
      item('Paragraph two after gap', 10, 520, 2),
    ]);
    expect(text).toContain('\n\n');
  });

  it('handles bilingual line without reversing strings', () => {
    const text = reconstructPageText([
      item('SBC', 10, 100, 0),
      item(' 801', 40, 100, 1),
      item(' والكود السعودي', 80, 100, 2),
    ]);
    expect(text).toContain('SBC');
    expect(text).toContain('801');
    expect(text).toContain('الكود السعودي');
  });
});

describe('chunkPagesPreserving semantic', () => {
  it('preserves page identity and never merges pages', () => {
    const pages = pagesFromPlainText(
      ['Page one NFPA 13 sprinkler density notes.', 'Page two SBC 801 occupancy notes.'].join('\f')
    );
    const chunks = chunkPagesPreserving(pages.pages, 900);
    expect(chunks.every((c) => c.page_start === c.page_end)).toBe(true);
    expect(chunks.some((c) => c.page_start === 1)).toBe(true);
    expect(chunks.some((c) => c.page_start === 2)).toBe(true);
    expect(chunks.every((c) => c.page_start === 1 || c.page_start === 2)).toBe(true);
  });

  it('avoids splitting through code references when sentence boundary exists', () => {
    const longIntro = 'مقدمة عن أنظمة الإطفاء. '.repeat(40);
    const body =
      longIntro +
      'See NFPA 13 section 8.1 for spacing. Then additional guidance continues with more detail. '.repeat(
        8
      );
    const pages = pagesFromPlainText(body);
    const chunks = chunkPagesPreserving(pages.pages, 800);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // No orphaned "NFPA" without nearby digits from mid-token split of "NFPA 13"
      if (c.content.includes('NFPA')) {
        expect(c.content).toMatch(/NFPA\s*13/);
      }
    }
  });

  it('keeps paragraphs readable with line breaks', () => {
    const text = ['Line A about pumps.', '', 'Line B about tanks.', 'Line C continues.'].join('\n');
    const pages = pagesFromPlainText(text);
    const chunks = chunkPagesPreserving(pages.pages, 900);
    expect(chunks[0].content).toContain('Line A');
    expect(chunks[0].page_start).toBe(1);
  });
});

describe('normalizeKnowledgeSearchText', () => {
  it('canonicalizes NFPA / SBC variants without mutating display intent', () => {
    const a = normalizeKnowledgeSearchText('NFPA-13 and NFPA 13 and NFPA13');
    expect(a).toContain('nfpa13');
    const b = normalizeKnowledgeSearchText('SBC801 / SBC-801 / SBC 801');
    expect(b).toContain('sbc801');
  });
});
