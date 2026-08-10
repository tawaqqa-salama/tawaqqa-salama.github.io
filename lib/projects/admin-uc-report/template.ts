/**
 * Independent PDF/HTML template: Administrative building under construction.
 * Methodology inspired by Nasaim ordering — not a reuse of the hotel/Nasaim PDF template.
 * Core study ≈ 11 content pages (content-driven). Attachments start after core.
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
      return `<div class="tbl keep">
        ${block.caption ? `<div class="tbl-cap">${tx(block.caption)}</div>` : ''}
        <table>
          <thead><tr>${block.headers.map((h) => `<th>${tx(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${block.rows
              .map((row) => `<tr>${row.map((c) => `<td>${tx(c)}</td>`).join('')}</tr>`)
              .join('')}
          </tbody>
        </table>
      </div>`;
    default:
      return '';
  }
}

function renderCover(doc: AdminUcDocument, company: CompanyProfile): string {
  const brand = doc.consultant || company.legal_name || company.name || 'منصة توقع سلامة';
  return `
  <section class="page cover">
    <div class="cover-inner">
      <div class="brand">
        ${
          company.logo_url
            ? `<img class="logo" src="${esc(company.logo_url)}" alt="" />`
            : `<div class="logo-fb">${esc(company.name || 'توقع')}</div>`
        }
        <div class="office">${esc(brand)}</div>
      </div>
      <div class="cover-title">
        <div class="kind">التقرير الفني</div>
        <h1>دراسة هندسية لأنظمة السلامة والوقاية من الحريق</h1>
        <div class="subtype">المبنى الإداري تحت الإنشاء</div>
      </div>
      <table class="meta">
        <tr><td>اسم المشروع</td><td>${tx(doc.project_name)}</td></tr>
        <tr><td>اسم المالك</td><td>${tx(doc.owner_name)}</td></tr>
        <tr><td>الموقع</td><td>${tx(doc.location)}</td></tr>
        <tr><td>رقم التقرير</td><td>${tx(doc.report_number)}</td></tr>
        <tr><td>التاريخ</td><td>${tx(doc.report_date)}</td></tr>
        <tr><td>الجهة الاستشارية</td><td>${tx(brand)}</td></tr>
      </table>
      <p class="cover-foot">لا يحتوي الغلاف على تفاصيل هندسية.</p>
    </div>
  </section>`;
}

function renderToc(doc: AdminUcDocument): string {
  const rows = doc.toc
    .map(
      (t) => `<div class="toc-row">
      <span class="toc-n">${t.number}.</span>
      <span class="toc-t">${tx(t.title)}</span>
      <span class="toc-dots"></span>
    </div>`
    )
    .join('');
  return `
  <section class="toc-block">
    <h2 class="h2">فهرس المحتويات — التقرير الأساسي</h2>
    <div class="toc">${rows}</div>
    <div class="toc-att">ثم: <strong>المرفقات</strong> (قسم منفصل — خارج صفحات التقرير الأساسي)</div>
  </section>`;
}

function renderChapters(doc: AdminUcDocument): string {
  return doc.chapters
    .map((ch) => {
      return `<section class="chapter" id="ch-${esc(ch.id)}">
        <h2 class="ch-title keep-next"><span class="ch-n">${ch.number}.</span> ${tx(ch.title)}</h2>
        ${ch.blocks.map(renderBlock).join('\n')}
      </section>`;
    })
    .join('\n');
}

function renderAttachments(attachments: AdminUcAttachmentPage[]): string {
  if (!attachments.length) {
    return `
    <section class="attachments-section">
      <h1 class="att-h">المرفقات</h1>
      <p class="p">لا توجد مرفقات مرفوعة حالياً. يمكن إضافة مخططات وصور ومستندات دون التأثير على عدد صفحات التقرير الأساسي.</p>
    </section>`;
  }
  const items = attachments
    .map((a, idx) => {
      const img = a.imageSrc
        ? `<figure class="att-fig"><img src="${esc(a.imageSrc)}" alt="" /><figcaption>${tx(
            a.title
          )}</figcaption></figure>`
        : `<div class="att-card keep">
            <div class="att-title">${tx(a.title || `مرفق ${idx + 1}`)}</div>
            ${a.fileName ? `<div class="att-file">${tx(a.fileName)}</div>` : ''}
            ${a.note ? `<div class="att-note">${tx(a.note)}</div>` : ''}
          </div>`;
      return `<article class="att-item">${img}</article>`;
    })
    .join('\n');

  return `
  <section class="attachments-section">
    <h1 class="att-h">المرفقات</h1>
    <p class="p">هذا القسم خارج التقرير الأساسي (~11 صفحة). عدد المرفقات غير محدود ولا يدخل في فهرس التقرير الأساسي.</p>
    ${items}
  </section>`;
}

function css(): string {
  return `
${getEmbeddedArabicFontCss()}
@page { size: A4; margin: 16mm 14mm 18mm 14mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  font-family: 'Noto Naskh Arabic', 'Noto Naskh Arabic UI', Tahoma, sans-serif;
  color: #122018;
  font-size: 11.5pt;
  line-height: 1.65;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.report { direction: rtl; }
.page.cover { page-break-after: always; break-after: page; min-height: 240mm; }
.cover-inner {
  border: 2px solid #1f4d3a;
  padding: 22mm 14mm;
  min-height: 240mm;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: linear-gradient(180deg, #f7faf8 0%, #ffffff 40%);
}
.brand { text-align: center; }
.logo { max-height: 64px; max-width: 180px; object-fit: contain; }
.logo-fb {
  display: inline-block; padding: 10px 18px; background: #1f4d3a; color: #fff;
  font-weight: 700; border-radius: 8px;
}
.office { margin-top: 8px; font-weight: 700; color: #1f4d3a; font-size: 12pt; }
.cover-title { text-align: center; margin-top: 10px; }
.kind { color: #3d6b55; font-weight: 700; letter-spacing: 0.02em; }
.cover-title h1 { margin: 8px 0; font-size: 18pt; line-height: 1.4; color: #0f291f; }
.subtype {
  display: inline-block; margin-top: 6px; padding: 6px 14px;
  border: 1px solid #1f4d3a; color: #1f4d3a; font-weight: 700; border-radius: 999px;
  font-size: 12pt;
}
.meta { width: 100%; border-collapse: collapse; margin-top: 18px; }
.meta td { border: 1px solid #c5d5cc; padding: 8px 10px; vertical-align: top; }
.meta td:first-child { width: 34%; background: #eef5f0; font-weight: 700; }
.cover-foot { margin-top: auto; text-align: center; color: #5a6f64; font-size: 10pt; }
.core { /* continuous flow — no forced page-break per section */ }
.toc-block { margin: 0 0 18px; padding-bottom: 12px; border-bottom: 1px solid #d5e3db; }
.toc-row { display: flex; align-items: baseline; gap: 8px; margin: 4px 0; }
.toc-n { font-weight: 700; color: #1f4d3a; min-width: 1.5rem; }
.toc-t { flex: 0 1 auto; }
.toc-dots { flex: 1; border-bottom: 1px dotted #9bb0a4; margin: 0 6px; transform: translateY(-4px); }
.toc-att { margin-top: 10px; color: #3d6b55; font-size: 10.5pt; }
.chapter { margin: 0 0 14px; }
.ch-title {
  font-size: 14pt; color: #0f291f; margin: 0 0 10px;
  padding-bottom: 4px; border-bottom: 2px solid #1f4d3a;
}
.ch-n { color: #1f4d3a; }
.h2 { font-size: 12.5pt; color: #1f4d3a; margin: 14px 0 8px; }
.h3 { font-size: 11.5pt; color: #2a5642; margin: 12px 0 6px; }
.p { margin: 0 0 8px; text-align: justify; }
.ul, .ol { margin: 0 0 10px; padding-inline-start: 22px; }
.ul li, .ol li { margin: 3px 0; }
.note {
  background: #fff8e8; border: 1px solid #e6d3a1; border-radius: 8px;
  padding: 8px 10px; margin: 8px 0 12px; font-size: 10.5pt;
}
.tbl { margin: 8px 0 14px; }
.tbl-cap { font-weight: 700; color: #1f4d3a; margin-bottom: 4px; font-size: 10.5pt; }
table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
th, td { border: 1px solid #c5d5cc; padding: 6px 8px; vertical-align: top; }
th { background: #e7f1eb; color: #0f291f; font-weight: 700; }
.keep, .keep-next { break-inside: avoid; page-break-inside: avoid; }
.attachments-section {
  page-break-before: always;
  break-before: page;
  margin-top: 8px;
}
.att-h {
  font-size: 16pt; color: #1f4d3a; border-bottom: 3px solid #1f4d3a;
  padding-bottom: 6px; margin: 0 0 12px;
}
.att-item { margin: 0 0 16px; break-inside: avoid; page-break-inside: avoid; }
.att-card {
  border: 1px solid #c5d5cc; border-radius: 10px; padding: 12px 14px; background: #f7faf8;
}
.att-title { font-weight: 700; color: #0f291f; }
.att-file { color: #4a6357; font-size: 10pt; margin-top: 4px; }
.att-note { margin-top: 6px; font-size: 10.5pt; }
.att-fig { margin: 0; }
.att-fig img { max-width: 100%; max-height: 220mm; object-fit: contain; border: 1px solid #c5d5cc; }
.att-fig figcaption { margin-top: 6px; font-size: 10pt; color: #3d6b55; text-align: center; }
@media print {
  .page.cover { page-break-after: always; }
  .attachments-section { page-break-before: always; }
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
    <div class="core">
      ${renderToc(doc)}
      ${renderChapters(doc)}
    </div>
    ${renderAttachments(doc.attachments)}
  </div>
</body>
</html>`;
}
