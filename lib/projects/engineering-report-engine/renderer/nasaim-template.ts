/**
 * Nasaim-style FLOW document renderer.
 * Continuous engineering study — sections are block groups, not pages.
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type { EngineeringStudyDocument } from '@/lib/projects/engineering-report-engine/types';
import { esc, formatReportTextHtml } from '@/lib/projects/engineering-report-engine/renderer/html-utils';
import { getEmbeddedArabicFontCss } from '@/lib/projects/engineering-report-engine/renderer/embedded-fonts';
import {
  documentToFlowBlocks,
  estimateFlowTocPages,
  type FlowBlock,
} from '@/lib/projects/engineering-report-engine/renderer/flow-document';

function tx(text: string): string {
  return formatReportTextHtml(text);
}

function renderBlock(block: FlowBlock, locale: 'ar' | 'en'): string {
  switch (block.kind) {
    case 'chapter':
      return `<h2 class="ch keep-next" id="sec-${esc(block.id)}"><span class="ch-bullet">•</span> ${tx(
        block.title
      )}</h2>`;
    case 'subsection':
      return `<h3 class="sub keep-next"><span class="sub-mark">❖</span> ${tx(block.title)}</h3>`;
    case 'paragraph':
      return `<p class="p ${block.incomplete ? 'p-miss' : ''}">${tx(block.text)}</p>`;
    case 'bullet_list':
      return `<ol class="recs">${block.items.map((i) => `<li>${tx(i)}</li>`).join('')}</ol>`;
    case 'reference_note': {
      const label = locale === 'ar' ? 'المراجع الكودية:' : 'Code references:';
      const lines = block.refs.map((r) => tx(r)).join('<br/>');
      return `<div class="refs keep"><div class="refs-lab">${label}</div><div class="refs-body">${lines}</div></div>`;
    }
    case 'table':
      return `<div class="tbl keep">
        <div class="tbl-cap">${tx(block.caption)}</div>
        <table>
          <thead><tr>${block.headers.map((h) => `<th>${tx(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${block.rows
              .map((row) => `<tr>${row.map((c) => `<td>${tx(c)}</td>`).join('')}</tr>`)
              .join('')}
          </tbody>
        </table>
      </div>`;
    case 'figure':
      return `<figure class="fig fig-${esc(block.layout)} keep" data-fig="${block.figureNo}">
        <div class="fig-box"><img src="${esc(block.src)}" alt="" /></div>
        <figcaption class="fig-cap">${tx(block.caption)}</figcaption>
      </figure>`;
    case 'unit':
      return `<div class="unit keep">${block.blocks.map((b) => renderBlock(b, locale)).join('\n')}</div>`;
    default:
      return '';
  }
}

function renderCover(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const lang = doc.locale;
  const brand = company.legal_name || company.name || 'منصة توقع سلامة';
  const title = lang === 'ar' ? doc.title_ar : doc.title_en;
  const photo = doc.cover_image?.src
    ? `<figure class="cover-fig">
         <img src="${esc(doc.cover_image.src)}" alt="" />
         <figcaption>${tx(
           lang === 'ar' ? doc.cover_image.caption_ar : doc.cover_image.caption_en
         )}</figcaption>
       </figure>`
    : '';

  return `
  <section class="page cover">
    <div class="cover-box">
      <div class="cover-brand">
        ${
          company.logo_url
            ? `<img class="logo" src="${esc(company.logo_url)}" alt="" />`
            : `<div class="logo-fb">${esc(company.name || 'توقع')}</div>`
        }
        <div class="office">${esc(brand)}</div>
        <div class="tag">${esc(
          company.tagline ||
            (lang === 'ar'
              ? 'للاستشارات الهندسية واستشارات السلامة والوقاية من الحريق'
              : 'Engineering & fire-safety consultancy')
        )}</div>
      </div>
      ${photo}
      <div class="cover-main">
        <div class="kind">${lang === 'ar' ? 'التقرير الفني' : 'Technical Report'}</div>
        <h1>${tx(title)}</h1>
        <div class="proj">${tx(doc.project_name)}</div>
      </div>
      <table class="cover-meta">
        <tr><td>${lang === 'ar' ? 'اسم المالك' : 'Owner'}</td><td>${tx(
          doc.owner_name || '—'
        )}</td></tr>
        <tr><td>${lang === 'ar' ? 'رقم التقرير' : 'Report No.'}</td><td>${tx(
          doc.report_number
        )}</td></tr>
        <tr><td>${lang === 'ar' ? 'التاريخ' : 'Date'}</td><td>${tx(doc.report_date)}</td></tr>
        <tr><td>${lang === 'ar' ? 'الجهة الاستشارية' : 'Consultant'}</td><td>${tx(brand)}</td></tr>
      </table>
    </div>
  </section>`;
}

function renderToc(
  doc: EngineeringStudyDocument,
  company: CompanyProfile,
  chapters: { id: string; title: string; displayNo: number }[],
  pageMap: Record<string, number>
): string {
  const lang = doc.locale;
  const brand = company.legal_name || company.name || '';
  const rows = chapters
    .map((ch) => {
      const page = pageMap[ch.id] ?? '—';
      const label = ch.title.replace(/^\d+\.\s*/, '');
      return `<div class="toc-row">
        <span class="toc-lab">• ${tx(label)}</span>
        <span class="toc-dots"></span>
        <span class="toc-pg">${page}</span>
      </div>`;
    })
    .join('');

  return `
  <section class="page toc-page">
    <div class="ph">${esc(brand)}</div>
    <h1 class="toc-h">${lang === 'ar' ? 'المحتويات' : 'Contents'}</h1>
    <div class="toc">${rows}</div>
  </section>`;
}

function renderApprovals(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const lang = doc.locale;
  return `
  <section class="approvals-page">
    <h2 class="ch"><span class="ch-bullet">•</span> ${
      lang === 'ar' ? 'الاعتماد والتوقيعات' : 'Approvals & Signatures'
    }</h2>
    <p class="p">${
      lang === 'ar'
        ? 'بعد استكمال مراجعة متطلبات السلامة والوقاية من الحريق للمنشأة محل الدراسة، يُعتمد هذا التقرير وفق الصلاحيات التالية، مع الالتزام بنتائج الدراسة والمخططات المعتمدة. لا تُدرج قيم هندسية غير موثّقة في ملف المشروع.'
        : 'After completing the fire-safety review for the facility under study, this report is approved under the following authorities. Undocumented engineering values are not introduced.'
    }</p>
    <div class="signs">
      <div class="sign-box">
        <div class="sl">${lang === 'ar' ? 'المهندس المعدّ' : 'Prepared by'}</div>
        <div class="ln">${lang === 'ar' ? 'الاسم: ............................' : 'Name: ............................'}</div>
        <div class="ln">${lang === 'ar' ? 'التوقيع: ............................' : 'Signature: ............................'}</div>
        <div class="ln">${lang === 'ar' ? 'التاريخ: ............................' : 'Date: ............................'}</div>
      </div>
      <div class="stamp">${esc(company.stamp_text || company.name)}</div>
      <div class="sign-box">
        <div class="sl">${lang === 'ar' ? 'اعتماد المكتب' : 'Office approval'}</div>
        <div class="ln">${lang === 'ar' ? 'الاسم / الجهة: ............................' : 'Name / office: ............................'}</div>
        <div class="ln">${lang === 'ar' ? 'التوقيع / الختم: ............................' : 'Signature / stamp: ............................'}</div>
        <div class="ln">${lang === 'ar' ? 'التاريخ: ............................' : 'Date: ............................'}</div>
      </div>
    </div>
  </section>`;
}

function flowCss(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const footerBrand = (company.name || 'منصة توقع سلامة').replace(/"/g, '\\"');
  // Footer: brand + page X of Y only — never project URL
  return `
    ${getEmbeddedArabicFontCss()}

    @page {
      size: A4 portrait;
      margin: 16mm 15mm 18mm 15mm;
      @bottom-center {
        content: "${footerBrand} — ${
          doc.locale === 'ar' ? 'للاستشارات الهندسية والسلامة' : 'Engineering & fire-safety consultancy'
        }    ${doc.locale === 'ar' ? 'صفحة' : 'Page'} " counter(page) " ${
          doc.locale === 'ar' ? 'من' : 'of'
        } " counter(pages);
        font-family: "Noto Naskh Arabic", Tahoma, sans-serif;
        font-size: 8pt;
        color: #334155;
      }
    }
    @page :first {
      margin: 12mm;
      @bottom-center { content: none; }
    }
    html, body {
      width: 210mm;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    body {
      font-family: "Noto Naskh Arabic", "IBM Plex Sans Arabic", Tahoma, Arial, sans-serif;
      color: #111827;
      font-size: 11.5px;
      line-height: 1.7;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      /* Full Arabic shaping via embedded Unicode font — do not disable ligatures */
      font-variant-ligatures: common-ligatures;
      font-feature-settings: "liga" 1, "calt" 1;
      text-rendering: optimizeLegibility;
    }
    /* Avoid dir=ltr / unicode-bidi isolates in mixed runs (breaks PDF text extract) */
    .ltr { direction: inherit; display: inline; unicode-bidi: normal; }

    .page {
      box-sizing: border-box;
      width: 210mm;
      min-height: 297mm;
      padding: 14mm 14mm 16mm;
      margin: 0 auto 8px;
      background: #fff;
      page-break-after: always;
      break-after: page;
    }
    .cover { display: flex; }
    .cover-box {
      flex: 1; border: 1.5px solid #1f4d3a; padding: 12mm 10mm;
      display: flex; flex-direction: column; justify-content: space-between; align-items: center;
      text-align: center; min-height: 265mm; box-sizing: border-box;
    }
    .cover-brand { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .logo { width: 72px; height: 72px; object-fit: contain; }
    .logo-fb {
      width: 72px; height: 72px; border: 2px solid #1f4d3a; border-radius: 50%;
      display:flex; align-items:center; justify-content:center; font-weight:800; color:#1f4d3a;
    }
    .office { font-weight: 800; color: #1f4d3a; font-size: 14px; }
    .tag { font-size: 10px; color: #64748b; max-width: 160mm; }
    .cover-fig { width: 100%; max-width: 165mm; margin: 6mm 0; border: 1px solid #cbd5e1; }
    .cover-fig img { display:block; width:100%; max-height: 95mm; object-fit: contain; background:#f8fafc; }
    .cover-fig figcaption { font-size: 10px; font-weight: 700; color:#1f4d3a; padding: 4px 8px; border-top:1px solid #e2e8f0; }
    .kind { font-size: 11px; font-weight: 800; color: #1f4d3a; margin-bottom: 4px; }
    .cover-main h1 { margin: 0; color: #9f1239; font-size: 20px; font-weight: 800; line-height: 1.4; max-width: 170mm; }
    .proj { margin-top: 8px; font-size: 16px; font-weight: 800; }
    .cover-meta { width: 100%; max-width: 150mm; border-collapse: collapse; font-size: 12px; margin-top: 8mm; }
    .cover-meta td { border-bottom: 1px solid #e2e8f0; padding: 6px 4px; text-align: start; }
    .cover-meta td:last-child { font-weight: 800; text-align: end; }

    .toc-page .ph { font-size: 11px; font-weight: 800; color: #1f4d3a; border-bottom: 2px solid #1f4d3a; padding-bottom: 6px; margin-bottom: 14px; }
    .toc-h { text-align: center; color: #9f1239; font-size: 20px; margin: 0 0 16px; }
    .toc-row { display: flex; align-items: baseline; gap: 8px; margin: 7px 0; font-size: 12px; }
    .toc-lab { font-weight: 650; max-width: 78%; }
    .toc-dots { flex: 1; border-bottom: 1px dotted #94a3b8; transform: translateY(-3px); }
    .toc-pg { font-weight: 800; color: #1f4d3a; }

    /* Continuous study body */
    .doc {
      box-sizing: border-box;
      width: 210mm;
      margin: 0 auto;
      padding: 12mm 14mm 16mm;
      background: #fff;
    }
    .ch {
      font-size: 13.5px; font-weight: 800; color: #1f4d3a;
      margin: 12px 0 6px; padding: 0;
    }
    .ch-bullet { color: #1f4d3a; margin-inline-end: 4px; }
    .sub {
      font-size: 12px; font-weight: 800; color: #111827;
      margin: 9px 0 3px;
    }
    .sub-mark { color: #1f4d3a; margin-inline-end: 4px; }
    .keep-next {
      page-break-after: avoid;
      break-after: avoid-page;
    }
    .ch.keep-next + .p,
    .sub.keep-next + .p,
    .sub.keep-next + .unit,
    .ch.keep-next + .unit {
      page-break-before: avoid;
      break-before: avoid-page;
    }
    .p {
      margin: 0 0 6px;
      text-align: justify;
      text-justify: inter-word;
    }
    .p-miss {
      color: #9f1239; font-weight: 700;
      border-inline-start: 3px solid #fda4af; padding-inline-start: 8px;
    }
    .recs {
      margin: 4px 0 10px;
      padding-inline-start: 22px;
    }
    .recs li {
      margin: 0 0 5px;
      text-align: justify;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .refs {
      margin: 6px 0 10px;
      padding: 6px 10px;
      background: #f1f5f4;
      border-inline-start: 3px solid #1f4d3a;
      font-size: 10.5px;
      color: #475569;
    }
    .refs-lab { font-weight: 800; color: #1f4d3a; margin-bottom: 2px; }
    .unit { margin: 0 0 8px; }
    .tbl { margin: 6px 0 10px; }
    .tbl-cap { font-weight: 800; font-size: 11px; color: #1f4d3a; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 1px solid #64748b; padding: 4px 6px; vertical-align: top; }
    th { background: #e8f2ec; color: #1f4d3a; font-weight: 800; }

    .fig { margin: 6px 0 10px; page-break-inside: avoid; break-inside: avoid; }
    .fig-box {
      border: 1px solid #94a3b8; background: #f8fafc;
      display: flex; align-items: center; justify-content: center;
    }
    .fig img {
      display: block; width: 100%; height: auto;
      max-height: 175mm; object-fit: contain; object-position: center;
    }
    .fig-full_width img { max-height: 200mm; }
    .fig-cap {
      text-align: center; font-size: 11px; font-weight: 700; color: #1f4d3a;
      margin-top: 4px;
      page-break-before: avoid;
      break-before: avoid-page;
    }
    .keep { page-break-inside: avoid; break-inside: avoid; }

    .approvals-page {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      page-break-before: always;
      break-before: page;
    }
    .signs {
      display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; margin-top: 18px; font-size: 11px;
      align-items: start;
    }
    .sign-box {
      border: 1px solid #cbd5e1;
      padding: 12px;
      min-height: 42mm;
    }
    .sl { font-weight: 800; margin-bottom: 10px; color: #1f4d3a; }
    .ln { margin-top: 14px; }
    .stamp {
      border: 1px dashed #1f4d3a; border-radius: 50%; width: 86px; height: 86px;
      display:flex; align-items:center; justify-content:center; text-align:center;
      margin: 12px auto 0; color:#1f4d3a; font-weight:800; font-size:10px; padding:6px;
    }

    @media screen {
      .doc, .page { box-shadow: 0 0 0 1px #e2e8f0; }
    }
    @media print {
      .page, .doc { margin: 0; box-shadow: none; }
      .doc { padding-top: 0; }
      .fig, .tbl, .unit.keep, .sign-box { page-break-inside: avoid; break-inside: avoid; }
    }
  `;
}

export function buildNasaimReportHtml(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
}): string {
  const { document: doc, company } = params;
  const dir = doc.locale === 'ar' ? 'rtl' : 'ltr';
  const lang = doc.locale;
  const title = lang === 'ar' ? doc.title_ar : doc.title_en;
  const { blocks, chapters } = documentToFlowBlocks(doc);
  const pageMap = estimateFlowTocPages(chapters, blocks);
  const bodyHtml = blocks.map((b) => renderBlock(b, lang)).join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — ${esc(doc.project_name)}</title>
  <style>${flowCss(doc, company)}</style>
</head>
<body>
  ${renderCover(doc, company)}
  ${renderToc(doc, company, chapters, pageMap)}
  <article class="doc" id="study-body">
    ${bodyHtml}
    ${renderApprovals(doc, company)}
  </article>
</body>
</html>`;
}
