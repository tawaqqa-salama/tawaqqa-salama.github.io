import type {
  EngineeringStudyImage,
  EngineeringStudySection,
  EngineeringStudySectionId,
  ImageLayoutType,
  ImageType,
} from '@/lib/projects/engineering-report-engine/types';

const FILE_NAME_RE = /^(IMG_|DSC_|DCIM_|Screenshot|image|photo|pic)[-_]?\d*\.(jpe?g|png|webp|gif|heic)$/i;
const EXT_ONLY_RE = /\.(jpe?g|png|webp|gif|heic|bmp)$/i;

/** Strip technical file names from captions shown in the PDF. */
export function sanitizeCaption(caption: string | null | undefined, fallback: string): string {
  const raw = String(caption || '').trim();
  if (!raw) return fallback;
  if (FILE_NAME_RE.test(raw) || EXT_ONLY_RE.test(raw)) return fallback;
  // "IMG_6436.jpeg — موقع" → keep descriptive part if present
  const withoutFile = raw.replace(/^[A-Za-z0-9_\-]+\.(jpe?g|png|webp|gif|heic)\s*[—\-:]?\s*/i, '').trim();
  if (!withoutFile || FILE_NAME_RE.test(withoutFile)) return fallback;
  return withoutFile;
}

export function inferImageType(
  sectionId: EngineeringStudySectionId,
  caption: string
): ImageType {
  const c = caption.toLowerCase();
  if (sectionId === 'site_information') {
    if (/earth|خريط|قمر|map|satellite|google/i.test(c)) return 'site_map';
    return 'site';
  }
  if (/واجه|facade|غلاف|cover/i.test(c)) return 'facade';
  if (/إثبات|proof|كود|code/i.test(c)) return 'code_proof';
  if (/مضخ|pump/i.test(c)) return 'system';
  if (/إنذار|alarm|panel|كاشف|detector/i.test(c)) return 'system';
  if (/طفاي|extinguisher/i.test(c)) return 'system';
  if (/مخطط|drawing|plan/i.test(c)) return 'drawing';
  return 'system';
}

export function inferLayoutType(
  countInSection: number,
  index: number,
  imageType: ImageType
): ImageLayoutType {
  if (imageType === 'site_map' || imageType === 'facade') return 'full_width';
  if (imageType === 'drawing' || imageType === 'code_proof') return 'full_width';
  if (countInSection === 1) return 'single';
  // Pair consecutive photos as double when even count or remaining pair
  if (countInSection >= 2) {
    const pairStart = index - (index % 2);
    if (pairStart + 1 < countInSection) return 'double';
  }
  return 'single';
}

/** Normalize / order images for a section (section_order → image_order). */
export function placeSectionImages(
  section: EngineeringStudySection
): EngineeringStudyImage[] {
  const raw = section.images || [];
  if (!raw.length) return [];

  const sorted = [...raw].sort(
    (a, b) =>
      (a.subsection_order ?? 999) - (b.subsection_order ?? 999) ||
      (a.image_order ?? 999) - (b.image_order ?? 999)
  );

  return sorted.map((img, idx) => {
    const order = idx + 1;
    const fallbackAr =
      img.subsection_ar || `صورة رقم (${order}) — ${section.title_ar}`;
    const fallbackEn =
      img.subsection_en || `Figure (${order}) — ${section.title_en}`;
    const caption_ar = sanitizeCaption(img.caption_ar, fallbackAr);
    const caption_en = sanitizeCaption(img.caption_en, fallbackEn);
    const image_type = img.image_type || inferImageType(section.id, caption_ar);
    return {
      ...img,
      image_id: img.image_id || `${section.id}-${order}`,
      section_id: section.id,
      image_order: order,
      image_type,
      caption_ar,
      caption_en,
      layout_type:
        img.layout_type ||
        inferLayoutType(sorted.length, idx, image_type),
    } satisfies EngineeringStudyImage;
  });
}

/** Group consecutive `double` images into rows of two; others stay single/full. */
export function groupImageRows(images: EngineeringStudyImage[]): EngineeringStudyImage[][] {
  const rows: EngineeringStudyImage[][] = [];
  let i = 0;
  while (i < images.length) {
    const cur = images[i];
    if (cur.layout_type === 'double' && i + 1 < images.length && images[i + 1].layout_type === 'double') {
      rows.push([cur, images[i + 1]]);
      i += 2;
      continue;
    }
    rows.push([cur]);
    i += 1;
  }
  return rows;
}

/**
 * Estimate printed pages for a content section (cover/toc handled separately).
 * Used for dynamic TOC when browser target-counter is unavailable.
 */
export function estimateSectionPages(section: EngineeringStudySection): number {
  const images = placeSectionImages(section);
  const paraChars = (section.paragraphs || []).reduce((n, p) => n + (p.text?.length || 0), 0);
  const tableRows = (section.tables || []).reduce((n, t) => n + (t.rows?.length || 0) + 2, 0);
  let pages = 1;
  // ~1800 Arabic chars ≈ one text page with header/footer
  pages += Math.floor(paraChars / 1800);
  pages += Math.floor(tableRows / 18);
  for (const img of images) {
    if (img.layout_type === 'full_width') pages += 1;
    else if (img.layout_type === 'single') pages += 0.55;
    else pages += 0.35;
  }
  return Math.max(1, Math.ceil(pages));
}

export function buildDynamicTocPages(
  contentSections: EngineeringStudySection[]
): { sectionId: EngineeringStudySectionId; page: number; displayNumber: number }[] {
  // cover=1, toc=2, content starts at 3
  let page = 3;
  return contentSections.map((s, i) => {
    const entry = { sectionId: s.id, page, displayNumber: i + 1 };
    page += estimateSectionPages(s);
    return entry;
  });
}
