import type { CompanyProfile } from '@/lib/company-profile';
import type { EngineeringStudyDocument } from '@/lib/projects/engineering-report-engine/types';
import { esc, formatReportTextHtml } from '@/lib/projects/engineering-report-engine/renderer/html-utils';
import { getEmbeddedArabicFontCss } from '@/lib/projects/engineering-report-engine/renderer/embedded-fonts';
import {
  documentToFlowBlocks,
  estimateFlowTocPages,
  type FlowBlock,
} from '@/lib/projects/engineering-report-engine/renderer/flow-document';

function text(value: string): string {
  return formatReportTextHtml(value);
}

function reportValue(value: string | undefined, fallback = '—'): string {
  return value && value.trim() ? value.trim() : fallback;
}

function renderBlock(block: FlowBlock, locale: 'ar' | 'en'): string {
  switch (block.kind) {
    case 'chapter':
      return `<section class="official-section ${block.id.includes('evidence') ? 'appendix-start' : ''}" id="sec-${esc(block.id)}"><h2 class="official-chapter keep-next">${text(block.title)}</h2></section>`;
    case 'subsection':
      return `<h3 class="official-subchapter keep-next">${text(block.title)}</h3>`;
    case 'paragraph':
      return `<p class="official-paragraph">${text(block.text)}</p>`;
    case 'bullet_list':
      return `<ol class="official-list">${block.items.map((item) => `<li>${text(item)}</li>`).join('')}</ol>`;
    case 'reference_note':
      return `<aside class="official-reference keep"><strong>${locale === 'ar' ? `المراجع (${block.referenceNo})` : `References (${block.referenceNo})`}</strong><div>${block.refs.map(text).join('<br/>')}</div></aside>`;
    case 'table':
      return `<section class="official-table-wrap keep"><div class="official-table-caption">${text(locale === 'ar' ? `جدول (${block.tableNo}): ${block.caption}` : `Table (${block.tableNo}): ${block.caption}`)}</div><table class="official-table"><thead><tr>${block.headers.map((header) => `<th>${text(header)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${text(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
    case 'figure':
      return `<figure class="official-figure official-figure-${esc(block.layout)} official-figure-${esc(block.variant)} keep"><div class="official-figure-media"><img src="${esc(block.src)}" alt="" /></div><figcaption>${text(block.caption)}</figcaption>${block.note ? `<p class="official-figure-note">${text(block.note)}</p>` : ''}</figure>`;
    case 'figure_row':
      return `<div class="official-figure-row">${block.figures.map((figure) => renderBlock(figure, locale)).join('')}</div>`;
    case 'code_sequence':
      return `<div class="official-code-sequence">${block.figures.map((figure) => renderBlock(figure, locale)).join('')}</div>`;
    case 'unit':
      return `<div class="official-unit keep">${block.blocks.map((child) => renderBlock(child, locale)).join('')}</div>`;
    default:
      return '';
  }
}

function cover(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const companyName = company.legal_name || company.name || 'توقع سلامة للاستشارات';
  const logo = company.logo_url
    ? `<img class="official-cover-logo" src="${esc(company.logo_url)}" alt="" />`
    : `<div class="official-cover-logo-fallback">${esc(company.name || 'توقع')}</div>`;
  const projectImage = doc.cover_image?.src
    ? `<figure class="official-cover-image"><img src="${esc(doc.cover_image.src)}" alt="" /><figcaption>${text(doc.cover_image.caption_ar)}</figcaption></figure>`
    : '';
  return `<section class="official-cover">
    <div class="official-cover-frame">
      <div class="official-cover-company">${logo}<div><div class="official-cover-company-name">${esc(companyName)}</div><div class="official-cover-tagline">${esc(company.tagline || 'للاستشارات الهندسية والسلامة والوقاية من الحريق')}</div></div></div>
      <div class="official-cover-title"><div>التقرير الفني</div><h1>${text(doc.title_ar)}</h1><p>${text(doc.project_name)}</p></div>
      ${projectImage}
      <table class="official-cover-metadata"><tbody>
        <tr><th>اسم المالك</th><td>${text(reportValue(doc.owner_name))}</td></tr>
        <tr><th>رقم التقرير</th><td>${text(reportValue(doc.report_number))}</td></tr>
        <tr><th>تاريخ التقرير</th><td>${text(reportValue(doc.report_date))}</td></tr>
        <tr><th>الجهة الاستشارية</th><td>${text(companyName)}</td></tr>
      </tbody></table>
    </div>
  </section>`;
}

function header(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const companyName = company.legal_name || company.name || 'توقع سلامة للاستشارات';
  const logo = company.logo_url ? `<img src="${esc(company.logo_url)}" alt="" />` : '';
  return `<header class="official-running-header"><div class="official-header-brand">${logo}<span>${esc(companyName)}</span></div><div class="official-header-title"><strong>${text(doc.title_ar)}</strong><span>${text(doc.project_name)}</span></div></header>`;
}

function toc(
  doc: EngineeringStudyDocument,
  company: CompanyProfile,
  chapters: { id: string; title: string; displayNo: number }[],
  pageMap: Record<string, number>
): string {
  const companyName = company.legal_name || company.name || 'توقع سلامة للاستشارات';
  const rows = chapters
    .filter((chapter) => chapter.id !== 'conclusion' || true)
    .map((chapter) => {
      const label = chapter.title.replace(/^\d+\.\s*/, '');
      return `<div class="official-toc-row"><span>${text(label)}</span><i></i><b>${pageMap[chapter.id] || '—'}</b></div>`;
    })
    .join('');
  return `<section class="official-toc-page"><div class="official-page-brand">${esc(companyName)}</div><h1>المحتويات</h1><div class="official-toc">${rows}</div></section>`;
}

function approvals(company: CompanyProfile): string {
  const office = company.legal_name || company.name || '—';
  return `<section class="official-approvals keep"><h2 class="official-chapter">الاعتماد والتوقيعات</h2><p class="official-paragraph">يُستكمل اعتماد التقرير وفق الصلاحيات المعتمدة للمكتب والاستشاري المسؤول.</p><div class="official-signature-grid"><div class="official-signature-box"><strong>المهندس المُعد</strong><span>الاسم: ........................................</span><span>التوقيع: .....................................</span><span>التاريخ: ......................................</span></div><div class="official-stamp">${company.stamp_url ? `<img src="${esc(company.stamp_url)}" alt="" />` : `<span>${esc(company.stamp_text || 'ختم المكتب')}</span>`}</div><div class="official-signature-box"><strong>اعتماد المكتب</strong><span>الجهة: ${text(office)}</span><span>التوقيع / الختم: ............................</span><span>التاريخ: ......................................</span></div></div></section>`;
}

function css(doc: EngineeringStudyDocument): string {
  const reportNo = reportValue(doc.report_number).replace(/"/g, '\\"');
  const reportDate = reportValue(doc.report_date).replace(/"/g, '\\"');
  return `${getEmbeddedArabicFontCss()}
  @page { size:A4 portrait; margin:25mm 15mm 20mm 15mm; @bottom-center { content:"${reportNo}  |  الإصدار: —  |  ${reportDate}  |  صفحة " counter(page) " من " counter(pages); font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8pt; color:#355e4f; } }
  @page :first { margin:12mm; @bottom-center { content:none; } }
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; width:210mm; background:#fff; }
  body { color:#1f2937; font-family:"Noto Naskh Arabic","IBM Plex Sans Arabic",Tahoma,Arial,sans-serif; font-size:11px; line-height:1.75; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-variant-ligatures:common-ligatures; font-feature-settings:"liga" 1,"calt" 1; }
  .official-cover { position:relative; z-index:30; min-height:273mm; padding:0; page-break-after:always; break-after:page; display:flex; background:#fff; }
  .official-cover-frame { flex:1; display:flex; flex-direction:column; min-height:249mm; border:1.5px solid #1f5945; padding:13mm 14mm; text-align:center; }
  .official-cover-company { display:flex; gap:10px; justify-content:center; align-items:center; text-align:start; }
  .official-cover-logo { width:62px; height:62px; object-fit:contain; }
  .official-cover-logo-fallback { width:62px; height:62px; border:2px solid #1f5945; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; color:#1f5945; }
  .official-cover-company-name { color:#1f5945; font-weight:800; font-size:14px; }
  .official-cover-tagline { color:#64748b; font-size:9.5px; max-width:115mm; }
  .official-cover-title { margin:auto 0 7mm; }
  .official-cover-title > div { color:#1f5945; font-weight:800; font-size:12px; }
  .official-cover-title h1 { margin:4px 0; color:#8e2346; font-size:21px; line-height:1.45; }
  .official-cover-title p { margin:5px 0 0; font-size:16px; font-weight:800; }
  .official-cover-image { margin:0 auto 7mm; width:100%; max-width:160mm; border:1px solid #cbd5e1; }
  .official-cover-image img { display:block; width:100%; max-height:84mm; object-fit:contain; }
  .official-cover-image figcaption { padding:3px 6px; color:#355e4f; font-size:9px; font-weight:700; border-top:1px solid #e2e8f0; }
  .official-cover-metadata { width:100%; border-collapse:collapse; margin-top:auto; font-size:11px; }
  .official-cover-metadata th, .official-cover-metadata td { border:1px solid #9ca3af; padding:5px 7px; text-align:start; }
  .official-cover-metadata th { width:36%; background:#e8f2ec; color:#1f5945; }
  .official-running-header { position:fixed; top:7mm; right:15mm; left:15mm; height:12mm; display:flex; justify-content:space-between; align-items:center; border-bottom:1.2px solid #1f5945; color:#1f5945; background:#fff; z-index:20; font-size:9px; }
  .official-header-brand { display:flex; align-items:center; gap:5px; font-weight:800; }
  .official-header-brand img { width:22px; height:22px; object-fit:contain; }
  .official-header-title { text-align:end; display:flex; flex-direction:column; line-height:1.25; }
  .official-header-title strong { font-size:10px; }
  .official-header-title span { color:#475569; max-width:86mm; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .official-toc-page { min-height:255mm; padding:0; page-break-after:always; break-after:page; }
  .official-page-brand { border-bottom:2px solid #1f5945; padding-bottom:5px; color:#1f5945; font-weight:800; font-size:10px; }
  .official-toc-page h1 { text-align:center; color:#8e2346; font-size:21px; margin:12mm 0 10mm; }
  .official-toc-row { display:flex; align-items:baseline; gap:7px; margin:5px 0; }
  .official-toc-row span { font-weight:700; }
  .official-toc-row i { flex:1; border-bottom:1px dotted #9ca3af; transform:translateY(-3px); }
  .official-toc-row b { color:#1f5945; min-width:10mm; text-align:end; }
  .official-document { width:100%; }
  .official-section { margin:0; padding:0; }
  .official-chapter { color:#1f5945; font-size:14px; font-weight:800; border-bottom:1px solid #cbd5e1; padding-bottom:3px; margin:10px 0 6px; }
  .official-chapter span { color:#8e2346; }
  .official-subchapter { color:#2f5b4c; font-size:12px; font-weight:800; margin:8px 0 3px; }
  .official-paragraph { margin:0 0 6px; text-align:justify; }
  .official-list { margin:2px 0 8px; padding-inline-start:22px; }
  .official-list li { margin:0 0 4px; page-break-inside:avoid; break-inside:avoid; }
  .official-table-wrap { margin:5px 0 9px; }
  .official-table-caption { color:#1f5945; font-weight:800; font-size:10.5px; margin-bottom:3px; }
  .official-table { width:100%; border-collapse:collapse; font-size:10px; }
  .official-table thead { display:table-header-group; }
  .official-table tr { page-break-inside:avoid; break-inside:avoid; }
  .official-table th, .official-table td { border:1px solid #718096; padding:4px 5px; vertical-align:top; text-align:start; }
  .official-table th { background:#e8f2ec; color:#1f5945; font-weight:800; }
  .official-reference { margin:5px 0 8px; padding:5px 8px; border-inline-start:3px solid #1f5945; background:#f3f7f4; font-size:9.5px; }
  .official-reference strong { display:block; color:#1f5945; margin-bottom:2px; }
  .official-figure, .official-figure-row { page-break-inside:avoid; break-inside:avoid; }
  .official-figure { margin:5px 0 9px; }
  .official-figure-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6mm; align-items:start; margin:5px 0 9px; }
  .official-figure-row .official-figure { margin:0; min-width:0; }
  .official-figure-media { width:fit-content; max-width:100%; margin-inline:auto; border:1px solid #94a3b8; background:#f8fafc; display:flex; justify-content:center; }
  .official-figure-media img { display:block; max-width:100%; width:auto; height:auto; object-fit:contain; }
  .official-figure-double .official-figure-media img { max-height:72mm; }
  .official-figure-single .official-figure-media img { max-height:105mm; }
  .official-figure-full_width .official-figure-media, .official-figure-map .official-figure-media, .official-figure-code .official-figure-media { width:100%; }
  .official-figure-full_width .official-figure-media img { max-height:118mm; }
  .official-figure-code .official-figure-media img { max-height:128mm; }
  .official-figure figcaption { color:#1f5945; font-size:10px; font-weight:700; text-align:center; margin-top:3px; }
  .official-figure-note { color:#475569; font-size:9px; text-align:center; margin:2px 0 0; }
  .official-code-sequence { margin:0; }
  .official-unit { margin:0 0 7px; }
  .appendix-start { break-before:page; page-break-before:always; }
  .official-approvals { margin-top:12px; padding-top:8px; border-top:1px solid #cbd5e1; break-before:page; page-break-before:always; }
  .official-signature-grid { display:grid; grid-template-columns:1fr auto 1fr; gap:12px; align-items:start; margin-top:14px; }
  .official-signature-box { min-height:42mm; border:1px solid #cbd5e1; padding:9px; display:flex; flex-direction:column; gap:8px; }
  .official-signature-box strong { color:#1f5945; }
  .official-stamp { width:80px; height:80px; border:1px dashed #1f5945; display:flex; align-items:center; justify-content:center; text-align:center; color:#1f5945; padding:5px; margin-top:8px; overflow:hidden; font-weight:700; font-size:9px; }
  .official-stamp img { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; }
  .keep, .official-table-wrap, .official-figure, .official-signature-box { page-break-inside:avoid; break-inside:avoid; }
  .keep-next { page-break-after:avoid; break-after:avoid-page; }
  @media screen { .official-cover,.official-toc-page,.official-document { box-shadow:0 0 0 1px #e2e8f0; } }
  @media print { .official-cover,.official-toc-page,.official-document { margin:0; } }
  `;
}

export function buildOfficialTechnicalReportHtml(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
}): string {
  const { document: doc, company } = params;
  const { blocks, chapters } = documentToFlowBlocks(doc);
  const pageMap = estimateFlowTocPages(chapters, blocks);
  const body = blocks.map((block) => renderBlock(block, doc.locale)).join('\n');
  return `<!DOCTYPE html><html lang="${doc.locale}" dir="${doc.locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"/><title>${esc(doc.title_ar)} — ${esc(doc.project_name)}</title><style>${css(doc)}</style></head><body>${cover(doc, company)}${header(doc, company)}${toc(doc, company, chapters, pageMap)}<main class="official-document">${body}${approvals(company)}</main></body></html>`;
}
