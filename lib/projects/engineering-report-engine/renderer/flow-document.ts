/**
 * Flow-based engineering document model (Nasaim / consultancy style).
 * Converts study sections into a continuous block stream — not page cards.
 */

import type {
  EngineeringStudyDocument,
  EngineeringStudyImage,
  EngineeringStudySection,
} from '@/lib/projects/engineering-report-engine/types';
import { placeSectionImages, sanitizeCaption } from '@/lib/projects/engineering-report-engine/renderer/image-placement';

export type FlowBlock =
  | { kind: 'chapter'; id: string; number: number; title: string }
  | { kind: 'subsection'; title: string }
  | { kind: 'paragraph'; text: string; incomplete?: boolean }
  | {
      kind: 'table';
      caption: string;
      headers: string[];
      rows: string[][];
    }
  | {
      kind: 'figure';
      src: string;
      caption: string;
      figureNo: number;
      layout: 'single' | 'double' | 'full_width';
      imageId?: string;
    };

function uniqueParagraphs(
  paragraphs: EngineeringStudySection['paragraphs']
): EngineeringStudySection['paragraphs'] {
  const seen = new Set<string>();
  const out: EngineeringStudySection['paragraphs'] = [];
  for (const p of paragraphs || []) {
    const key = String(p.text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function weaveCitations(text: string, citations: string[], locale: 'ar' | 'en'): string {
  const clean = citations
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !/^(alarm|risk|occupancy)$/i.test(c));
  if (!clean.length) return text;
  // Avoid duplicating if already mentioned in text
  const remaining = clean.filter((c) => !text.includes(c));
  if (!remaining.length) return text;
  const joined = remaining.join(locale === 'ar' ? ' و' : ' and ');
  if (locale === 'ar') {
    return `${text.replace(/\s*$/, '')} وذلك وفقًا لمتطلبات ${joined}.`;
  }
  return `${text.replace(/\s*$/, '')} in accordance with ${joined}.`;
}

function chapterTitle(section: EngineeringStudySection, locale: 'ar' | 'en', displayNo: number): string {
  const raw = locale === 'ar' ? section.title_ar : section.title_en;
  // Strip redundant "دراسة" prefixes for a cleaner consultancy tone
  const cleaned = raw
    .replace(/^دراسة\s+/i, '')
    .replace(/^Study\s+of\s+/i, '')
    .replace(/^Study\s+/i, '')
    .trim();
  return `${displayNo}. ${cleaned}`;
}

/**
 * Build continuous flow blocks for one section:
 * heading → intro paras → tables → (subsection + figure)* interleaved with remaining paras
 */
export function sectionToFlowBlocks(
  doc: EngineeringStudyDocument,
  section: EngineeringStudySection,
  displayNo: number,
  figureCounter: { n: number }
): FlowBlock[] {
  const locale = doc.locale;
  const blocks: FlowBlock[] = [];
  const paras = uniqueParagraphs(section.paragraphs);
  const images = placeSectionImages(section);
  const tables = section.tables || [];

  blocks.push({
    kind: 'chapter',
    id: section.id,
    number: displayNo,
    title: chapterTitle(section, locale, displayNo),
  });

  // Intro: first paragraph (or all if no images to interleave)
  const introCount = images.length ? Math.min(1, paras.length) : paras.length;
  for (let i = 0; i < introCount; i++) {
    const p = paras[i];
    blocks.push({
      kind: 'paragraph',
      text: weaveCitations(p.text, p.citations || [], locale),
      incomplete: p.incomplete,
    });
  }

  for (const t of tables) {
    blocks.push({
      kind: 'table',
      caption: locale === 'ar' ? t.caption_ar : t.caption_en,
      headers: locale === 'ar' ? t.headers_ar : t.headers_en,
      rows: t.rows,
    });
  }

  // Remaining paragraphs to distribute around figures
  const restParas = paras.slice(introCount);
  let paraIdx = 0;

  let lastSub = '';
  for (const img of images) {
    const sub =
      (locale === 'ar' ? img.subsection_ar : img.subsection_en) ||
      sanitizeCaption(locale === 'ar' ? img.caption_ar : img.caption_en, '');
    if (sub && sub !== lastSub) {
      blocks.push({ kind: 'subsection', title: sub });
      lastSub = sub;
      // One supporting paragraph under this subsection if available
      if (paraIdx < restParas.length) {
        const p = restParas[paraIdx++];
        blocks.push({
          kind: 'paragraph',
          text: weaveCitations(p.text, p.citations || [], locale),
          incomplete: p.incomplete,
        });
      }
    } else if (!sub && paraIdx < restParas.length) {
      const p = restParas[paraIdx++];
      blocks.push({
        kind: 'paragraph',
        text: weaveCitations(p.text, p.citations || [], locale),
        incomplete: p.incomplete,
      });
    }

    figureCounter.n += 1;
    const figNo = figureCounter.n;
    const baseCap = sanitizeCaption(
      locale === 'ar' ? img.caption_ar : img.caption_en,
      locale === 'ar' ? `توضيح رقم (${figNo})` : `Figure (${figNo})`
    );
    const caption =
      locale === 'ar'
        ? `شكل (${figNo}): ${baseCap.replace(/^شكل\s*\(\d+\)\s*[:：-]?\s*/i, '')}`
        : `Figure (${figNo}): ${baseCap.replace(/^Figure\s*\(\d+\)\s*[:：-]?\s*/i, '')}`;

    const layout =
      img.layout_type === 'double'
        ? 'double'
        : img.layout_type === 'full_width' || img.image_type === 'site_map' || img.image_type === 'drawing'
          ? 'full_width'
          : 'single';

    blocks.push({
      kind: 'figure',
      src: img.src,
      caption,
      figureNo: figNo,
      layout,
      imageId: img.image_id,
    });
  }

  // Any leftover paragraphs
  while (paraIdx < restParas.length) {
    const p = restParas[paraIdx++];
    blocks.push({
      kind: 'paragraph',
      text: weaveCitations(p.text, p.citations || [], locale),
      incomplete: p.incomplete,
    });
  }

  return blocks;
}

export function documentToFlowBlocks(doc: EngineeringStudyDocument): {
  blocks: FlowBlock[];
  chapters: { id: string; title: string; displayNo: number }[];
} {
  const content = doc.sections.filter((s) => s.id !== 'cover' && s.id !== 'toc');
  // Hide empty incomplete-only sections to keep the study compact (Nasaim density)
  const visible = content.filter((s) => {
    const paras = uniqueParagraphs(s.paragraphs);
    const hasReal =
      paras.some((p) => !p.incomplete) ||
      (s.images && s.images.length > 0) ||
      (s.tables && s.tables.length > 0);
    return hasReal;
  });

  const figureCounter = { n: 0 };
  const blocks: FlowBlock[] = [];
  const chapters: { id: string; title: string; displayNo: number }[] = [];

  visible.forEach((section, i) => {
    const displayNo = i + 1;
    const sectionBlocks = sectionToFlowBlocks(doc, section, displayNo, figureCounter);
    const chapter = sectionBlocks.find((b) => b.kind === 'chapter');
    if (chapter && chapter.kind === 'chapter') {
      chapters.push({ id: chapter.id, title: chapter.title, displayNo });
    }
    blocks.push(...sectionBlocks);
  });

  return { blocks, chapters };
}

/** Rough mm height estimates for continuous TOC page mapping */
export function estimateBlockHeightMm(block: FlowBlock): number {
  switch (block.kind) {
    case 'chapter':
      return 12;
    case 'subsection':
      return 8;
    case 'paragraph': {
      const lines = Math.ceil((block.text?.length || 0) / 90);
      return Math.max(6, lines * 5.2);
    }
    case 'table':
      return 10 + (block.rows?.length || 0) * 6 + 4;
    case 'figure':
      return block.layout === 'full_width' ? 95 : block.layout === 'double' ? 55 : 70;
    default:
      return 8;
  }
}

export function estimateFlowTocPages(
  chapters: { id: string }[],
  blocks: FlowBlock[]
): Record<string, number> {
  // cover=1, toc=2, body starts at 3
  const usable = 240; // mm per page body
  let used = 0;
  let page = 3;
  const map: Record<string, number> = {};
  for (const block of blocks) {
    if (block.kind === 'chapter') {
      map[block.id] = page;
    }
    const h = estimateBlockHeightMm(block);
    if (used + h > usable && block.kind !== 'chapter') {
      page += 1;
      used = h;
    } else if (used + h > usable && block.kind === 'chapter') {
      // chapter can start a soft new page only when previous page is full
      if (used > usable * 0.55) {
        page += 1;
        used = h;
        map[block.id] = page;
      } else {
        used += h;
      }
    } else {
      used += h;
    }
  }
  // Ensure every chapter has a page
  for (const ch of chapters) {
    if (!map[ch.id]) map[ch.id] = 3;
  }
  return map;
}
