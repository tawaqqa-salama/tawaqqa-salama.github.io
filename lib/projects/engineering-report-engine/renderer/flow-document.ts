/**
 * Flow document engine — consultancy report blocks (not page cards).
 * Fixes: image+caption atomic units, subsection keep-with-next,
 * client-facing prose (no system jargon / citation spam).
 */

import type {
  EngineeringStudyDocument,
  EngineeringStudySection,
  EngineeringStudySectionId,
} from '@/lib/projects/engineering-report-engine/types';
import { placeSectionImages, sanitizeCaption } from '@/lib/projects/engineering-report-engine/renderer/image-placement';

export type FlowBlock =
  | { kind: 'chapter'; id: string; number: number; title: string }
  | { kind: 'subsection'; title: string }
  | { kind: 'paragraph'; text: string; incomplete?: boolean }
  | { kind: 'bullet_list'; items: string[] }
  | { kind: 'reference_note'; refs: string[] }
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
    }
  /** Atomic keep-together group (e.g. subsection + paragraph + figure) */
  | { kind: 'unit'; blocks: FlowBlock[] };

const SYSTEM_JARGON_RE =
  /محرك\s*(?:القواعد|القرار)|قاعدة\s*المعرفة|Decision\s*Engine|Knowledge\s*Base|Rules?\s*Engine|قابل\s*للتعديل|القيم\s*المقفلة|الخيارات\s*غير\s*المسموحة|بوابة\s*(?:محرك\s*)?القرار|حالة\s*البوابة|موقوف\s*:|حقل\s*إلزامي|مخالفات\s*القواعد|Incomplete|Company\s*Standards|Base\s*Code|rules?\s*engine/gi;

function normalizeCodeSpacing(text: string): string {
  return String(text || '')
    .replace(/\bNFPA\s*(\d+)/gi, 'NFPA $1')
    .replace(/\bSBC\s*-?\s*(\d+)/gi, 'SBC $1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Client-facing cleanup — does not invent engineering values. */
export function sanitizeClientFacingText(text: string, locale: 'ar' | 'en'): string {
  let t = normalizeCodeSpacing(text);
  if (!t) return t;

  // Drop internal platform phrasing
  t = t.replace(SYSTEM_JARGON_RE, '');
  t = t.replace(/قابل للتعديل\s*[—\-]\s*[^.]*\./g, '');
  t = t.replace(/مسوّغ القواعد:[^.]*\./g, '');
  t = t.replace(/وفق محرك القواعد[^.]*/gi, locale === 'ar' ? 'وفق الكودات المعتمدة' : 'per adopted codes');

  // Soften incomplete / missing dump
  if (/يلزم استكمال معلومات هندسية إضافية|Additional engineering information is required/i.test(t)) {
    return locale === 'ar'
      ? 'لم تُستكمل بعد البيانات اللازمة لهذا البند ضمن ملف المشروع الحالي، ولا يتم افتراض قيم هندسية غير موثّقة.'
      : 'Required project data for this item is not yet complete; undocumented engineering values are not assumed.';
  }

  // Compliance-style system logs → consultancy wording
  if (/مراجعة الامتثال عبر|Decision gate|حالة البوابة|عدد مخالفات/i.test(t)) {
    return locale === 'ar'
      ? 'أظهرت المراجعة الحالية أن بعض البيانات المطلوبة لاستكمال التحقق النهائي من الامتثال غير مكتملة بعد. وعليه، لا يُعدّ هذا الجزء اعتمادًا نهائيًا إلى حين استكمال البيانات المطلوبة، دون افتراض نتائج غير موثّقة.'
      : 'The current review shows that some data required to complete final compliance verification are still incomplete. This section is therefore not a final approval until the required data are provided; undocumented conclusions are not assumed.';
  }

  // Collapse repeated "غير محدد"
  const unspecifiedHits = (t.match(/غير محدد/g) || []).length;
  if (unspecifiedHits >= 2) {
    t = t.replace(/غير محدد/g, '—');
    if (!/لم يتم إدخال قيمة معتمدة|not been entered/i.test(t)) {
      t +=
        locale === 'ar'
          ? ' ولم يتم إدخال قيمة معتمدة لبعض الخصائص ضمن بيانات المشروع الحالية، ولا يتم افتراض قيمة هندسية غير موثّقة.'
          : ' Some properties have no approved value in the current project data; undocumented values are not assumed.';
    }
  }

  // Remove trailing citation spam patterns already appended
  t = t.replace(/(?:\s*وذلك وفقًا لمتطلبات[^.]*\.)+/g, '');
  t = t.replace(/(?:\s*وفقًا لمتطلبات[^.]*\.)+/g, '');
  t = t.replace(/(?:\s*in accordance with[^.]*\.)+/gi, '');
  // Collapse repeated mid-paragraph citation clauses to one trailing note later
  t = t.replace(/(?:،?\s*وذلك وفقًا لـ?[^.،]+){2,}/g, '');

  // Clean punctuation leftovers from jargon stripping
  t = t.replace(/\s{2,}/g, ' ');
  t = t.replace(/\s+([،,.])/g, '$1');
  t = t.replace(/([.]){2,}/g, '.');
  t = t.replace(/\s*—\s*—/g, ' — ');
  return t.trim();
}

function uniqueParagraphs(
  paragraphs: EngineeringStudySection['paragraphs']
): EngineeringStudySection['paragraphs'] {
  const seen = new Set<string>();
  const out: EngineeringStudySection['paragraphs'] = [];
  for (const p of paragraphs || []) {
    const key = sanitizeClientFacingText(String(p.text || ''), 'ar')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function collectRefs(
  paragraphs: EngineeringStudySection['paragraphs'],
  locale: 'ar' | 'en'
): string[] {
  const set = new Set<string>();
  for (const p of paragraphs || []) {
    for (const c of p.citations || []) {
      const n = normalizeCodeSpacing(c);
      if (!n) continue;
      if (/^(alarm|risk|occupancy|sprinkler|egress)$/i.test(n)) continue;
      if (/Company Standards/i.test(n)) continue;
      set.add(n);
    }
  }
  // Also harvest codes mentioned in text
  const blob = paragraphs.map((p) => p.text).join(' ');
  for (const m of blob.match(/\b(?:NFPA|SBC)\s*-?\s*\d+[A-Z]?\b/gi) || []) {
    set.add(normalizeCodeSpacing(m));
  }
  if (locale === 'ar' && /الدفاع المدني|Civil Defense/i.test(blob)) {
    set.add('متطلبات الدفاع المدني');
  }
  return [...set];
}

function chapterTitle(section: EngineeringStudySection, locale: 'ar' | 'en', displayNo: number): string {
  const raw = locale === 'ar' ? section.title_ar : section.title_en;
  const cleaned = raw
    .replace(/^دراسة\s+/i, '')
    .replace(/^Study\s+of\s+/i, '')
    .replace(/^Study\s+/i, '')
    .trim();
  return `${displayNo}. ${cleaned}`;
}

function bridgeForSubsection(title: string, locale: 'ar' | 'en'): string {
  if (locale === 'ar') {
    return `فيما يتعلق بـ«${title}»، تُراجع المتطلبات الهندسية ذات الصلة وفق بيانات المشروع والكودات المعتمدة، مع توثيق الحالة القائمة عند توفر الصور المرفقة.`;
  }
  return `Regarding “${title}”, the related engineering requirements are reviewed against project data and adopted codes, documenting the as-built condition when photographs are available.`;
}

function figureCaption(
  locale: 'ar' | 'en',
  figNo: number,
  rawCaption: string,
  subsection: string
): string {
  let base = sanitizeCaption(rawCaption, subsection || (locale === 'ar' ? 'توضيح' : 'Illustration'));
  base = base.replace(/^شكل\s*\(\d+\)\s*[:：-]?\s*/i, '').replace(/^Figure\s*\(\d+\)\s*[:：-]?\s*/i, '');
  base = base.replace(/^صورة\s*[—\-:]?\s*/i, '').trim();
  if (locale === 'ar') {
    if (!/الحالة الحالية|منظومة|غرفة|لوحة|كاشف|كاسر|جرس|موقع|مخطط/i.test(base) && subsection) {
      base = `الحالة الحالية — ${subsection}`;
    }
    return `شكل (${figNo}): ${base}`;
  }
  return `Figure (${figNo}): ${base}`;
}

/** Parse dump-style summary into label/value rows without inventing data. */
function extractSummaryFacts(
  text: string,
  locale: 'ar' | 'en'
): { rows: string[][]; remainder: string } {
  const rows: string[][] = [];
  let working = text;

  const push = (label: string, value: string) => {
    const v = value.replace(/^[:：\s—\-]+/, '').trim();
    if (v && v !== '—' && !/^pending|غير|يلزم/i.test(v)) rows.push([label, v]);
  };

  // Arabic dump: ملخص الدراسة: منشأة "X" — إشغال Y — ...
  const arFacility = working.match(/منشأة\s*[«"“]?([^»"”]+)[»"”]?/);
  if (arFacility) push('المنشأة', arFacility[1]);
  const arOcc = working.match(/إشغال\s*([^—\-.]+)/);
  if (arOcc) push('الإشغال', arOcc[1]);
  const arHaz = working.match(/خطورة\s*([^—\-.]+)/);
  if (arHaz) push('الخطورة', arHaz[1]);
  const arArea = working.match(/مساحة\s*([^—\-.]+)/);
  if (arArea) push('المساحة', arArea[1]);
  const arFloors = working.match(/أدوار\s*([^—\-.]+)/);
  if (arFloors) push('الأدوار', arFloors[1]);
  const arSys = working.match(/الأنظمة(?:\s*الموثّقة)?(?:\s*في الملف)?\s*[:：]?\s*([^.]+)/);
  if (arSys) push('الأنظمة الموثّقة', arSys[1]);

  const enFacility = working.match(/facility\s*[“"]?([^”"—]+)[”"]?/i);
  if (locale === 'en' && enFacility) push('Facility', enFacility[1]);
  const enOcc = working.match(/occupancy\s*([^—\-.]+)/i);
  if (locale === 'en' && enOcc) push('Occupancy', enOcc[1]);
  const enHaz = working.match(/hazard\s*([^—\-.]+)/i);
  if (locale === 'en' && enHaz) push('Hazard', enHaz[1]);

  // Strip leading "ملخص الدراسة:" noise from remainder
  working = working
    .replace(/^ملخص الدراسة\s*[:：]?\s*/i, '')
    .replace(/^Study summary\s*[:：]?\s*/i, '')
    .trim();

  if (rows.length >= 2) {
    return { rows, remainder: '' };
  }
  return { rows, remainder: working };
}

function splitRecommendations(text: string, locale: 'ar' | 'en'): string[] {
  const cleaned = sanitizeClientFacingText(text, locale);
  const parts = cleaned
    .split(/(?<=[.。])\s+|(?:\d+[\).\-]\s+)/)
    .map((s) => s.replace(/^[\s•\-–—*]+/, '').trim())
    .filter((s) => s.length > 12);
  if (parts.length >= 2) return parts;
  return cleaned ? [cleaned] : [];
}

function buildFigureUnit(opts: {
  locale: 'ar' | 'en';
  subsectionTitle: string;
  paragraphText?: string;
  incomplete?: boolean;
  src: string;
  captionRaw: string;
  figureNo: number;
  layout: 'single' | 'double' | 'full_width';
  imageId?: string;
}): FlowBlock {
  const inner: FlowBlock[] = [];
  if (opts.subsectionTitle) {
    inner.push({ kind: 'subsection', title: opts.subsectionTitle });
  }
  const para =
    opts.paragraphText?.trim() ||
    (opts.subsectionTitle ? bridgeForSubsection(opts.subsectionTitle, opts.locale) : '');
  if (para) {
    inner.push({
      kind: 'paragraph',
      text: sanitizeClientFacingText(para, opts.locale),
      incomplete: opts.incomplete,
    });
  }
  inner.push({
    kind: 'figure',
    src: opts.src,
    caption: figureCaption(opts.locale, opts.figureNo, opts.captionRaw, opts.subsectionTitle),
    figureNo: opts.figureNo,
    layout: opts.layout,
    imageId: opts.imageId,
  });
  return { kind: 'unit', blocks: inner };
}

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
  const refs = collectRefs(section.paragraphs, locale);

  blocks.push({
    kind: 'chapter',
    id: section.id,
    number: displayNo,
    title: chapterTitle(section, locale, displayNo),
  });

  // Special presentation for recommendations — numbered list, not glued prose
  if (section.id === 'engineering_recommendations') {
    const items: string[] = [];
    for (const p of paras) {
      items.push(...splitRecommendations(p.text, locale));
    }
    const unique = [...new Set(items.map((i) => i.trim()).filter(Boolean))];
    if (unique.length) {
      blocks.push({
        kind: 'paragraph',
        text:
          locale === 'ar'
            ? 'في ضوء مراجعة بيانات المشروع الحالية، يُوصى بما يلي:'
            : 'Based on the current project data review, the following is recommended:',
      });
      blocks.push({ kind: 'bullet_list', items: unique });
    } else {
      blocks.push({
        kind: 'paragraph',
        text: sanitizeClientFacingText(paras[0]?.text || '', locale),
        incomplete: true,
      });
    }
    if (refs.length) blocks.push({ kind: 'reference_note', refs });
    return blocks;
  }

  // Summary — consultancy narrative + compact facts table (no invented values)
  if (section.id === 'summary') {
    const raw = sanitizeClientFacingText(paras.map((p) => p.text).join(' '), locale);
    blocks.push({
      kind: 'paragraph',
      text:
        locale === 'ar'
          ? 'تناولت الدراسة مراجعة متطلبات السلامة والوقاية من الحريق للمنشأة محل الدراسة، بما يشمل تصنيف الإشغال، مسالك الهروب، أنظمة مكافحة الحريق، أنظمة الإنذار، السلامة الكهربائية ومتطلبات الدفاع المدني، وفق البيانات المعتمدة في ملف المشروع دون افتراض قيم غير موثّقة.'
          : 'The study reviewed fire-safety requirements for the facility, covering occupancy classification, means of egress, firefighting systems, alarm systems, electrical safety, and Civil Defense requirements, based on approved project-file data without assuming undocumented values.',
    });
    if (raw) {
      const facts = extractSummaryFacts(raw, locale);
      if (facts.rows.length) {
        blocks.push({
          kind: 'table',
          caption: locale === 'ar' ? 'ملخص بيانات المشروع المعتمدة' : 'Approved project data summary',
          headers:
            locale === 'ar' ? ['البند', 'القيمة'] : ['Item', 'Value'],
          rows: facts.rows,
        });
        if (facts.remainder) {
          blocks.push({ kind: 'paragraph', text: facts.remainder });
        }
      } else {
        blocks.push({ kind: 'paragraph', text: raw });
      }
    }
    if (refs.length) blocks.push({ kind: 'reference_note', refs });
    return blocks;
  }

  // Intro paragraph(s)
  const introCount = images.length ? Math.min(1, paras.length) : Math.min(paras.length, 2);
  for (let i = 0; i < introCount; i++) {
    const p = paras[i];
    blocks.push({
      kind: 'paragraph',
      text: sanitizeClientFacingText(p.text, locale),
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

  const restParas = paras.slice(introCount);
  let paraIdx = 0;
  let lastSub = '';

  for (const img of images) {
    const sub =
      (locale === 'ar' ? img.subsection_ar : img.subsection_en) ||
      sanitizeCaption(locale === 'ar' ? img.caption_ar : img.caption_en, '');

    let paraText: string | undefined;
    let incomplete: boolean | undefined;
    const isNewSub = Boolean(sub && sub !== lastSub);

    if (isNewSub) {
      lastSub = sub;
      if (paraIdx < restParas.length) {
        paraText = restParas[paraIdx].text;
        incomplete = restParas[paraIdx].incomplete;
        paraIdx += 1;
      }
    } else if (!sub && paraIdx < restParas.length) {
      paraText = restParas[paraIdx].text;
      incomplete = restParas[paraIdx].incomplete;
      paraIdx += 1;
    }

    figureCounter.n += 1;
    const layout =
      img.layout_type === 'double'
        ? 'double'
        : img.layout_type === 'full_width' ||
            img.image_type === 'site_map' ||
            img.image_type === 'drawing'
          ? 'full_width'
          : 'single';

    blocks.push(
      buildFigureUnit({
        locale,
        subsectionTitle: isNewSub ? sub : '',
        paragraphText: paraText,
        incomplete,
        src: img.src,
        captionRaw: locale === 'ar' ? img.caption_ar : img.caption_en,
        figureNo: figureCounter.n,
        layout,
        imageId: img.image_id,
      })
    );
  }

  while (paraIdx < restParas.length) {
    const p = restParas[paraIdx++];
    blocks.push({
      kind: 'paragraph',
      text: sanitizeClientFacingText(p.text, locale),
      incomplete: p.incomplete,
    });
  }

  if (refs.length) {
    blocks.push({ kind: 'reference_note', refs });
  }

  return blocks;
}

export function documentToFlowBlocks(doc: EngineeringStudyDocument): {
  blocks: FlowBlock[];
  chapters: { id: string; title: string; displayNo: number }[];
} {
  const content = doc.sections.filter((s) => s.id !== 'cover' && s.id !== 'toc');
  const visible = content.filter((s) => {
    const paras = uniqueParagraphs(s.paragraphs);
    const hasReal =
      paras.some((p) => !p.incomplete) ||
      (s.images && s.images.length > 0) ||
      (s.tables && s.tables.length > 0);
    // Keep compliance/summary/conclusion/recommendations if they have any text
    const always =
      s.id === 'summary' ||
      s.id === 'engineering_recommendations' ||
      s.id === 'conclusion' ||
      s.id === 'engineering_compliance_review';
    return hasReal || (always && paras.length > 0);
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

export function estimateBlockHeightMm(block: FlowBlock): number {
  switch (block.kind) {
    case 'chapter':
      return 11;
    case 'subsection':
      return 7;
    case 'paragraph': {
      const lines = Math.ceil((block.text?.length || 0) / 95);
      return Math.max(5, lines * 5);
    }
    case 'bullet_list':
      return 6 + (block.items?.length || 0) * 5;
    case 'reference_note':
      return 8;
    case 'table':
      return 10 + (block.rows?.length || 0) * 5.5;
    case 'figure':
      return block.layout === 'full_width' ? 88 : 62;
    case 'unit':
      return (block.blocks || []).reduce((n, b) => n + estimateBlockHeightMm(b), 2);
    default:
      return 6;
  }
}

export function estimateFlowTocPages(
  chapters: { id: string }[],
  blocks: FlowBlock[]
): Record<string, number> {
  const usable = 245;
  let used = 0;
  let page = 3;
  const map: Record<string, number> = {};
  for (const block of blocks) {
    if (block.kind === 'chapter') map[block.id] = page;
    const h = estimateBlockHeightMm(block);
    if (used + h > usable) {
      page += 1;
      used = h;
      if (block.kind === 'chapter') map[block.id] = page;
    } else {
      used += h;
    }
  }
  for (const ch of chapters) {
    if (!map[ch.id]) map[ch.id] = 3;
  }
  return map;
}

export type { EngineeringStudySectionId };
