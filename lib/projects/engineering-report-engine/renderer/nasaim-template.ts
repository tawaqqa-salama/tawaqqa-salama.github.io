/**
 * Nasaim-style FLOW document renderer.
 * Continuous engineering study (Word/InDesign style) — not section-per-page cards.
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type { EngineeringStudyDocument } from '@/lib/projects/engineering-report-engine/types';
import { esc, protectCodeTokens } from '@/lib/projects/engineering-report-engine/renderer/html-utils';
import {
  documentToFlowBlocks,
  estimateFlowTocPages,
  type FlowBlock,
} from '@/lib/projects/engineering-report-engine/renderer/flow-document';

function renderBlock(block: FlowBlock, locale: 'ar' | 'en'): string {
  switch (block.kind) {
    case 'chapter':
      return `<h2 class="ch" id="sec-${esc(block.id)}"><span class="ch-bullet">•</span> ${esc(
        block.title
      )}</h2>`;
    case 'subsection':
      return `<h3 class="sub"><span class="sub-mark">❖</span> ${esc(block.title)}</h3>`;
    case 'paragraph':
      return `<p class="p ${block.incomplete ? 'p-miss' : ''}">${esc(
        protectCodeTokens(block.text)
      )}</p>`;
    case 'table':
      return `<div class="tbl keep">
        <div class="tbl-cap">${esc(block.caption)}</div>
        <table>
          <thead><tr>${block.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${block.rows
              .map(
                (row) =>
                  `<tr>${row.map((c) => `<td>${esc(protectCodeTokens(c))}</td>`).join('')}</tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
    case 'figure':
      return `<figure class="fig fig-${esc(block.layout)} keep" data-fig="${block.figureNo}">
        <div class="fig-box"><img src="${esc(block.src)}" alt="${esc(block.caption)}" /></div>
        <figcaption class="fig-cap">${esc(block.caption)}</figcaption>
      </figure>`;
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
         <figcaption>${esc(
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
        <h1>${esc(title)}</h1>
        <div class="proj">${esc(doc.project_name)}</div>
      </div>
      <table class="cover-meta">
        <tr><td>${lang === 'ar' ? 'اسم المالك' : 'Owner'}</td><td>${esc(
          doc.owner_name || '—'
        )}</td></tr>
        <tr><td>${lang === 'ar' ? 'رقم التقرير' : 'Report No.'}</td><td>${esc(
          doc.report_number
        )}</td></tr>
        <tr><td>${lang === 'ar' ? 'التاريخ' : 'Date'}</td><td>${esc(doc.report_date)}</td></tr>
        <tr><td>${lang === 'ar' ? 'الجهة الاستشارية' : 'Consultant'}</td><td>${esc(brand)}</td></tr>
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
      // Display title without leading "N. " duplication in TOC bullet list style
      const label = ch.title.replace(/^\d+\.\s*/, '');
      return `<div class="toc-row">
        <span class="toc-lab">• ${esc(label)}</span>
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
    <div class="pf"><span>${esc(brand)}</span><span class="pn"></span></div>
  </section>`;
}

function renderApprovals(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const lang = doc.locale;
  const brand = company.legal_name || company.name || '';
  return `
  <section class="chapter-block approvals keep">
    <h2 class="ch"><span class="ch-bullet">•</span> ${
      lang === 'ar' ? 'الاعتماد والتوقيعات' : 'Approvals & Signatures'
    }</h2>
    <p class="p">${
      lang === 'ar'
        ? 'يُعتمد هذا التقرير بعد مراجعة المهندس المسؤول والمدير الفني، مع الالتزام بنتائج الدراسة والمخططات المعتمدة. لا تُدرج قيم هندسية غير موثّقة في ملف المشروع.'
        : 'This report is approved after review by the responsible engineer and technical manager. Undocumented engineering values are not introduced.'
    }</p>
    <div class="signs">
      <div><div class="sl">${lang === 'ar' ? 'المهندس المعدّ' : 'Prepared by'}</div><div class="ln">................</div></div>
      <div class="stamp">${esc(company.stamp_text || company.name)}</div>
      <div><div class="sl">${lang === 'ar' ? 'اعتماد المكتب' : 'Office approval'}</div><div class="ln">................</div></div>
    </div>
  </section>`;
}

function flowCss(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const brand = company.legal_name || company.name || 'منصة توقع سلامة';
  const titleShort =
    doc.locale === 'ar' ? 'تقرير فني — سلامة من الحريق' : 'Technical fire-safety report';
  return `
    @page {
      size: A4 portrait;
      margin: 18mm 16mm 18mm 16mm;
      @top-center {
        content: "${esc(brand).replace(/"/g, '\\"')} — ${esc(titleShort).replace(/"/g, '\\"')}";
        font-size: 8.5pt;
        color: #475569;
      }
      @bottom-center {
        content: "${esc(brand).replace(/"/g, '\\"')}    ${
          doc.locale === 'ar' ? 'صفحة' : 'Page'
        } " counter(page) " ${doc.locale === 'ar' ? 'من' : 'of'} " counter(pages);
        font-size: 8.5pt;
        color: #334155;
      }
    }
    @page :first {
      margin: 12mm;
      @top-center { content: none; }
      @bottom-center { content: none; }
    }
    html, body {
      width: 210mm;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    body {
      font-family: "Traditional Arabic","Tahoma","Segoe UI","Noto Naskh Arabic",Arial,sans-serif;
      color: #111827;
      font-size: 12px;
      line-height: 1.75;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
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
    .toc-row { display: flex; align-items: baseline; gap: 8px; margin: 9px 0; font-size: 12.5px; }
    .toc-lab { font-weight: 650; max-width: 78%; }
    .toc-dots { flex: 1; border-bottom: 1px dotted #94a3b8; transform: translateY(-3px); }
    .toc-pg { font-weight: 800; color: #1f4d3a; }
    .toc-page .pf { display:none; }

    /* ===== Continuous study body (FLOW) ===== */
    .doc {
      box-sizing: border-box;
      width: 210mm;
      margin: 0 auto;
      padding: 14mm 14mm 18mm;
      background: #fff;
    }
    .ch {
      font-size: 14.5px; font-weight: 800; color: #1f4d3a;
      margin: 14px 0 8px; padding: 0;
      page-break-after: avoid;
      break-after: avoid-page;
    }
    .ch-bullet { color: #1f4d3a; margin-inline-end: 4px; }
    .sub {
      font-size: 12.5px; font-weight: 800; color: #111827;
      margin: 10px 0 4px; page-break-after: avoid;
    }
    .sub-mark { color: #1f4d3a; margin-inline-end: 4px; }
    .p {
      margin: 0 0 7px; text-align: justify; text-justify: inter-word;
      unicode-bidi: plaintext;
    }
    .p-miss {
      color: #9f1239; font-weight: 700;
      border-inline-start: 3px solid #fda4af; padding-inline-start: 8px;
    }
    .tbl { margin: 8px 0 12px; }
    .tbl-cap { font-weight: 800; font-size: 11.5px; color: #1f4d3a; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 1px solid #64748b; padding: 4px 6px; vertical-align: top; }
    th { background: #e8f2ec; color: #1f4d3a; font-weight: 800; }

    .fig { margin: 8px 0 12px; page-break-inside: avoid; break-inside: avoid; }
    .fig-box {
      border: 1px solid #94a3b8; background: #f8fafc;
      display: flex; align-items: center; justify-content: center;
    }
    .fig img {
      display: block; width: 100%; height: auto;
      max-height: 160mm; object-fit: contain; object-position: center;
    }
    .fig-full_width img { max-height: 190mm; }
    .fig-cap {
      text-align: center; font-size: 11px; font-weight: 700; color: #1f4d3a;
      margin-top: 4px;
    }
    .keep { page-break-inside: avoid; break-inside: avoid; }
    .signs {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 22px; font-size: 11px;
    }
    .sl { font-weight: 700; }
    .ln { margin-top: 36px; }
    .stamp {
      border: 1px dashed #1f4d3a; border-radius: 50%; width: 86px; height: 86px;
      display:flex; align-items:center; justify-content:center; text-align:center;
      margin: 0 auto; color:#1f4d3a; font-weight:800; font-size:10px; padding:6px;
    }
    .approvals { margin-top: 18px; padding-top: 8px; border-top: 1px solid #cbd5e1; page-break-before: auto; }

    @media screen {
      .doc, .page { box-shadow: 0 0 0 1px #e2e8f0; }
    }
    @media print {
      .page, .doc { margin: 0; box-shadow: none; }
      .doc { padding-top: 0; }
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
