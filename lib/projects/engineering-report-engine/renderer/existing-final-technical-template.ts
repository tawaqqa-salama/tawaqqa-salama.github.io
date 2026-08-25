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

function isLtrEngineeringValue(value: string): boolean {
  return !/[\u0600-\u06ff]/.test(value) && /[A-Za-z0-9]/.test(value);
}

function renderEngineeringTokens(value: string): string {
  const escaped = text(value);
  return escaped.replace(/((?:\d+(?:\.\d+)?\s*(?:GPM|bar|m³|L\/min|min|K80|UL)|\b(?:FDC|NFPA|Standpipe)\b)(?:\s*[•·/]\s*(?:\d+(?:\.\d+)?\s*(?:GPM|bar|m³|L\/min|min|K80|UL)|\b(?:FDC|NFPA|Standpipe)\b))*)/g, '<bdi dir="ltr" class="official-engineering-run">$1</bdi>');
}

function renderTableCell(value: string, tag: 'th' | 'td', className = ''): string {
  const direction = isLtrEngineeringValue(value) ? 'ltr' : 'auto';
  const classAttr = className ? ` class="${className}"` : '';
  const content = direction === 'ltr' ? text(value) : renderEngineeringTokens(value);
  return `<${tag}${classAttr}><bdi dir="${direction}" class="official-cell-text">${content}</bdi></${tag}>`;
}

function renderBlock(block: FlowBlock, locale: 'ar' | 'en'): string {
  switch (block.kind) {
    case 'chapter':
      return `<section class="official-section official-section-heading ${block.id.includes('evidence') ? 'appendix-start' : ''}" id="sec-${esc(block.id)}"><h2 class="official-chapter">${text(block.title)}</h2></section>`;
    case 'subsection':
      return `<h3 class="official-subchapter keep-next">${text(block.title)}</h3>`;
    case 'paragraph':
      return `<p class="official-paragraph">${text(block.text)}</p>`;
    case 'bullet_list':
      return `<ol class="official-list">${block.items.map((item) => `<li>${text(item)}</li>`).join('')}</ol>`;
    case 'reference_note':
      return `<aside class="official-reference keep"><strong>${locale === 'ar' ? `المراجع (${block.referenceNo})` : `References (${block.referenceNo})`}</strong><div>${block.refs.map(text).join('<br/>')}</div></aside>`;
    case 'table': {
      const isSummary = block.caption.includes('ملخص حالات');
      if (isSummary) {
        return `<section class="official-summary-block"><div class="official-table-caption">${text(`[ ${block.caption} ]`)}</div><div class="official-summary-metrics">${block.rows.map(([label, value]) => `<div class="official-summary-metric"><span>${text(label)}</span><strong dir="ltr">${text(value)}</strong></div>`).join('')}</div></section>`;
      }
      const isEngineering = ['مقاييس الإخلاء', 'إمداد مياه الإطفاء والخزان', 'مضخات الحريق', 'نظام الرش الآلي', 'نظام إنذار وكشف الحريق'].some((label) => block.caption.includes(label));
      const tableClass = isEngineering ? ' official-engineering-sheet' : '';
      const rows = block.rows.map((row) => {
        const isStatus = row[0] === 'حالة المطابقة';
        return `<tr class="${isStatus ? 'official-status-row' : ''}">${row.map((cell, index) => renderTableCell(cell, 'td', isStatus && index === 1 ? 'official-status-cell' : '')).join('')}</tr>`;
      }).join('');
      return `<section class="official-table-wrap${tableClass}"><div class="official-table-caption">${text(locale === 'ar' ? `[ ${block.caption} ]` : `[ ${block.caption} ]`)}</div><table class="official-table"><thead><tr>${block.headers.map((header) => renderTableCell(header, 'th')).join('')}</tr></thead><tbody>${rows}</tbody></table></section>`;
    }
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

function coverLocation(doc: EngineeringStudyDocument): string {
  const projectDescription = doc.sections.find((section) => section.id === 'project_description');
  const rows = projectDescription?.tables?.flatMap((table) => table.rows) || [];
  const lookup = (label: string) => rows.find(([key]) => key === label)?.[1]?.trim() || '';
  return [lookup('المدينة'), lookup('الحي'), lookup('الشارع')].filter(Boolean).join(' — ') || '—';
}

function cover(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const companyName = company.legal_name || company.name || 'توقع سلامة للاستشارات';
  const logo = company.logo_url
    ? `<img class="official-cover-logo" src="${esc(company.logo_url)}" alt="" />`
    : `<div class="official-cover-logo-fallback">توقع</div>`;
  const location = coverLocation(doc);
  return `<section class="official-cover">
    <div class="official-cover-grid" aria-hidden="true"></div>
    <div class="official-cover-orbit official-cover-orbit-a" aria-hidden="true"></div>
    <div class="official-cover-orbit official-cover-orbit-b" aria-hidden="true"></div>
    <div class="official-cover-frame">
      <header class="official-cover-company">${logo}<div><div class="official-cover-company-name">${esc(companyName)}</div><div class="official-cover-tagline">${esc(company.tagline || 'منصة توقع لإدارة السلامة والوقاية من الحريق')}</div></div></header>
      <main class="official-cover-content">
        <div class="official-cover-eyebrow">TECHNICAL REPORT · FIRE & LIFE SAFETY</div>
        <h1>${text(doc.title_ar)}</h1>
        <p class="official-cover-subtitle">تقييم فني للموقع القائم — السلامة والوقاية من الحريق</p>
        <div class="official-cover-accent-line"></div>
        <table class="official-cover-project"><tbody>
          <tr><th>اسم المشروع</th><td>${text(doc.project_name)}</td></tr>
          <tr><th>المالك</th><td>${text(reportValue(doc.owner_name))}</td></tr>
          <tr><th>الموقع</th><td>${text(location)}</td></tr>
        </tbody></table>
      </main>
      <footer class="official-cover-metadata"><div><span>رقم التقرير</span><strong>${text(reportValue(doc.report_number))}</strong></div><div><span>التاريخ</span><strong>${text(reportValue(doc.report_date))}</strong></div><div><span>الإصدار</span><strong>01</strong></div></footer>
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
  const tocChapters = [...chapters, { id: 'approvals', title: '9. الاعتماد والتوقيعات', displayNo: 9 }];
  const rows = tocChapters.map((chapter) => {
    const label = chapter.title.replace(/^\d+(?:\.\d+)?\.\s*/, '');
    return `<div class="official-toc-row"><em>${String(chapter.displayNo).padStart(2, '0')}</em><span>${text(label)}</span><i></i><b>${pageMap[chapter.id] || '—'}</b></div>`;
  }).join('');
  return `<section class="official-toc-page"><div class="official-page-brand"><span>${esc(companyName)}</span><strong>${text(doc.title_ar)}</strong><span>${text(doc.project_name)}</span></div><div class="official-page-rules"></div><h1>المحتويات</h1><div class="official-toc">${rows}</div></section>`;
}

function approvals(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const office = doc.executive_director || company.legal_name || company.name || '—';
  const preparedBy = doc.prepared_by || '........................................';
  return `<section class="official-approvals keep"><h2 class="official-chapter">الاعتماد والتوقيعات</h2><div class="official-approval-meta"><span>رقم التقرير: <bdi dir="ltr">${text(reportValue(doc.report_number))}</bdi></span><span>التاريخ: <bdi dir="auto">${text(reportValue(doc.report_date))}</bdi></span><span>الجهة: ${text(office)}</span></div><p class="official-paragraph">يُستكمل اعتماد التقرير وفق الصلاحيات المعتمدة للمكتب والاستشاري المسؤول.</p><div class="official-signature-grid"><div class="official-signature-box"><strong>المهندس المُعد</strong><span>الاسم: ${text(preparedBy)}</span><span>التوقيع: .....................................</span><span>التاريخ: ......................................</span></div><div class="official-stamp">${company.stamp_url ? `<img src="${esc(company.stamp_url)}" alt="" />` : `<span>${esc(company.stamp_text || 'ختم المكتب')}</span>`}</div><div class="official-signature-box"><strong>اعتماد المكتب</strong><span>الجهة: ${text(office)}</span><span>التوقيع / الختم: ............................</span><span>التاريخ: ......................................</span></div><div class="official-approval-notes"><strong>ملاحظات الاعتماد</strong><span></span><span></span><span></span></div></div></section>`;
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
  @page { size:A4 portrait; margin:35mm 15mm 25mm 15mm; @top-left { content:"${companyName}"; border-bottom:.75pt solid #1b8f91; padding-bottom:4mm; font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8pt; font-weight:700; color:#171717; } @top-center { content:"${reportTitle} — ${projectName}"; border-bottom:.75pt solid #1b8f91; padding-bottom:4mm; font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8.5pt; font-weight:700; color:#171717; } @top-right { content:"المالك: ${ownerName}"; border-bottom:.75pt solid #1b8f91; padding-bottom:4mm; font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8pt; font-weight:700; color:#171717; } @bottom-center { content:"رقم الصفحة: " counter(page) " من " counter(pages) "  |  تاريخ التقرير: ${reportDate}  |  النسخة: 01  |  رقم التقرير: ${reportNo}"; border-top:.5pt solid #555; padding-top:2mm; font-family:"Noto Naskh Arabic",Tahoma,sans-serif; font-size:8pt; color:#171717; } }
  @page :first { margin:12mm; @top-left { content:none; } @top-center { content:none; } @top-right { content:none; } @bottom-center { content:none; } }
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; width:210mm; background:#f7f7f7; }
  body { color:#151515; font-family:"Noto Naskh Arabic","IBM Plex Sans Arabic",Tahoma,Arial,sans-serif; font-size:11.2px; line-height:1.85; letter-spacing:normal; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-variant-ligatures:common-ligatures; font-feature-settings:"liga" 1,"calt" 1; }
  .official-cover { position:relative; z-index:30; isolation:isolate; min-height:273mm; overflow:hidden; padding:0; page-break-after:always; break-after:page; display:flex; color:#eff8fb; background:linear-gradient(140deg,#081d35 0%,#0b2d4d 52%,#0b5a68 100%); }
  .official-cover::before { content:""; position:absolute; z-index:-1; inset:-30mm -16mm auto auto; width:160mm; height:160mm; border:1.1mm solid rgba(57,211,190,.32); border-radius:50%; box-shadow:0 0 0 15mm rgba(57,211,190,.045),0 0 0 31mm rgba(57,211,190,.035); }
  .official-cover::after { content:""; position:absolute; z-index:-1; left:-55mm; bottom:-27mm; width:150mm; height:105mm; transform:rotate(-24deg); background:linear-gradient(90deg,rgba(239,178,65,.76),rgba(239,178,65,.1)); clip-path:polygon(0 54%,100% 0,100% 30%,0 84%); }
  .official-cover-grid { position:absolute; z-index:-1; inset:0; opacity:.12; background-image:linear-gradient(rgba(227,248,251,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(227,248,251,.6) 1px,transparent 1px); background-size:12mm 12mm; mask-image:linear-gradient(140deg,black,transparent 75%); }
  .official-cover-orbit { position:absolute; z-index:-1; border:1px solid rgba(255,255,255,.2); border-radius:50%; }
  .official-cover-orbit-a { width:78mm; height:78mm; right:-19mm; top:51mm; }
  .official-cover-orbit-b { width:49mm; height:49mm; right:-3mm; top:68mm; border-color:rgba(239,178,65,.55); }
  .official-cover-frame { flex:1; display:flex; flex-direction:column; min-height:249mm; margin:0; padding:14mm 15mm 12mm; text-align:right; }
  .official-cover-company { display:grid; grid-template-columns:auto 1fr; gap:4mm; align-items:center; padding-bottom:7mm; border-bottom:1px solid rgba(239,248,251,.42); text-align:start; }
  .official-cover-logo { width:45mm; height:22mm; border-radius:2mm; background:#fff; padding:2mm; object-fit:contain; object-position:center; }
  .official-cover-logo-fallback { width:26mm; height:22mm; border:1px solid #44d8c4; border-radius:2mm; display:flex; align-items:center; justify-content:center; color:#44d8c4; font-size:10px; font-weight:800; }
  .official-cover-company-name { color:#fff; font-weight:800; font-size:13px; }
  .official-cover-tagline { max-width:55mm; margin-top:1mm; color:#b8d2dc; font-size:8.5px; line-height:1.45; }
  .official-cover-content { width:100%; max-width:132mm; margin:auto 0 0; padding:10mm 0 6mm; }
  .official-cover-eyebrow { color:#44d8c4; font-size:8px; font-weight:800; letter-spacing:0; }
  .official-cover-content h1 { margin:5mm 0 1mm; color:#fff; font-size:29px; line-height:1.2; font-weight:900; max-width:120mm; }
  .official-cover-subtitle { margin:0; color:#d4e6ea; font-size:16px; font-weight:700; }
  .official-cover-accent-line { width:44mm; height:1.5mm; margin:7mm 0 7mm; background:linear-gradient(90deg,#44d8c4 0 58%,#efb241 58% 100%); }
  .official-cover-project { width:100%; border-collapse:collapse; font-size:12px; background:rgba(2,17,31,.36); border:1px solid rgba(231,247,249,.26); }
  .official-cover-project th, .official-cover-project td { padding:3.1mm 4mm; border-bottom:1px solid rgba(231,247,249,.16); text-align:start; }
  .official-cover-project tr:last-child th, .official-cover-project tr:last-child td { border-bottom:0; }
  .official-cover-project th { width:30%; color:#44d8c4; font-weight:800; }
  .official-cover-project td { color:#fff; font-weight:700; overflow-wrap:anywhere; }
  .official-cover-metadata { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; margin-top:auto; padding-top:10mm; }
  .official-cover-metadata > div { min-height:18mm; padding:3mm 4mm; border:1px solid rgba(231,247,249,.35); background:rgba(3,19,35,.28); display:flex; flex-direction:column; gap:1mm; }
  .official-cover-metadata span { color:#9ec6d1; font-size:8.5px; font-weight:700; }
  .official-cover-metadata strong { color:#fff; font-size:10px; font-weight:800; }
  .official-toc-page { min-height:0; padding:0; page-break-after:always; break-after:page; }
  .official-page-brand { display:grid; grid-template-columns:1fr 1.5fr 1fr; align-items:center; min-height:20mm; font-size:8.5px; font-weight:800; }
  .official-page-brand span:first-child { text-align:start; }
  .official-page-brand strong { text-align:center; font-size:10px; }
  .official-page-brand span:last-child { text-align:end; }
  .official-page-rules { height:2.1mm; border-top:.75mm solid #1b8f91; border-bottom:.6mm solid #d2a33b; }
  .official-toc-page h1 { text-align:center; color:#123d4c; font-size:20px; margin:12mm 0 8mm; letter-spacing:.2px; }
  .official-toc { max-width:178mm; margin:4mm auto 0; padding:4mm 7mm; border-top:1px solid #b8c8ca; border-bottom:1px solid #b8c8ca; background:#fbfcfc; }
  .official-toc { font-size:10.2px; line-height:1.38; }
  .official-toc-row { display:flex; align-items:baseline; gap:4px; margin:3.5px 0; padding:1.2mm 0; break-inside:avoid; page-break-inside:avoid; }
  .official-toc-row em { min-width:12mm; color:#167b7f; font-weight:900; font-style:normal; text-align:end; letter-spacing:.6px; }
  .official-toc-row span { font-weight:700; }
  .official-toc-row i { flex:1; border-bottom:1px dotted #414141; transform:translateY(-3px); }
  .official-toc-row b { min-width:10mm; text-align:start; color:#123d4c; font-weight:800; }
  .official-document { width:100%; }
  .official-section { margin:0; padding:0; }
  .official-section-heading { break-after:avoid-page; page-break-after:avoid; margin:0; }
  .official-chapter { color:#123d4c; font-size:14px; font-weight:800; padding-bottom:1mm; margin:10px 0 7px; border-bottom:1px solid #1b8f91; text-align:start; break-after:avoid-page; page-break-after:avoid; }
  .official-section-heading + .official-paragraph, .official-section-heading + .official-table-wrap, .official-section-heading + .official-reference { break-before:avoid-page; page-break-before:avoid; }
  .official-subchapter { color:#171717; font-size:12.5px; font-weight:800; margin:9px 0 4px; text-align:start; }
  .official-paragraph { margin:0 0 7px; text-align:justify; }
  .official-list { margin:2px 0 8px; padding-inline-start:22px; }
  .official-list li { margin:0 0 4px; page-break-inside:avoid; break-inside:avoid; }
  .official-table-wrap { margin:4px 0 8px; break-inside:auto; page-break-inside:auto; }
  .official-table-caption { color:#123d4c; font-weight:800; font-size:10px; margin-bottom:3px; text-align:start; }
  .official-engineering-sheet { margin-top:5px; }
  .official-engineering-sheet .official-table-caption { color:#167b7f; font-size:10.5px; border-inline-start:2px solid #d2a33b; padding-inline-start:5px; }
  .official-engineering-sheet .official-table th { background:#f0f4f4; }
  .official-status-row td { background:#fcfdfd; }
  .official-status-cell { display:inline-block !important; width:auto; min-width:23mm; padding:.35mm 2mm; border:1px solid #8aa5a8; border-radius:999px; background:#f1f7f6; color:#123d4c; font-weight:900; text-align:center; }
  .official-status-row td:first-child { color:#123d4c; font-weight:800; }
  .official-engineering-run { direction:ltr; unicode-bidi:isolate; white-space:nowrap; display:inline-block; }
  .official-summary-block { margin:5px 0 10px; break-inside:avoid; page-break-inside:avoid; }
  .official-summary-metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:3mm; }
  .official-summary-metric { min-height:20mm; padding:2.5mm 2mm; border:1px solid #b8c8ca; border-top:1.5mm solid #1b8f91; background:#f4f8f8; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; }
  .official-summary-metric span { color:#23434a; font-size:8.5px; font-weight:800; line-height:1.35; }
  .official-summary-metric strong { color:#123d4c; font-size:17px; line-height:1; margin-top:2mm; font-variant-numeric:tabular-nums; }
  .official-table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:9.7px; direction:rtl; }
  .official-table thead { display:table-header-group; }
  .official-table tr { page-break-inside:avoid; break-inside:avoid; }
  .official-table th, .official-table td { border:1px solid #a8b4b7; padding:4px 5px; overflow-wrap:anywhere; word-break:normal; white-space:normal; min-width:0; vertical-align:top; text-align:right; direction:rtl; unicode-bidi:plaintext; line-height:1.5; }
  .official-table th:first-child, .official-table td:first-child { width:29%; }
  .official-cell-text { display:block; max-width:100%; overflow-wrap:anywhere; word-break:normal; white-space:normal; unicode-bidi:isolate; }
  .official-table th bdi, .official-table td bdi { display:block; max-width:100%; overflow-wrap:anywhere; word-break:normal; white-space:normal; unicode-bidi:isolate; }
  .official-table th { background:#e6f1f1; color:#123d4c; font-weight:800; }
  .official-reference { margin:5px 0 8px; padding:5px 8px; border-inline-start:2px solid #1b8f91; background:#f1f7f6; font-size:9.5px; }
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
  .official-figure figcaption { color:#167b7f; font-size:10px; font-weight:700; text-align:center; margin-top:3px; }
  .official-figure-note { color:#444; font-size:9px; text-align:center; margin:2px 0 0; }
  .official-code-sequence { margin:0; }
  .official-unit { margin:0 0 7px; }
  .appendix-start { break-before:page; page-break-before:always; }
  .official-approvals { margin-top:12px; padding-top:8px; border-top:1px solid #1b8f91; break-before:page; page-break-before:always; }
  .official-approval-meta { display:flex; flex-wrap:wrap; gap:4mm 8mm; margin:5mm 0 7mm; padding:3mm 4mm; border:1px solid #b8c8ca; background:#f4f8f8; color:#23434a; font-size:9.5px; }
  .official-approval-meta span { white-space:nowrap; }
  .official-signature-grid { display:grid; grid-template-columns:1fr auto 1fr; gap:12px; align-items:start; margin-top:14px; }
  .official-signature-box { min-height:58mm; border:1px solid #555; padding:9px; display:flex; flex-direction:column; gap:8px; }
  .official-signature-box strong { color:#171717; }
  .official-stamp { width:92px; height:92px; border:1px dashed #555; display:flex; align-items:center; justify-content:center; text-align:center; color:#171717; padding:5px; margin-top:8px; overflow:hidden; font-weight:700; font-size:9px; }
  .official-stamp img { max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; }
  .official-approval-notes { grid-column:1 / -1; min-height:34mm; margin-top:5mm; padding:3mm 4mm; border:1px solid #b8c8ca; background:#fafcfc; color:#23434a; display:flex; flex-direction:column; gap:4mm; }
  .official-approval-notes span { display:block; border-bottom:1px dotted #9aaeb1; height:5mm; }
  .keep, .official-figure, .official-signature-box, .official-summary-block { page-break-inside:avoid; break-inside:avoid; }
  .keep-next { page-break-after:avoid; break-after:avoid-page; }
  @media screen { .official-cover,.official-toc-page,.official-document { box-shadow:0 0 0 1px #d4d4d4; } }
  @media screen and (max-width:600px) { html, body { width:100%; max-width:100%; } .official-cover-frame { padding-inline:5mm; } .official-cover-content { max-width:100%; } .official-cover-content h1 { font-size:24px; } .official-cover-subtitle { font-size:13px; } .official-cover-project { font-size:10px; } .official-cover-project th,.official-cover-project td { padding:2.2mm 2.5mm; } .official-page-brand { grid-template-columns:1fr; gap:2mm; text-align:center; } .official-page-brand span:first-child,.official-page-brand span:last-child,.official-page-brand strong { text-align:center; } .official-table-wrap { width:100%; } .official-table { table-layout:auto; font-size:8px; } .official-table th,.official-table td { padding:2px 3px; overflow-wrap:anywhere; word-break:break-word; } .official-toc { font-size:9px; } }
  @media print { .official-cover,.official-toc-page,.official-document { margin:0; } }
  `;
}

export function buildExistingFinalTechnicalReportHtml(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
}): string {
  const { document: doc, company } = params;
  const { blocks, chapters } = documentToFlowBlocks(doc);
  const pageMap = estimateFlowTocPages(chapters, blocks);
  const body = blocks.map((block) => renderBlock(block, doc.locale)).join('\n');
  return `<!DOCTYPE html><html lang="${doc.locale}" dir="${doc.locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"/><title>${esc(doc.title_ar)} — ${esc(doc.project_name)}</title><style>${css(doc, company)}</style></head><body>${cover(doc, company)}${toc(doc, company, chapters, pageMap)}<main class="official-document">${body}${approvals(doc, company)}</main></body></html>`;
}
