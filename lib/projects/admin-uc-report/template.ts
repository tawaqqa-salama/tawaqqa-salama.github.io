/**
 * Independent PDF/HTML template: Administrative building under construction.
 * Presentation layer only. Values and sections are supplied by generate.ts.
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type {
  AdminUcAttachmentPage,
  AdminUcBlock,
  AdminUcDocument,
} from '@/lib/projects/admin-uc-report/generate';
import { esc, formatReportTextHtml } from '@/lib/projects/engineering-report-engine/renderer/html-utils';
import { getEmbeddedArabicFontCss } from '@/lib/projects/engineering-report-engine/renderer/embedded-fonts';

function tx(text: string): string {
  return formatReportTextHtml(text);
}

function renderBlock(block: AdminUcBlock): string {
  switch (block.kind) {
    case 'h2':
      return `<h2 class="h2 keep-next">${tx(block.text)}</h2>`;
    case 'h3':
      return `<h3 class="h3 keep-next">${tx(block.text)}</h3>`;
    case 'p':
      return `<p class="p">${tx(block.text)}</p>`;
    case 'ul':
      return `<ul class="ul">${block.items.map((i) => `<li>${tx(i)}</li>`).join('')}</ul>`;
    case 'ol':
      return `<ol class="ol">${block.items.map((i) => `<li>${tx(i)}</li>`).join('')}</ol>`;
    case 'note':
      return `<div class="note keep">${tx(block.text)}</div>`;
    case 'table':
      return `<div class="tbl tbl-cols-${Math.min(block.headers.length, 5)} keep">
        ${block.caption ? `<div class="tbl-cap">${tx(block.caption)}</div>` : ''}
        <table>
          <thead><tr>${block.headers.map((h) => `<th>${tx(h)}</th>`).join('')}</tr></thead>
          <tbody>${block.rows.map((row) => `<tr>${row.map((c) => `<td>${tx(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
    default:
      return '';
  }
}

function renderCover(doc: AdminUcDocument, company: CompanyProfile): string {
  const brand = doc.consultant || company.legal_name || company.name || 'منصة توقع سلامة';
  const logo = company.logo_url
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="" />`
    : `<div class="logo-fb">${esc(company.name || 'توقع')}</div>`;

  return `
  <section class="page cover">
    <div class="cover-grid" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="cover-inner">
      <header class="cover-brand">
        <div class="cover-mark">${logo}</div>
        <div class="cover-office">${esc(brand)}</div>
        <div class="cover-rule"></div>
      </header>
      <main class="cover-title">
        <div class="cover-kicker">منصة توقع سلامة</div>
        <h1>التقرير الفني</h1>
        <p>دراسة هندسية لأنظمة السلامة والوقاية من الحريق</p>
        <div class="cover-subtype">المبنى الإداري تحت الإنشاء</div>
      </main>
      <section class="cover-details" aria-label="بيانات التقرير">
        <div><span>اسم المشروع</span><strong>${tx(doc.project_name)}</strong></div>
        <div><span>اسم المالك</span><strong>${tx(doc.owner_name)}</strong></div>
        <div><span>الموقع</span><strong>${tx(doc.location)}</strong></div>
        <div><span>رقم التقرير</span><strong dir="ltr">${tx(doc.report_number)}</strong></div>
        <div><span>التاريخ</span><strong dir="ltr">${tx(doc.report_date)}</strong></div>
        <div><span>الجهة الاستشارية</span><strong>${tx(brand)}</strong></div>
      </section>
      <footer class="cover-footer">
        <span>وثيقة هندسية رسمية</span><span>أنظمة السلامة والوقاية من الحريق</span>
      </footer>
    </div>
  </section>`;
}

function renderToc(doc: AdminUcDocument): string {
  const rows = doc.toc
    .map(
      (t) => `<div class="toc-row">
        <span class="toc-n" dir="ltr">${t.number}.</span>
        <span class="toc-t">${tx(t.title)}</span>
        <span class="toc-dots"></span>
      </div>`
    )
    .join('');
  return `
  <section class="toc-block">
    <div class="section-eyebrow">دليل التقرير</div>
    <h2 class="h2">فهرس المحتويات — التقرير الأساسي</h2>
    <div class="toc">${rows}</div>
    <div class="toc-att">المرفقات، إن وجدت، قسم مستقل لا يدخل في صفحات التقرير الأساسي.</div>
  </section>`;
}

function renderChapters(doc: AdminUcDocument): string {
  return doc.chapters
    .map(
      (ch) => `<section class="chapter chapter-${esc(ch.id)}" id="ch-${esc(ch.id)}">
        <h2 class="ch-title keep-next"><span class="ch-n" dir="ltr">${ch.number}.</span> ${tx(ch.title)}</h2>
        ${ch.blocks.map(renderBlock).join('\n')}
      </section>`
    )
    .join('\n');
}

function renderAttachments(attachments: AdminUcAttachmentPage[]): string {
  // A no-attachment placeholder would create a near-empty A4 page, so the
  // official document omits this optional section entirely until evidence exists.
  if (!attachments.length) return '';
  const items = attachments
    .map((a, idx) => {
      const img = a.imageSrc
        ? `<figure class="att-fig"><img src="${esc(a.imageSrc)}" alt="" /><figcaption>${tx(a.title)}</figcaption></figure>`
        : `<div class="att-card keep"><div class="att-title">${tx(a.title || `مرفق ${idx + 1}`)}</div>${a.fileName ? `<div class="att-file" dir="ltr">${tx(a.fileName)}</div>` : ''}${a.note ? `<div class="att-note">${tx(a.note)}</div>` : ''}</div>`;
      return `<article class="att-item">${img}</article>`;
    })
    .join('\n');

  return `
  <section class="attachments-section">
    <h1 class="att-h">المرفقات</h1>
    <p class="p">هذا القسم خارج التقرير الأساسي. عدد المرفقات لا يغير ترتيب التقرير أو فهرسه الأساسي.</p>
    ${items}
  </section>`;
}

function css(): string {
  return `
${getEmbeddedArabicFontCss()}
@page { size: A4; margin: 14mm 14mm 16mm; }
@page cover { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; color: #14251e; background: #fff;
  font-family: 'Noto Naskh Arabic', 'Noto Naskh Arabic UI', Tahoma, sans-serif;
  font-size: 12pt; line-height: 1.78; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.report { direction: rtl; background: #fff; }
.cover { page: cover; position: relative; min-height: 297mm; height: 297mm; overflow: hidden; break-after: page; page-break-after: always; background: #123b32; color: #f7fbf8; }
.cover-grid { position: absolute; inset: 0; overflow: hidden; opacity: .9; }
.cover-grid::before, .cover-grid::after { content: ''; position: absolute; border: 1px solid rgba(184, 224, 193, .22); transform: rotate(32deg); }
.cover-grid::before { width: 150mm; height: 150mm; top: -76mm; left: -35mm; }
.cover-grid::after { width: 165mm; height: 165mm; bottom: -97mm; right: -75mm; }
.cover-grid i { position: absolute; width: 3px; background: #9bd0a7; opacity: .52; transform: rotate(32deg); }
.cover-grid i:nth-child(1) { height: 180mm; top: -30mm; right: 28mm; }
.cover-grid i:nth-child(2) { height: 122mm; bottom: -20mm; left: 37mm; }
.cover-grid i:nth-child(3) { height: 70mm; top: 52mm; left: 18mm; opacity: .28; }
.cover-grid i:nth-child(4) { height: 54mm; bottom: 55mm; right: 20mm; opacity: .28; }
.cover-inner { position: relative; z-index: 1; min-height: 297mm; padding: 22mm 19mm 16mm; display: flex; flex-direction: column; }
.cover-brand { display: flex; align-items: center; gap: 10px; }
.cover-mark { width: 55mm; min-height: 20mm; display: flex; align-items: center; justify-content: flex-start; }
.logo { max-width: 52mm; max-height: 18mm; object-fit: contain; filter: brightness(0) invert(1); }
.logo-fb { display: inline-block; padding: 6px 12px; border: 1px solid #b8e0c1; color: #fff; font-weight: 700; font-size: 13pt; }
.cover-office { color: #d8ebdc; font-weight: 700; font-size: 11pt; max-width: 67mm; line-height: 1.55; }
.cover-rule { flex: 1; height: 1px; background: rgba(216, 235, 220, .58); }
.cover-title { margin-top: 40mm; max-width: 138mm; }
.cover-kicker { color: #b8e0c1; font-size: 12pt; font-weight: 700; letter-spacing: .03em; }
.cover-title h1 { margin: 6mm 0 3mm; color: #fff; font-size: 36pt; line-height: 1.18; font-weight: 800; }
.cover-title p { margin: 0; color: #e5f1e8; font-size: 16pt; line-height: 1.62; }
.cover-subtype { display: inline-block; margin-top: 9mm; padding: 2.5mm 7mm; border: 1px solid #9bd0a7; color: #fff; font-size: 12pt; font-weight: 700; }
.cover-details { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-top: 1px solid rgba(216, 235, 220, .55); border-right: 1px solid rgba(216, 235, 220, .55); background: rgba(6, 35, 27, .34); }
.cover-details > div { min-height: 20mm; padding: 3.5mm 5mm; border-left: 1px solid rgba(216, 235, 220, .55); border-bottom: 1px solid rgba(216, 235, 220, .55); }
.cover-details span { display: block; color: #b8e0c1; font-size: 9.5pt; font-weight: 700; }
.cover-details strong { display: block; margin-top: 1mm; color: #fff; font-size: 11.5pt; font-weight: 700; line-height: 1.45; unicode-bidi: plaintext; }
.cover-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 9mm; color: #cce3d1; font-size: 9.5pt; }
.core { direction: rtl; }
.toc-block { margin: 0 0 16mm; padding: 0 0 8mm; border-bottom: 2px solid #2e7158; }
.section-eyebrow { color: #2e7158; font-size: 10pt; font-weight: 700; letter-spacing: .04em; }
.toc-block .h2 { margin-top: 1mm; }
.toc { columns: 2; column-gap: 15mm; column-fill: balance; }
.toc-row { display: flex; align-items: baseline; gap: 7px; break-inside: avoid; margin: 3px 0; font-size: 11.5pt; }
.toc-n { color: #1f5945; font-weight: 800; min-width: 1.7rem; }
.toc-t { flex: 0 1 auto; }
.toc-dots { flex: 1; min-width: 16px; border-bottom: 1px dotted #98b5a5; transform: translateY(-3px); }
.toc-att { margin-top: 6mm; color: #416c59; font-size: 10.5pt; }
.chapter { margin: 0 0 12mm; break-inside: auto; page-break-inside: auto; }
.chapter + .chapter { break-before: auto; page-break-before: auto; }
.ch-title { margin: 0 0 7mm; padding: 0 0 3mm; border-bottom: 2px solid #2e7158; color: #123b32; font-size: 16pt; line-height: 1.35; font-weight: 800; }
.ch-n { color: #2e7158; }
.h2 { margin: 10mm 0 4mm; color: #1f5945; font-size: 13.5pt; line-height: 1.4; font-weight: 800; }
.h3 { margin: 8mm 0 3mm; color: #285e4a; font-size: 12pt; line-height: 1.45; font-weight: 800; }
.p { margin: 0 0 5mm; text-align: right; line-height: 1.88; }
.ul, .ol { margin: 0 0 6mm; padding-inline-start: 8mm; }
.ul li, .ol li { margin: 1.5mm 0; padding-inline-start: 1.5mm; }
.note { margin: 6mm 0 8mm; padding: 4mm 5mm; border: 1px solid #d3b56c; border-right: 4px solid #b68d2e; background: #fffaf0; color: #4f4120; font-size: 10.8pt; line-height: 1.7; }
.tbl { margin: 4mm 0 9mm; break-inside: avoid; page-break-inside: avoid; }
.tbl-cap { margin-bottom: 3mm; color: #1f5945; font-size: 11pt; font-weight: 800; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10.7pt; line-height: 1.58; }
th, td { border: 1px solid #b8cfc1; padding: 3.2mm 3.5mm; vertical-align: top; text-align: right; overflow-wrap: anywhere; word-break: normal; unicode-bidi: plaintext; }
th { background: #deede3; color: #123b32; font-weight: 800; }
tbody tr:nth-child(even) { background: #f7faf8; }
tr { break-inside: avoid; page-break-inside: avoid; }
.tbl-cols-2 td:first-child, .tbl-cols-2 th:first-child { width: 38%; font-weight: 700; }
.tbl-cols-3 th:first-child, .tbl-cols-3 td:first-child { width: 34%; font-weight: 700; }
.tbl-cols-3 th:last-child, .tbl-cols-3 td:last-child { width: 20%; font-size: 9.7pt; color: #395947; }
.tbl-cols-4 { font-size: 10pt; }
.chapter-water .tbl, .chapter-alarm .tbl, .chapter-suppression .tbl { margin-bottom: 10mm; }
.chapter-water .h2, .chapter-alarm .h2, .chapter-suppression .h2 { margin-top: 11mm; }
.chapter-water .h2 + .p { color: #395947; font-size: 11pt; }
.keep, .keep-next { break-inside: avoid; page-break-inside: avoid; }
.keep-next { break-after: avoid; page-break-after: avoid; }
.attachments-section { page-break-before: always; break-before: page; margin-top: 8mm; }
.att-h { margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 3px solid #2e7158; color: #123b32; font-size: 18pt; }
.att-item { margin: 0 0 12mm; break-inside: avoid; page-break-inside: avoid; }
.att-card { border: 1px solid #b8cfc1; padding: 5mm; background: #f7faf8; }
.att-title { color: #123b32; font-weight: 800; }
.att-file { margin-top: 2mm; color: #416c59; font-size: 10pt; }
.att-note { margin-top: 3mm; font-size: 10.5pt; }
.att-fig { margin: 0; break-inside: avoid; page-break-inside: avoid; }
.att-fig img { display: block; max-width: 100%; max-height: 220mm; margin: 0 auto; object-fit: contain; border: 1px solid #b8cfc1; }
.att-fig figcaption { margin-top: 3mm; color: #416c59; font-size: 10.5pt; text-align: center; }
@media print {
  html, body { background: #fff; }
  .cover { height: 297mm; min-height: 297mm; }
  .toc-block, .tbl, .note, .att-item { break-inside: avoid-page; page-break-inside: avoid; }
}
`;
}

export function buildAdminUcReportHtml(params: {
  document: AdminUcDocument;
  company: CompanyProfile;
}): string {
  const { document: doc, company } = params;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(doc.title_ar)}</title>
  <style>${css()}</style>
</head>
<body>
  <div class="report">
    ${renderCover(doc, company)}
    <main class="core">
      ${renderToc(doc)}
      ${renderChapters(doc)}
    </main>
    ${renderAttachments(doc.attachments)}
  </div>
</body>
</html>`;
}
