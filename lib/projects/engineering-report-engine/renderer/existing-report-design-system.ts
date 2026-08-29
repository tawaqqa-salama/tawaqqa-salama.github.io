/**
 * Visual design system for EXISTING final technical report (layout only).
 * Shared by preview, print, and Chromium PDF — one table style, one image frame.
 */

import { esc } from '@/lib/projects/engineering-report-engine/renderer/html-utils';

/** Content-area primary photo frame on A4 (inside @page margins). */
export const EXISTING_REPORT_IMAGE_FRAME = {
  maxWidth: '168mm',
  height: '68mm',
  borderRadius: '2mm',
  border: '1px solid #9eb0b3',
  objectFit: 'cover' as const,
  objectPosition: 'center' as const,
} as const;

export const EXISTING_REPORT_TABLE_CLASS = 'existing-report-table';
export const EXISTING_REPORT_TABLE_WRAP_CLASS = 'existing-report-table-wrap';
export const EXISTING_REPORT_IMAGE_BLOCK_CLASS = 'existing-report-image-block';
export const EXISTING_REPORT_IMAGE_SLOT_CLASS = 'existing-report-image-slot';
export const EXISTING_REPORT_IMAGE_TITLE_CLASS = 'existing-report-image-title';

export type ExistingReportTableLayout =
  | 'key-value'
  | 'components'
  | 'recommendations'
  | 'wide'
  | 'summary-metrics';

export type ExistingReportImageVariant = 'photo' | 'map' | 'code';

export type ExistingReportImageObjectPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right';

const MISSING_LABELS = [
  'لم يتم إرفاق صورة واجهة المشروع',
  'لم يتم إرفاق الصورة الجوية للموقع',
  'لم يتم إرفاق صورة مسار الدفاع المدني',
] as const;

export function isExistingReportMissingMediaLabel(text: string): boolean {
  const trimmed = text.trim();
  return (MISSING_LABELS as readonly string[]).includes(trimmed);
}

export function resolveExistingReportTableLayout(caption: string, headers: string[]): ExistingReportTableLayout {
  if (caption.includes('ملخص حالات')) return 'summary-metrics';
  if (headers.length === 2 && (headers[0] === 'البند' || headers[0] === 'البيان')) return 'key-value';
  if (
    caption.includes('مكونات المشروع') ||
    headers.includes('اسم المكون') ||
    headers.includes('المكوّن')
  ) {
    return 'components';
  }
  if (caption.includes('الإجراءات والتوصيات')) return 'recommendations';
  if (headers.length >= 5) return 'wide';
  return 'key-value';
}

export function existingReportTableLayoutClass(layout: ExistingReportTableLayout): string {
  return `${EXISTING_REPORT_TABLE_CLASS} existing-report-table--${layout}`;
}

export function buildExistingReportTableColgroup(layout: ExistingReportTableLayout, columnCount: number): string {
  const widths: Record<ExistingReportTableLayout, string[]> = {
    'key-value': ['28%', '72%'],
    components: ['5%', '14%', '12%', '10%', '9%', '9%', '11%', '16%', '14%'],
    recommendations: ['14%', '12%', '46%', '28%'],
    wide: [],
    'summary-metrics': [],
  };

  if (layout === 'wide') {
    const first = Math.max(8, Math.floor(72 / Math.max(columnCount - 1, 1)));
    const cols = [`${100 - first * (columnCount - 1)}%`, ...Array.from({ length: columnCount - 1 }, () => `${first}%`)];
    return `<colgroup>${cols.map((width) => `<col style="width:${width}" />`).join('')}</colgroup>`;
  }

  const preset = widths[layout];
  if (layout === 'summary-metrics') {
    return `<colgroup>${Array.from({ length: columnCount }, () => '<col style="width:31mm" />').join('')}</colgroup>`;
  }
  const cols = preset.length >= columnCount ? preset.slice(0, columnCount) : preset;
  return `<colgroup>${cols.map((width) => `<col style="width:${width}" />`).join('')}</colgroup>`;
}

export function resolveExistingReportImageObjectPosition(
  variant: ExistingReportImageVariant
): ExistingReportImageObjectPosition {
  return variant === 'map' ? 'center' : 'center';
}

export function renderExistingReportImageSlotHtml(params: {
  title: string;
  caption?: string;
  src?: string | null;
  placeholder?: string | null;
  variant?: ExistingReportImageVariant;
  objectPosition?: ExistingReportImageObjectPosition;
}): string {
  const variant = params.variant || 'photo';
  const objectPosition = params.objectPosition || resolveExistingReportImageObjectPosition(variant);
  const missing = !params.src?.trim();
  const slotClass = `${EXISTING_REPORT_IMAGE_SLOT_CLASS}${missing ? ' is-missing' : ''} existing-report-image-slot--${variant}`;
  const inner = missing
    ? `<div class="existing-report-image-placeholder">${esc(params.placeholder || 'لم يتم إرفاق الصورة')}</div>`
    : `<img src="${esc(params.src || '')}" alt="" style="object-position:${objectPosition};" />`;
  const caption = params.caption?.trim();
  return `<section class="${EXISTING_REPORT_IMAGE_BLOCK_CLASS} keep">
    <h4 class="${EXISTING_REPORT_IMAGE_TITLE_CLASS}">${esc(params.title)}</h4>
    <div class="${slotClass}">${inner}</div>
    ${caption && caption !== params.title ? `<p class="existing-report-image-caption">${esc(caption)}</p>` : ''}
  </section>`;
}

export function getExistingReportDesignSystemCss(): string {
  const frame = EXISTING_REPORT_IMAGE_FRAME;
  return `
  .${EXISTING_REPORT_TABLE_WRAP_CLASS} { width:100%; max-width:100%; margin:4mm 0 5mm; break-inside:auto; page-break-inside:auto; }
  .${EXISTING_REPORT_TABLE_WRAP_CLASS} .official-table-caption { color:#123d4c; font-weight:800; font-size:10.5px; margin:0 0 2mm; text-align:start; letter-spacing:0.01em; }
  .${EXISTING_REPORT_TABLE_CLASS} { width:100%; max-width:100%; table-layout:fixed; border-collapse:collapse; direction:rtl; font-size:10px; line-height:1.55; }
  .${EXISTING_REPORT_TABLE_CLASS} thead { display:table-header-group; }
  .${EXISTING_REPORT_TABLE_CLASS} tfoot { display:table-footer-group; }
  .${EXISTING_REPORT_TABLE_CLASS} tbody tr { break-inside:avoid; page-break-inside:avoid; }
  .${EXISTING_REPORT_TABLE_WRAP_CLASS} .official-table-caption { break-after:avoid-page; page-break-after:avoid; orphans:2; widows:2; }
  .${EXISTING_REPORT_TABLE_CLASS} th, .${EXISTING_REPORT_TABLE_CLASS} td {
    border:1px solid #9eb0b3; padding:2.8mm 3mm; vertical-align:middle; text-align:right; direction:rtl;
    overflow-wrap:anywhere; word-break:normal; white-space:normal; min-width:0; unicode-bidi:plaintext;
  }
  .${EXISTING_REPORT_TABLE_CLASS} th { background:#e6f1f1; color:#123d4c; font-weight:800; font-size:10px; }
  .${EXISTING_REPORT_TABLE_CLASS} td { background:#fff; color:#151515; }
  .${EXISTING_REPORT_TABLE_CLASS} .existing-report-cell-text { display:block; max-width:100%; overflow-wrap:anywhere; word-break:normal; white-space:normal; unicode-bidi:isolate; }
  .existing-report-table--key-value td:first-child, .existing-report-table--key-value th:first-child { font-weight:800; color:#123d4c; background:#f4f8f8; }
  .existing-report-table--components th, .existing-report-table--components td { font-size:9.5px; }
  .existing-report-table--components td:first-child, .existing-report-table--components th:first-child { text-align:center; font-weight:800; }
  .existing-report-table--recommendations td:nth-child(3), .existing-report-table--recommendations th:nth-child(3) { width:auto; }
  .existing-report-table--wide td, .existing-report-table--wide th { font-size:9.5px; }
  .official-engineering-sheet .${EXISTING_REPORT_TABLE_WRAP_CLASS} .official-table-caption { color:#167b7f; border-inline-start:2px solid #d2a33b; padding-inline-start:5px; }
  .official-status-row td { background:#fcfdfd; }
  .official-status-cell { display:inline-block !important; width:auto; min-width:23mm; padding:.55mm 2mm; border:1px solid #8aa5a8; border-radius:999px; background:#f1f7f6; color:#123d4c; font-weight:900; text-align:center; }
  .${EXISTING_REPORT_IMAGE_BLOCK_CLASS} { width:100%; max-width:${frame.maxWidth}; margin:4mm auto 6mm; break-inside:avoid; page-break-inside:avoid; }
  .${EXISTING_REPORT_IMAGE_TITLE_CLASS} { margin:0 0 2mm; color:#123d4c; font-size:10.5px; font-weight:800; text-align:start; letter-spacing:0.01em; }
  .${EXISTING_REPORT_IMAGE_SLOT_CLASS} {
    width:100%; max-width:${frame.maxWidth}; height:${frame.height}; margin-inline:auto;
    border:${frame.border}; border-radius:${frame.borderRadius}; overflow:hidden; background:#f4f8f8;
    display:flex; align-items:center; justify-content:center; position:relative;
  }
  .${EXISTING_REPORT_IMAGE_SLOT_CLASS} img {
    width:100%; height:100%; object-fit:${frame.objectFit}; object-position:${frame.objectPosition}; display:block;
  }
  .${EXISTING_REPORT_IMAGE_SLOT_CLASS}.is-missing { border-style:dashed; background:#f7fafa; }
  .existing-report-image-placeholder { padding:6mm 4mm; text-align:center; font-weight:800; color:#23434a; font-size:10px; line-height:1.65; }
  .existing-report-image-caption { margin:2mm 0 0; color:#167b7f; font-size:9.5px; font-weight:700; text-align:center; }
  .official-missing-media { min-height:${frame.height}; margin:4mm auto 6mm; max-width:${frame.maxWidth}; padding:6mm 4mm; border:1.5px dashed #8aa5a8; border-radius:${frame.borderRadius}; background:#f7fafa; color:#23434a; font-weight:800; text-align:center; break-inside:avoid; page-break-inside:avoid; }
  .existing-report-maps-link { color:#167b7f; font-weight:800; text-decoration:underline; text-underline-offset:2px; word-break:break-word; overflow-wrap:anywhere; }
  .existing-report-maps-unregistered { color:#23434a; font-weight:700; }
  `;
}
