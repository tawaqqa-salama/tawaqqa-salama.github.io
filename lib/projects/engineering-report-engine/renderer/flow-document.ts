/**
 * Document Flow Engine — consultancy report blocks (not page cards).
 * Pipeline: document → content blocks (sorted) → HTML flow → print PDF.
 */

import type {
  EngineeringStudyDocument,
  EngineeringStudyImage,
  EngineeringStudySection,
  EngineeringStudySectionId,
} from '@/lib/projects/engineering-report-engine/types';
import { EXISTING_MANDATORY_PAGE_SECTIONS } from '@/lib/projects/existing-technical-report-profile';
import { isExistingReportMissingMediaLabel } from '@/lib/projects/engineering-report-engine/renderer/existing-report-design-system';
import { placeSectionImages, sanitizeCaption } from '@/lib/projects/engineering-report-engine/renderer/image-placement';
import { getItemProse } from '@/lib/projects/engineering-report-engine/renderer/subsection-prose';

export type FlowFigure = {
  kind: 'figure';
  src: string;
  caption: string;
  figureNo: number;
  layout: 'single' | 'double' | 'full_width';
  variant: 'photo' | 'map' | 'code';
  intrinsicWidth?: number | null;
  intrinsicHeight?: number | null;
  aspectRatio?: number | null;
  note?: string;
  imageId?: string;
  /** Unified image frame title (e.g. صورة واجهة المشروع). */
  displayTitle?: string;
  /** Missing-media message rendered inside the fixed frame. */
  placeholder?: string;
  objectPosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
};

export type FlowBlock =
  | { kind: 'chapter'; id: string; number: number; title: string }
  | { kind: 'subsection'; title: string }
  | { kind: 'paragraph'; text: string; incomplete?: boolean }
  | { kind: 'bullet_list'; items: string[] }
  | { kind: 'reference_note'; refs: string[]; referenceNo: number }
  | {
      kind: 'table';
      tableNo: number;
      caption: string;
      headers: string[];
      rows: string[][];
    }
  | FlowFigure
  /** A small print-safe row only; individual figures remain the atomic keep-together units. */
  | { kind: 'figure_row'; figures: FlowFigure[] }
  /** Breakable sequence: each code figure remains cohesive but the full series never locks a page. */
  | { kind: 'code_sequence'; figures: FlowFigure[] }
  /** Atomic keep-together group (subsection + first para, or image+caption) */
  | { kind: 'unit'; blocks: FlowBlock[] }
  | { kind: 'page_break'; id: 'after_project_components' };

const SYSTEM_JARGON_RE =
  /محرك\s*(?:القواعد|القرار)(?:\s*الهندسي(?:ة)?)?|قاعدة\s*المعرفة|Decision\s*Engine|Knowledge\s*Base|Rules?\s*Engine|Rule\s*Engine|قابل\s*للتعديل|القيم\s*المقفلة|الخيارات\s*غير\s*المسموحة|بوابة\s*(?:محرك\s*)?القرار|حالة\s*البوابة|بوابة\s*مغلقة|موقوف\s*:|حقل\s*إلزامي(?:\s*ناقص)?|عدد\s*مخالفات(?:\s*القواعد)?|مخالفات\s*القواعد|Incomplete|Company\s*Standards|Base\s*Code|CODE-BASE|مقفل\s*بقاعدة[^.]*|مقفَل\s*بقاعدة[^.]*|rules?\s*engine|UUID|Database\s*ID|Internal\s*ID|Internal\s*URL|Pipeline\s*Status|pipeline\s*status|draft\s*status/gi;

const GENERIC_BRIDGE_RE =
  /تُ?راجع المتطلبات الهندسية ذات الصلة[\s\S]{0,120}الكودات المعتمدة[\s\S]{0,80}الصور المرفقة|فيما يتعلق بـ?[«"'][^»"']+[»"']،?\s*(?:تُ?راجع|تم)|Regarding “[^”]+”, the related engineering requirements are reviewed|تُراجع متطلبات هذا البند وفق طبيعة الإشغال وخصائص المبنى والكودات المعتمدة، مع توثيق الحالة القائمة/i;

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

  if (GENERIC_BRIDGE_RE.test(t)) {
    return locale === 'ar'
      ? 'البيانات المتاحة حاليًا لا تكفي لإجراء تحقق تفصيلي لهذا البند. ولا يتم افتراض أي قيمة أو تجهيز غير موثق في ملف المشروع.'
      : 'Available data are insufficient for a detailed verification of this item. Undocumented values or equipment are not assumed.';
  }

  t = t.replace(SYSTEM_JARGON_RE, '');
  t = t.replace(/قابل للتعديل\s*[—\-]\s*[^.]*\./g, '');
  t = t.replace(/مسوّغ القواعد:[^.]*\./g, '');
  t = t.replace(/وفق محرك القواعد[^.]*/gi, locale === 'ar' ? 'وفق الكودات المعتمدة' : 'per adopted codes');
  t = t.replace(/فئة النظام وفق[^.]*\./gi, '');

  if (/يلزم استكمال معلومات هندسية إضافية|Additional engineering information is required/i.test(t)) {
    return locale === 'ar'
      ? 'لم تُستكمل بعد البيانات اللازمة لهذا البند ضمن ملف المشروع الحالي، ولا يتم افتراض قيم هندسية غير موثّقة.'
      : 'Required project data for this item is not yet complete; undocumented engineering values are not assumed.';
  }

  if (/مراجعة الامتثال عبر|Decision gate|حالة البوابة|عدد مخالفات|بوابة مغلقة|حقل إلزامي/i.test(t)) {
    return locale === 'ar'
      ? 'أظهرت المراجعة الحالية عدم اكتمال بعض البيانات المطلوبة لاستكمال التحقق النهائي من هذا البند، ولذلك لا يمكن اعتماد النتيجة النهائية قبل استكمال البيانات المطلوبة.'
      : 'The current review shows that some data required to complete final verification of this item are incomplete; the final result cannot be approved until the required data are provided.';
  }

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

  t = t.replace(/(?:\s*وذلك وفقًا لمتطلبات[^.]*\.)+/g, '');
  t = t.replace(/(?:\s*وفقًا لمتطلبات[^.]*\.)+/g, '');
  t = t.replace(/(?:\s*in accordance with[^.]*\.)+/gi, '');
  t = t.replace(/(?:،?\s*وذلك وفقًا لـ?[^.،]+){2,}/g, '');

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

/** ONE FACT = ONE BLOCK — drop intro text that repeats subsection options/notes. */
function filterIntroAgainstFacts(
  paragraphs: EngineeringStudySection['paragraphs'],
  images: EngineeringStudyImage[],
  locale: 'ar' | 'en'
): EngineeringStudySection['paragraphs'] {
  const factBlob = images
    .flatMap((img) => [
      ...(img.selected_options || []),
      img.item_notes || '',
      img.description_ar || '',
      img.description_en || '',
    ])
    .join(' ')
    .replace(/\s+/g, ' ');

  return paragraphs.filter((p) => {
    const t = sanitizeClientFacingText(p.text, locale);
    if (!t) return false;
    if (!factBlob) return true;
    // Drop paragraph if it is largely a dump of the same selected options
    const opts = images.flatMap((img) => img.selected_options || []);
    if (opts.length >= 2 && opts.every((o) => t.includes(o.slice(0, Math.min(18, o.length))))) {
      return false;
    }
    return true;
  });
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
  const blob = paragraphs.map((p) => p.text).join(' ');
  for (const m of blob.match(/\b(?:NFPA|SBC)\s*-?\s*\d+[A-Z]?\b/gi) || []) {
    set.add(normalizeCodeSpacing(m));
  }
  if (locale === 'ar' && /الدفاع المدني|Civil Defense/i.test(blob)) {
    set.add('متطلبات الدفاع المدني');
  } else if (locale === 'en' && /Civil Defense|الدفاع المدني/i.test(blob)) {
    set.add('Civil Defense requirements');
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

function figureCaption(
  locale: 'ar' | 'en',
  figNo: number,
  rawCaption: string,
  subsection: string
): string {
  let base = sanitizeCaption(rawCaption, subsection || (locale === 'ar' ? 'توضيح' : 'Illustration'));
  base = base.replace(/^شكل\s*\(\d+\)\s*[:：-]?\s*/i, '').replace(/^Figure\s*\(\d+\)\s*[:：-]?\s*/i, '');
  base = base.replace(/^صورة\s*[—\-:]?\s*/i, '').trim();
  base = base.replace(/^IMG_[A-Za-z0-9._-]+$/i, '').trim();
  if (!base || /^IMG_/i.test(base) || /\.(jpe?g|png|webp)$/i.test(base)) {
    base = subsection || (locale === 'ar' ? 'توثيق الحالة القائمة' : 'As-built documentation');
  }
  if (locale === 'ar') {
    if (!/الحالة الحالية|منظومة|غرفة|لوحة|كاشف|كاسر|جرس|موقع|مخطط|واجهة|مقتطف|مرجع|دليل/i.test(base)) {
      base = subsection ? `الحالة الحالية لـ${subsection}` : `الحالة الحالية — ${base}`;
    }
    return `شكل (${figNo}): ${base}.`.replace(/\.\.$/, '.');
  }
  return `Figure (${figNo}): ${base}.`.replace(/\.\.$/, '.');
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
    .split(/(?<=[.。])\s+|(?:\d+[\).\-]\s+)|(?:؛\s*)/)
    .map((s) => s.replace(/^[\s•\-–—*]+/, '').trim())
    .filter((s) => s.length > 12);
  if (parts.length >= 2) return parts;
  return cleaned ? [cleaned] : [];
}

function figureLayout(img: EngineeringStudyImage): 'single' | 'double' | 'full_width' {
  if (img.layout_type === 'double') return 'double';
  if (
    img.layout_type === 'full_width' ||
    img.image_type === 'site_map' ||
    img.image_type === 'drawing'
  ) {
    return 'full_width';
  }
  return 'single';
}

function figureVariant(img: EngineeringStudyImage): FlowFigure['variant'] {
  if (img.image_type === 'code_proof') return 'code';
  if (img.image_type === 'site_map' || img.image_type === 'drawing') return 'map';
  return 'photo';
}

function buildFigureBlock(
  locale: 'ar' | 'en',
  img: EngineeringStudyImage,
  figureNo: number,
  subsectionTitle: string,
  note?: string
): FlowFigure {
  const title = locale === 'ar' ? img.caption_ar : img.caption_en;
  return {
    kind: 'figure',
    src: img.src,
    caption: figureCaption(
      locale,
      figureNo,
      title,
      subsectionTitle
    ),
    figureNo,
    layout: figureLayout(img),
    variant: figureVariant(img),
    intrinsicWidth: img.intrinsic_width,
    intrinsicHeight: img.intrinsic_height,
    aspectRatio: img.aspect_ratio,
    note: note || undefined,
    imageId: img.image_id,
    displayTitle: title,
    placeholder: locale === 'ar' ? img.placeholder_ar : img.placeholder_en,
    objectPosition: figureVariant(img) === 'map' ? 'center' : 'center',
  };
}

function isExistingMandatoryLayoutSection(sectionId: string): boolean {
  return (EXISTING_MANDATORY_PAGE_SECTIONS as readonly string[]).includes(sectionId) || sectionId === 'project_components';
}

type SubGroup = {
  key: string;
  title: string;
  itemId?: string;
  subsectionOrder: number;
  options: string[];
  notes: string;
  images: EngineeringStudyImage[];
};

function groupImagesBySubsection(
  images: EngineeringStudyImage[],
  locale: 'ar' | 'en'
): SubGroup[] {
  const map = new Map<string, SubGroup>();
  for (const img of images) {
    const title =
      (locale === 'ar' ? img.subsection_ar : img.subsection_en) ||
      sanitizeCaption(locale === 'ar' ? img.caption_ar : img.caption_en, '') ||
      (locale === 'ar' ? 'توثيق مرئي' : 'Visual record');
    const key = img.item_id || title;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        title,
        itemId: img.item_id,
        subsectionOrder: img.subsection_order ?? 999,
        options: [...(img.selected_options || [])],
        notes: img.item_notes || '',
        images: [],
      };
      map.set(key, g);
    } else {
      for (const o of img.selected_options || []) {
        if (!g.options.includes(o)) g.options.push(o);
      }
      if (!g.notes && img.item_notes) g.notes = img.item_notes;
    }
    g.images.push(img);
  }
  return [...map.values()].sort(
    (a, b) =>
      a.subsectionOrder - b.subsectionOrder ||
      (a.images[0]?.image_order ?? 0) - (b.images[0]?.image_order ?? 0)
  );
}

/** Build engineering prose for a subsection — never the generic bridge filler. */
function subsectionContentBlocks(
  group: SubGroup,
  locale: 'ar' | 'en'
): FlowBlock[] {
  const blocks: FlowBlock[] = [];
  const prose = getItemProse(group.itemId);
  const scope = locale === 'ar' ? prose.scope_ar : prose.scope_en;
  const missing = locale === 'ar' ? prose.missing_ar : prose.missing_en;
  const options = group.options.map((o) => sanitizeClientFacingText(o, locale)).filter(Boolean);
  const notes = sanitizeClientFacingText(group.notes, locale);
  // Prefer explicit description carried on the image when present
  const descFromImages = group.images
    .map((img) => (locale === 'ar' ? img.description_ar : img.description_en) || '')
    .find((d) => d.trim());
  const description = sanitizeClientFacingText(descFromImages || '', locale);

  const head: FlowBlock[] = [{ kind: 'subsection', title: group.title }];

  // Always lead with topic engineering scope for known items (not options dump)
  if (scope) {
    head.push({ kind: 'paragraph', text: sanitizeClientFacingText(scope, locale) });
  } else if (description) {
    head.push({ kind: 'paragraph', text: description });
  }

  blocks.push({ kind: 'unit', blocks: head });

  if (options.length) {
    blocks.push({ kind: 'bullet_list', items: options });
  }

  if (notes) {
    const dup = options.some((o) => notes.includes(o) || o.includes(notes));
    if (!dup) {
      blocks.push({ kind: 'paragraph', text: notes });
    }
  } else if (description && scope && description !== sanitizeClientFacingText(scope, locale)) {
    blocks.push({ kind: 'paragraph', text: description });
  }

  if (!scope && !description && !options.length && !notes) {
    blocks.push({ kind: 'paragraph', text: missing, incomplete: true });
  } else if (scope && !options.length && !notes && !description && group.itemId) {
    // Known topic with photo but no project facts — state the data gap clearly
    blocks.push({ kind: 'paragraph', text: missing, incomplete: true });
  }

  return blocks;
}

export function sectionToFlowBlocks(
  doc: EngineeringStudyDocument,
  section: EngineeringStudySection,
  displayNo: number,
  counters: { figures: number; tables: number; references: number }
): FlowBlock[] {
  const locale = doc.locale;
  const blocks: FlowBlock[] = [];
  const images = placeSectionImages(section);
  const paras = filterIntroAgainstFacts(uniqueParagraphs(section.paragraphs), images, locale);
  const tables = section.tables || [];
  const refs = collectRefs(section.paragraphs, locale);

  blocks.push({
    kind: 'chapter',
    id: section.id,
    number: displayNo,
    title: chapterTitle(section, locale, displayNo),
  });

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
    if (refs.length) {
      counters.references += 1;
      blocks.push({ kind: 'reference_note', refs, referenceNo: counters.references });
    }
    return blocks;
  }

  if (
    section.id === 'site_access_evidence' ||
    section.id === 'existing_condition_evidence' ||
    section.id === 'safety_system_evidence' ||
    section.id === 'code_evidence_references'
  ) {
    for (const p of paras) {
      const text = sanitizeClientFacingText(p.text, locale);
      if (text) blocks.push({ kind: 'paragraph', text, incomplete: p.incomplete });
    }
    const groups = groupImagesBySubsection(images, locale);
    const pendingPhotoFigures: FlowFigure[] = [];
    const pendingCodeFigures: FlowFigure[] = [];
    const flushPhotoRows = () => {
      while (pendingPhotoFigures.length) {
        blocks.push({ kind: 'figure_row', figures: pendingPhotoFigures.splice(0, 2) });
      }
    };
    const flushCodeSequence = () => {
      if (pendingCodeFigures.length) {
        blocks.push({ kind: 'code_sequence', figures: pendingCodeFigures.splice(0) });
      }
    };

    for (const group of groups) {
      const description = sanitizeClientFacingText(
        group.images
          .map((img) => (locale === 'ar' ? img.description_ar : img.description_en) || '')
          .find((value) => value.trim()) || '',
        locale
      );

      group.images.forEach((img, imageIndex) => {
        counters.figures += 1;
        const figure = buildFigureBlock(
          locale,
          img,
          counters.figures,
          group.title,
          imageIndex === 0 ? description : undefined
        );
        if (figure.layout === 'double') {
          flushCodeSequence();
          pendingPhotoFigures.push(figure);
          return;
        }
        flushPhotoRows();
        if (figure.variant === 'code') {
          pendingCodeFigures.push(figure);
          return;
        }
        flushCodeSequence();
        blocks.push({ kind: 'unit', blocks: [figure] });
      });
    }
    flushPhotoRows();
    flushCodeSequence();
    if (refs.length) {
      counters.references += 1;
      blocks.push({ kind: 'reference_note', refs, referenceNo: counters.references });
    }
    return blocks;
  }

  if (section.id === 'summary') {
    const raw = sanitizeClientFacingText(paras.map((p) => p.text).join(' '), locale);
    if (tables.length) {
      for (const t of tables) {
        blocks.push({
          kind: 'table',
          tableNo: ++counters.tables,
          caption: locale === 'ar' ? t.caption_ar : t.caption_en,
          headers: locale === 'ar' ? t.headers_ar : t.headers_en,
          rows: t.rows,
        });
      }
    }
    blocks.push({
      kind: 'paragraph',
      text:
        locale === 'ar'
          ? 'تناولت الدراسة مراجعة متطلبات السلامة والوقاية من الحريق للمنشأة محل الدراسة، بما يشمل تصنيف الإشغال، مسالك الهروب، أنظمة مكافحة الحريق، أنظمة الإنذار، السلامة الكهربائية ومتطلبات الدفاع المدني، وفق البيانات المعتمدة في ملف المشروع دون افتراض قيم غير موثّقة.'
          : 'The study reviewed fire-safety requirements for the facility, covering occupancy classification, means of egress, firefighting systems, alarm systems, electrical safety, and Civil Defense requirements, based on approved project-file data without assuming undocumented values.',
    });
    if (raw) {
      const facts = extractSummaryFacts(raw, locale);
      if (facts.rows.length && !tables.length) {
        blocks.push({
          kind: 'table',
          tableNo: ++counters.tables,
          caption: locale === 'ar' ? 'ملخص بيانات المشروع المعتمدة' : 'Approved project data summary',
          headers: locale === 'ar' ? ['البند', 'القيمة'] : ['Item', 'Value'],
          rows: facts.rows,
        });
        if (facts.remainder) blocks.push({ kind: 'paragraph', text: facts.remainder });
      } else {
        blocks.push({ kind: 'paragraph', text: raw });
      }
    }
    if (refs.length) {
      counters.references += 1;
      blocks.push({ kind: 'reference_note', refs, referenceNo: counters.references });
    }
    return blocks;
  }

  if (section.id === 'conclusion') {
    for (const p of paras) {
      blocks.push({
        kind: 'paragraph',
        text: sanitizeClientFacingText(p.text, locale),
        incomplete: p.incomplete,
      });
    }
    if (refs.length) {
      counters.references += 1;
      blocks.push({ kind: 'reference_note', refs, referenceNo: counters.references });
    }
    return blocks;
  }

  // Chapter intro — one engineering overview paragraph (not per-image filler)
  if (isExistingMandatoryLayoutSection(section.id)) {
    for (const t of tables) {
      blocks.push({
        kind: 'table',
        tableNo: ++counters.tables,
        caption: locale === 'ar' ? t.caption_ar : t.caption_en,
        headers: locale === 'ar' ? t.headers_ar : t.headers_en,
        rows: t.rows,
      });
    }
    for (const p of paras) {
      if (isExistingReportMissingMediaLabel(p.text)) continue;
      blocks.push({
        kind: 'paragraph',
        text: sanitizeClientFacingText(p.text, locale),
        incomplete: p.incomplete,
      });
    }
    const groups = groupImagesBySubsection(images, locale);
    for (const group of groups) {
      for (const img of group.images) {
        counters.figures += 1;
        blocks.push({
          kind: 'unit',
          blocks: [buildFigureBlock(locale, img, counters.figures, group.title)],
        });
      }
    }
    if (refs.length) {
      counters.references += 1;
      blocks.push({ kind: 'reference_note', refs, referenceNo: counters.references });
    }
    if (section.id === 'project_components') {
      blocks.push({ kind: 'page_break', id: 'after_project_components' });
    }
    return blocks;
  }

  if (paras.length) {
    blocks.push({
      kind: 'paragraph',
      text: sanitizeClientFacingText(paras[0].text, locale),
      incomplete: paras[0].incomplete,
    });
  }

  for (const t of tables) {
    blocks.push({
      kind: 'table',
      tableNo: ++counters.tables,
      caption: locale === 'ar' ? t.caption_ar : t.caption_en,
      headers: locale === 'ar' ? t.headers_ar : t.headers_en,
      rows: t.rows,
    });
  }

  const groups = groupImagesBySubsection(images, locale);

  if (groups.length) {
    for (const group of groups) {
      blocks.push(...subsectionContentBlocks(group, locale));
      for (const img of group.images) {
        counters.figures += 1;
        blocks.push({
          kind: 'unit',
          blocks: [buildFigureBlock(locale, img, counters.figures, group.title)],
        });
      }
    }
    // Remaining section paragraphs after intro (rare) — append once, no duplication of facts
    for (let i = 1; i < paras.length; i++) {
      const text = sanitizeClientFacingText(paras[i].text, locale);
      if (!text) continue;
      const already = blocks.some(
        (b) => b.kind === 'paragraph' && b.text === text
      );
      if (!already) {
        blocks.push({ kind: 'paragraph', text, incomplete: paras[i].incomplete });
      }
    }
  } else {
    // No images — remaining paragraphs flow naturally
    for (let i = 1; i < paras.length; i++) {
      blocks.push({
        kind: 'paragraph',
        text: sanitizeClientFacingText(paras[i].text, locale),
        incomplete: paras[i].incomplete,
      });
    }
  }

  if (refs.length) {
    counters.references += 1;
    blocks.push({ kind: 'reference_note', refs, referenceNo: counters.references });
  }

  return blocks;
}

export function documentToFlowBlocks(doc: EngineeringStudyDocument): {
  blocks: FlowBlock[];
  chapters: { id: string; title: string; displayNo: number }[];
} {
  const mandatoryExistingSections = new Set<string>([
    ...EXISTING_MANDATORY_PAGE_SECTIONS,
    'existing_recommendations',
    'conclusion',
  ]);
  const content = doc.sections.filter((s) => s.id !== 'cover' && s.id !== 'toc');
  const visible = content.filter((s) => {
    const paras = uniqueParagraphs(s.paragraphs);
    const hasReal =
      paras.some((p) => !p.incomplete) ||
      (s.images && s.images.length > 0) ||
      (s.tables && s.tables.length > 0);
    const always =
      mandatoryExistingSections.has(s.id) ||
      s.id === 'summary' ||
      s.id === 'engineering_recommendations' ||
      s.id === 'engineering_compliance_review';
    return hasReal || always;
  });

  const counters = { figures: 0, tables: 0, references: 0 };
  const blocks: FlowBlock[] = [];
  const chapters: { id: string; title: string; displayNo: number }[] = [];

  visible.forEach((section, i) => {
    const displayNo = i + 1;
    const sectionBlocks = sectionToFlowBlocks(doc, section, displayNo, counters);
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
      return 10;
    case 'subsection':
      return 7;
    case 'paragraph': {
      const lines = Math.ceil((block.text?.length || 0) / 95);
      return Math.max(5, lines * 4.8);
    }
    case 'bullet_list':
      return 5 + (block.items?.length || 0) * 4.5;
    case 'reference_note':
      return 7;
    case 'table':
      return 9 + (block.rows?.length || 0) * 5;
    case 'figure':
      return block.layout === 'full_width' ? 80 : block.layout === 'double' ? 44 : 58;
    case 'figure_row':
      return Math.max(...block.figures.map((figure) => estimateBlockHeightMm(figure)), 0) + 4;
    case 'unit':
      return (block.blocks || []).reduce((n, b) => n + estimateBlockHeightMm(b), 1);
    case 'page_break':
      return 0;
    default:
      return 5;
  }
}

export function estimateFlowTocPages(
  chapters: { id: string }[],
  blocks: FlowBlock[]
): Record<string, number> {
  const usable = 250;
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
