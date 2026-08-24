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
      return `<section class="official-table-wrap keep"><div class="official-table-caption">${text(locale === 'ar' ? `[ ${block.caption} ]` : `[ ${block.caption} ]`)}</div><table class="official-table"><thead><tr>${block.headers.map((header) => `<th>${text(header)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${text(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
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
      <div class="official-cover-divider"></div>
      <table class="official-cover-project"><tbody><tr><th>المشروع:</th></tr><tr><td>${text(doc.project_name)}</td></tr></tbody></table>
      <div class="official-cover-divider"></div>
      <div class="official-cover-title"><div>تقرير فني في أنظمة السلامة والوقاية من الحريق</div><h1>${text(doc.title_ar)}</h1><p>المالك: ${text(reportValue(doc.owner_name))}</p></div>
      ${projectImage}
      <div class="official-cover-divider official-cover-divider-bottom"></div>
      <table class="official-cover-metadata"><tbody>
        <tr><th>التاريخ</th><td>${text(reportValue(doc.report_date))}</td></tr>
        <tr><th>رقم التقرير</th><td>${text(reportValue(doc.report_number))}</td></tr>
        <tr><th>النسخة</th><td>01</td></tr>
        <tr><th>الجهة الاستشارية</th><td>${text(companyName)}</td></tr>
      </tbody></table>
    </div>
  </section>`;
}

function toc(
  doc: EngineeringStudyDocument,
  company: CompanyProfile,
  chapters: { id: string; title: string; displayNo: number }[],
  pageMap: Record<string, number>
): string {
  const companyName = company.legal_name || company.name || 'توقع سلامة للاستشارات';
  const rows = chapters.map((chapter) => {
    const label = chapter.title.replace(/^\d+(?:\.\d+)?\.\s*/, '');
    return `<div class="official-toc-row"><em>${chapter.displayNo}.</em><span>${text(label)}</span><i></i><b>${pageMap[chapter.id] || '—'}</b></div>`;
  }).join('');
  return `<section class="official-toc-page"><div class="official-page-brand"><span>${esc(companyName)}</span><strong>${text(doc.title_ar)}</strong><span>${text(doc.project_name)}</span></div><div class="official-page-rules"></div><h1>المحتويات</h1><div class="official-toc">${rows}</div></section>`;
}

function approvals(company: CompanyProfile): string {
  const office = company.legal_name || company.name || '—';
  return `<section class="official-approvals keep"><h2 class="official-chapter">الاعتماد والتوقيعات</h2><p class="official-paragraph">يُستكمل اعتماد التقرير وفق الصلاحيات المعتمدة للمكتب والاستشاري المسؤول.</p><div class="official-signature-grid"><div class="official-signature-box"><strong>المهندس المُعد</strong><span>الاسم: ........................................</span><span>التوقيع: .....................................</span><span>التاريخ: ......................................</span></div><div class="official-stamp">${company.stamp_url ? `<img src="${esc(company.stamp_url)}" alt="" />` : `<span>${esc(company.stamp_text || 'ختم المكتب')}</span>`}</div><div class="official-signature-box"><strong>اعتماد المكتب</strong><span>الجهة: ${text(office)}</span><span>التوقيع / الختم: ............................</span><span>التاريخ: ......................................</span></div></div></section>`;
}

function css(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const escapeMarginText = (value: string) => value.replace(/["\\]/g, '\\$&');
  const reportNo = escapeMarginText(reportValue(doc.report_number));
  const reportDate = escapeMarginText(reportValue(doc.report_date));
  const companyName = escapeMarginText(company.legal_name || company.name || 'توقع سلامة للاستشارات');
  const reportTitle = escapeMarginText(doc.title_ar);
  const projectName = escapeMarginText(doc.project_name);
  const ownerName = escapeMarginText(reportValue(doc.owner_name, doc.project_name));
  return `${getEmbeddedArabicFontCss()}
  @page { size:A4 portrait; margin:35mm 15mm 25mm 15mm; @top-left { content:"${companyName}"; border-bottom:.75pt solid #b32020; padding-bottom:4mm; font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8pt; font-weight:700; color:#171717; } @top-center { content:"${reportTitle} — ${projectName}"; border-bottom:.75pt solid #b32020; padding-bottom:4mm; font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8.5pt; font-weight:700; color:#171717; } @top-right { content:"المالك: ${ownerName}"; border-bottom:.75pt solid #b32020; padding-bottom:4mm; font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8pt; font-weight:700; color:#171717; } @bottom-center { content:"رقم الصفحة: " counter(page) " من " counter(pages) "  |  تاريخ التقرير: ${reportDate}  |  النسخة: 01  |  رقم التقرير: ${reportNo}"; border-top:.5pt solid #555; padding-top:2mm; font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8pt; color:#171717; } }
  @page :first { margin:12mm; @top-left { content:none; } @top-center { content:none; } @top-right { content:none; } @bottom-center { content:none; } }
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; width:210mm; background:#f7f7f7; }
  body { color:#151515; font-family:"Noto Naskh Arabic","IBM Plex Sans Arabic",Tahoma,Arial,sans-serif; font-size:11.2px; line-height:1.85; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-variant-ligatures:common-ligatures; font-feature-settings:"liga" 1,"calt" 1; }
  .official-cover { position:relative; z-index:30; min-height:273mm; padding:0; page-break-after:always; break-after:page; display:flex; background:#efd09c; }
  .official-cover-frame { flex:1; display:flex; flex-direction:column; min-height:249mm; margin:0; padding:13mm 14mm 11mm; text-align:center; }
  .official-cover-company { width:92mm; min-height:39mm; background:#fff; display:flex; gap:9px; justify-content:flex-start; align-items:center; padding:4mm; text-align:start; }
  .official-cover-logo { width:52mm; height:29mm; object-fit:contain; object-position:center; }
  .official-cover-logo-fallback { width:29mm; height:29mm; border:1.5px solid #8f6f2e; display:flex; align-items:center; justify-content:center; font-weight:800; color:#674a13; }
  .official-cover-company-name { color:#202020; font-weight:800; font-size:14px; }
  .official-cover-tagline { color:#555; font-size:8.5px; max-width:45mm; line-height:1.45; }
  .official-cover-divider { width:100%; border-top:1.2mm solid #36302b; margin:5mm 0; }
  .official-cover-divider-bottom { margin-top:auto; }
  .official-cover-project { width:100%; border-collapse:collapse; direction:rtl; margin:0; font-size:15px; }
  .official-cover-project th { display:block; width:100%; padding:0 8mm 3mm; text-align:right; font-size:16px; }
  .official-cover-project td { display:block; width:72%; padding:0; margin:0 auto; overflow-wrap:anywhere; text-align:center; font-weight:800; }
  .official-cover-title { margin:7mm 0 6mm; }
  .official-cover-title > div { color:#171717; font-weight:800; font-size:15px; }
  .official-cover-title h1 { margin:3mm 0; color:#171717; font-size:20px; line-height:1.45; }
  .official-cover-title p { margin:3mm 0 0; font-size:14px; font-weight:800; }
  .official-cover-image { margin:0 auto 6mm; width:100%; max-width:160mm; border:1px solid #2e2a26; background:#fff; }
  .official-cover-image img { display:block; width:100%; max-height:68mm; object-fit:contain; }
  .official-cover-image figcaption { padding:3px 6px; color:#aa1717; font-size:9px; font-weight:700; border-top:1px solid #2e2a26; }
  .official-cover-metadata { width:58%; margin-left:auto; border-collapse:collapse; font-size:10px; }
  .official-cover-metadata th, .official-cover-metadata td { border:0; padding:1.2mm 2mm; text-align:start; }
  .official-cover-metadata th { width:36%; color:#171717; font-weight:800; }
  .official-toc-page { min-height:0; padding:0; page-break-after:always; break-after:page; }
  .official-page-brand { display:grid; grid-template-columns:1fr 1.5fr 1fr; align-items:center; min-height:20mm; font-size:8.5px; font-weight:800; }
  .official-page-brand span:first-child { text-align:start; }
  .official-page-brand strong { text-align:center; font-size:10px; }
  .official-page-brand span:last-child { text-align:end; }
  .official-page-rules { height:2.1mm; border-top:.75mm solid #b32020; border-bottom:.6mm solid #2d2925; }
  .official-toc-page h1 { text-align:center; color:#8f1b1b; font-size:19px; margin:16mm 0 9mm; }
  .official-toc-row { display:flex; align-items:baseline; gap:4px; margin:4px 0; }
  .official-toc-row em { min-width:10mm; font-weight:800; font-style:normal; text-align:end; }
  .official-toc-row span { font-weight:700; }
  .official-toc-row i { flex:1; border-bottom:1px dotted #414141; transform:translateY(-3px); }
  .official-toc-row b { min-width:10mm; text-align:start; color:#171717; }
  .official-document { width:100%; }
  .official-section { margin:0; padding:0; }
  .official-chapter { color:#161616; font-size:14px; font-weight:800; padding-bottom:1mm; margin:10px 0 7px; border-bottom:0; text-align:start; }
  .official-subchapter { color:#171717; font-size:12.5px; font-weight:800; margin:9px 0 4px; text-align:start; }
  .official-paragraph { margin:0 0 7px; text-align:justify; }
  .official-list { margin:2px 0 8px; padding-inline-start:22px; }
  .official-list li { margin:0 0 4px; page-break-inside:avoid; break-inside:avoid; }
  .official-table-wrap { margin:5px 0 10px; }
  .official-table-caption { color:#171717; font-weight:800; font-size:10px; margin-bottom:3px; text-align:start; }
  .official-table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:10px; }
  .official-table thead { display:table-header-group; }
  .official-table tr { page-break-inside:avoid; break-inside:avoid; }
  .official-table th, .official-table td { border:1px solid #555; padding:4px 5px; overflow-wrap:anywhere; vertical-align:middle; text-align:center; }
  .official-table th { background:#c8c8c8; color:#181818; font-weight:800; }
  .official-reference { margin:5px 0 8px; padding:5px 8px; border-inline-start:2px solid #5f5a55; background:#efefef; font-size:9.5px; }
  .official-reference strong { display:block; color:#171717; margin-bottom:2px; }
  .official-figure, .official-figure-row { page-break-inside:avoid; break-inside:avoid; }
  .official-figure { margin:5px 0 9px; }
  .official-figure-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0; align-items:start; margin:5px 0 9px; border:1px solid #444; }
  .official-figure-row .official-figure { margin:0; min-width:0; padding:3mm; border-inline-start:1px solid #444; }
  .official-figure-row .official-figure:last-child { border-inline-start:0; }
  .official-figure-media { width:fit-content; max-width:100%; margin-inline:auto; border:1px solid #444; background:#fff; display:flex; justify-content:center; }
  .official-figure-media img { display:block; max-width:100%; width:auto; height:auto; object-fit:contain; }
  .official-figure-double .official-figure-media img { max-height:72mm; }
  .official-figure-single .official-figure-media img { max-height:105mm; }
  .official-figure-full_width .official-figure-media, .official-figure-map .official-figure-media, .official-figure-code .official-figure-media { width:100%; }
  .official-figure-full_width .official-figure-media img { max-height:118mm; }
  .official-figure-code .official-figure-media img { max-height:128mm; }
  .official-figure figcaption { color:#bd1f1f; font-size:10px; font-weight:700; text-align:center; margin-top:3px; }
  .official-figure-note { color:#444; font-size:9px; text-align:center; margin:2px 0 0; }
  .official-code-sequence { margin:0; }
  .official-unit { margin:0 0 7px; }
  .appendix-start { break-before:page; page-break-before:always; }
  .official-approvals { margin-top:12px; padding-top:8px; border-top:1px solid #555; break-before:page; page-break-before:always; }
  .official-signature-grid { display:grid; grid-template-columns:1fr auto 1fr; gap:12px; align-items:start; margin-top:14px; }
  .official-signature-box { min-height:42mm; border:1px solid #555; padding:9px; display:flex; flex-direction:column; gap:8px; }
  .official-signature-box strong { color:#171717; }
  .official-stamp { width:80px; height:80px; border:1px dashed #555; display:flex; align-items:center; justify-content:center; text-align:center; color:#171717; padding:5px; margin-top:8px; overflow:hidden; font-weight:700; font-size:9px; }
  .official-stamp img { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; }
  .keep, .official-table-wrap, .official-figure, .official-signature-box { page-break-inside:avoid; break-inside:avoid; }
  .keep-next { page-break-after:avoid; break-after:avoid-page; }
  @media screen { .official-cover,.official-toc-page,.official-document { box-shadow:0 0 0 1px #d4d4d4; } }
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
  return `<!DOCTYPE html><html lang="${doc.locale}" dir="${doc.locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"/><title>${esc(doc.title_ar)} — ${esc(doc.project_name)}</title><style>${css(doc, company)}</style></head><body>${cover(doc, company)}${toc(doc, company, chapters, pageMap)}<main class="official-document">${body}${approvals(company)}</main></body></html>`;
}
