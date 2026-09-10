/**
 * PDF page reconstruction + semantic chunking for Design Intelligence RAG.
 * Geometry-aware Arabic word reconstruction regressions (SBC-like TextItem geometry).
 */

import { describe, expect, it } from 'vitest';
import {
  chunkPagesPreserving,
  horizontalGapBetweenRuns,
  pagesFromPlainText,
  reconstructPageText,
  type PositionedTextItem,
} from '@/lib/design-intelligence/code-knowledge/pdf-page-extract';
import { normalizeKnowledgeSearchText } from '@/lib/design-intelligence/embeddings';

function item(
  str: string,
  x: number,
  y: number,
  order: number,
  opts: { height?: number; width?: number; hasEOL?: boolean; dir?: string } = {}
): PositionedTextItem {
  return {
    str,
    x,
    y,
    height: opts.height ?? 10,
    width: opts.width,
    order,
    hasEOL: opts.hasEOL,
    dir: opts.dir,
  };
}

describe('horizontalGapBetweenRuns', () => {
  it('uses box-to-box distance for RTL (next run to the left)', () => {
    // Logical Arabic: prev at x=200 w=40, next at x=150 w=35 → touching gap ~15? 
    // Actually: prev [200,240], next [150,185] → gap = 200-185 = 15
    expect(horizontalGapBetweenRuns({ x: 200, width: 40 }, { x: 150, width: 35 })).toBe(15);
  });

  it('returns 0 for overlapping / touching runs', () => {
    expect(horizontalGapBetweenRuns({ x: 100, width: 40 }, { x: 140, width: 20 })).toBe(0);
    expect(horizontalGapBetweenRuns({ x: 100, width: 40 }, { x: 120, width: 10 })).toBe(0);
  });
});

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

  // 1. Arabic word composed of multiple glyph TextItems
  it('glues Arabic glyph fragments without inserting spaces', () => {
    const word = 'الرشاشات';
    const items = [...word].map((ch, i) =>
      item(ch, 100 + i * 3, 200, i, { height: 14, width: 3 })
    );
    const text = reconstructPageText(items);
    expect(text.replace(/\s/g, '')).toBe(word);
    expect(text).not.toMatch(/ا\s+ل\s+ر/);
    expect(text).not.toBe([...word].reverse().join(''));
  });

  // Also: multi-letter fragments of same word (not only single glyphs)
  it('glues multi-letter Arabic fragments of the same word by geometry', () => {
    // "المباني" often arrives as "ال" + "مباني" with ~0 gap (not letter-count heuristics)
    const a = item('ال', 220, 300, 0, { height: 14, width: 18 });
    const b = item('مباني', 200, 300, 1, { height: 14, width: 42 }); // left of prev, gap≈0
    // box: a[220,238] b[200,242] → overlap → gap 0
    const text = reconstructPageText([a, b]);
    expect(text).toBe('المباني');
  });

  // 2. two Arabic words separated geometrically
  it('keeps word boundaries between whole Arabic words', () => {
    const left = item('نظام', 100, 300, 0, { height: 14, width: 40 });
    const right = item('الرش', 160, 300, 1, { height: 14, width: 30 }); // gap = 20 ≈ 1.4em
    const text = reconstructPageText([left, right]);
    expect(text).toBe('نظام الرش');
    expect(text).not.toBe('نظامالرش');
    expect(text).not.toBe('الرش نظام'.split('').reverse().join(''));
  });

  // 9. no manual RTL reversal
  it('keeps Arabic line logical (no character reverse)', () => {
    const ar = 'متطلبات الرشاشات في المباني';
    const text = reconstructPageText([item(ar, 400, 500, 0)]);
    expect(text).toBe(ar);
    expect(text).not.toBe([...ar].reverse().join(''));
  });

  it('keeps NFPA 13 intact on English line', () => {
    const text = reconstructPageText([
      item('See ', 10, 400, 0, { width: 28 }),
      item('NFPA', 40, 400, 1, { width: 28 }),
      item(' ', 70, 400, 2, { width: 4 }),
      item('13', 75, 400, 3, { width: 14 }),
      item(' for sprinklers', 95, 400, 4, { width: 80 }),
    ]);
    expect(text).toContain('NFPA');
    expect(text).toContain('13');
    expect(text).toMatch(/NFPA\s*13/);
  });

  // 3. Arabic + section number (903.3.1.1)
  it('preserves section numbers such as 903.3.1.1 next to Arabic', () => {
    const text = reconstructPageText([
      item('متطلبات', 300, 200, 0, { height: 14, width: 50 }),
      item(' ', 290, 200, 1, { height: 14, width: 4 }),
      item('903', 250, 200, 2, { height: 14, width: 24 }),
      item('.', 274, 200, 3, { height: 14, width: 4 }),
      item('3', 278, 200, 4, { height: 14, width: 8 }),
      item('.', 286, 200, 5, { height: 14, width: 4 }),
      item('1', 290, 200, 6, { height: 14, width: 8 }),
      item('.', 298, 200, 7, { height: 14, width: 4 }),
      item('1', 302, 200, 8, { height: 14, width: 8 }),
    ]);
    expect(text).toContain('903.3.1.1');
    expect(text).toContain('متطلبات');
    expect(text).not.toMatch(/1\.1\.3\.309/);
  });

  it('keeps clause 317.4.1 exactly', () => {
    const text = reconstructPageText([
      item('Clause ', 10, 300, 0, { width: 40 }),
      item('317', 50, 300, 1, { width: 20 }),
      item('.', 70, 300, 2, { width: 4 }),
      item('4', 74, 300, 3, { width: 8 }),
      item('.', 82, 300, 4, { width: 4 }),
      item('1', 86, 300, 5, { width: 8 }),
      item(' applies', 100, 300, 6, { width: 50 }),
    ]);
    expect(text).toContain('317.4.1');
    expect(text).not.toMatch(/1\.4\.713/);
  });

  // 4. Arabic + English term in parentheses
  it('preserves Arabic + English term in parentheses', () => {
    const text = reconstructPageText([
      item('أنظمة', 320, 400, 0, { height: 14, width: 40 }),
      item(' ', 310, 400, 1, { height: 14, width: 4 }),
      item('الرش', 270, 400, 2, { height: 14, width: 30 }),
      item(' ', 260, 400, 3, { height: 14, width: 4 }),
      item('الآلي', 220, 400, 4, { height: 14, width: 35 }),
      item(' ', 210, 400, 5, { height: 14, width: 4 }),
      item('(', 200, 400, 6, { height: 14, width: 6 }),
      item('Automatic Sprinkler Systems', 80, 400, 7, { height: 14, width: 110 }),
      item(')', 70, 400, 8, { height: 14, width: 6 }),
    ]);
    expect(text).toContain('أنظمة');
    expect(text).toContain('الرش');
    expect(text).toContain('الآلي');
    expect(text).toContain('(Automatic Sprinkler Systems)');
    expect(text).not.toBe([...text].reverse().join(''));
  });

  // 5. Arabic + numeric value/unit
  it('preserves Arabic + numeric value/unit', () => {
    const text = reconstructPageText([
      item('الضغط', 200, 350, 0, { height: 14, width: 40 }),
      item(' ', 190, 350, 1, { height: 14, width: 4 }),
      item('7', 170, 350, 2, { height: 14, width: 8 }),
      item(' ', 160, 350, 3, { height: 14, width: 4 }),
      item('bar', 130, 350, 4, { height: 14, width: 22 }),
    ]);
    expect(text).toMatch(/الضغط/);
    expect(text).toMatch(/7/);
    expect(text).toMatch(/bar/);
    expect(text).toMatch(/الضغط\s+7\s+bar/);
  });

  // 6. punctuation
  it('preserves parentheses and punctuation without inventing splits', () => {
    const text = reconstructPageText([
      item('انظر', 200, 250, 0, { height: 14, width: 30 }),
      item(' ', 190, 250, 1, { height: 14, width: 4 }),
      item('البند', 150, 250, 2, { height: 14, width: 35 }),
      item(':', 145, 250, 3, { height: 14, width: 4 }),
      item(' ', 140, 250, 4, { height: 14, width: 4 }),
      item('903.3.1.1', 80, 250, 5, { height: 14, width: 55 }),
      item('.', 75, 250, 6, { height: 14, width: 4 }),
    ]);
    expect(text).toContain('البند');
    expect(text).toContain('903.3.1.1');
    expect(text).toMatch(/البند:/);
  });

  // 7. separate table columns — do not fabricate a sentence
  it('keeps separate table columns as separate logical lines', () => {
    const text = reconstructPageText([
      item('عمود أ', 50, 500, 0, { height: 12, width: 40 }),
      item('عمود ب', 320, 500, 1, { height: 12, width: 40 }), // large gap → column
    ]);
    expect(text).toContain('عمود أ');
    expect(text).toContain('عمود ب');
    expect(text).toContain('\n');
    expect(text).not.toBe('عمود أ عمود ب');
  });

  // 8. line endings (hasEOL)
  it('respects hasEOL hard line breaks', () => {
    const text = reconstructPageText([
      item('سطر أول', 100, 600, 0, { height: 14, width: 50, hasEOL: true }),
      item('سطر ثان', 100, 580, 1, { height: 14, width: 50 }),
    ]);
    expect(text.split('\n').map((l) => l.trim()).filter(Boolean)).toEqual(['سطر أول', 'سطر ثان']);
  });

  it('does not reverse numeric references in mixed Arabic-English', () => {
    const text = reconstructPageText([
      item('متطلبات', 300, 200, 0, { width: 50 }),
      item(' ', 280, 200, 1, { width: 4 }),
      item('NFPA', 250, 200, 2, { width: 30 }),
      item(' ', 220, 200, 3, { width: 4 }),
      item('13', 200, 200, 4, { width: 14 }),
      item(' ', 180, 200, 5, { width: 4 }),
      item('للمضخات', 120, 200, 6, { width: 50 }),
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
      item('Paragraph two after gap', 10, 520, 2),
    ]);
    expect(text).toContain('\n\n');
  });

  it('handles bilingual line without reversing strings', () => {
    const text = reconstructPageText([
      item('SBC', 10, 100, 0, { width: 28 }),
      item(' 801', 40, 100, 1, { width: 24 }),
      item(' والكود السعودي', 80, 100, 2, { width: 90 }),
    ]);
    expect(text).toContain('SBC');
    expect(text).toContain('801');
    expect(text).toContain('الكود السعودي');
  });

  // 10. sprinkler-source text remains readable after reconstruction
  it('reconstructs SBC-like sprinkler Arabic prose readably', () => {
    // Mimics pdfjs: words as whole runs with ~0.28em gaps; glyphs never reversed
    const em = 14;
    const wordGap = em * 0.28;
    const runs = [
      { str: 'يجب', w: 28 },
      { str: 'توفير', w: 36 },
      { str: 'أنظمة', w: 40 },
      { str: 'الرش', w: 30 },
      { str: 'الآلي', w: 35 },
      { str: '(Automatic', w: 55 },
      { str: ' ', w: 4 },
      { str: 'Sprinkler', w: 50 },
      { str: ' ', w: 4 },
      { str: 'Systems)', w: 48 },
      { str: ' ', w: 4 },
      { str: 'وفق', w: 24 },
      { str: ' ', w: 4 },
      { str: 'البند', w: 32 },
      { str: ' ', w: 4 },
      { str: '903.3.1.1', w: 55 },
    ];
    // Place in RTL visual: later logical items further left
    let x = 500;
    const items: PositionedTextItem[] = [];
    runs.forEach((r, i) => {
      x -= r.w + (i === 0 ? 0 : wordGap);
      items.push(item(r.str, x, 400, i, { height: em, width: r.w }));
    });
    const text = reconstructPageText(items);
    expect(text).toContain('يجب');
    expect(text).toContain('توفير');
    expect(text).toContain('أنظمة');
    expect(text).toContain('الرش');
    expect(text).toContain('الآلي');
    expect(text).toContain('Automatic');
    expect(text).toContain('Sprinkler');
    expect(text).toContain('903.3.1.1');
    // Words must not merge into one blob
    expect(text).toMatch(/يجب\s+توفير\s+أنظمة\s+الرش\s+الآلي/);
    expect(text).not.toContain('يجبتوفير');
    expect(text).not.toContain('يجبتوفيرأنظمة');
    expect(text).not.toBe([...text].reverse().join(''));
  });

  it('does not space-split when PDF already embeds spaces in str', () => {
    const text = reconstructPageText([
      item('في المباني ', 200, 300, 0, { height: 14, width: 70 }),
      item('العالية', 120, 300, 1, { height: 14, width: 45 }),
    ]);
    expect(text).toContain('في المباني');
    expect(text).toContain('العالية');
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
