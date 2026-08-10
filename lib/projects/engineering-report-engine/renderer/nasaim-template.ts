/**
 * Nasaim-style consultancy report template (قاعة نسائم methodology).
 * Presentation only — consumes EngineeringStudyDocument from the data engine.
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type {
  EngineeringStudyDocument,
  EngineeringStudyImage,
  EngineeringStudySection,
} from '@/lib/projects/engineering-report-engine/types';
import { esc, protectCodeTokens } from '@/lib/projects/engineering-report-engine/renderer/html-utils';
import {
  buildDynamicTocPages,
  groupImageRows,
  placeSectionImages,
} from '@/lib/projects/engineering-report-engine/renderer/image-placement';

function sectionTitle(doc: EngineeringStudyDocument, s: EngineeringStudySection): string {
  return doc.locale === 'ar' ? s.title_ar : s.title_en;
}

function captionOf(doc: EngineeringStudyDocument, img: EngineeringStudyImage): string {
  return doc.locale === 'ar' ? img.caption_ar : img.caption_en;
}

function renderHeader(doc: EngineeringStudyDocument, company: CompanyProfile, metaRight: string): string {
  const brand = company.legal_name || company.name || 'منصة توقع سلامة';
  return `
    <header class="rh">
      <div class="rh-brand">
        ${company.logo_url ? `<img src="${esc(company.logo_url)}" alt="" />` : ''}
        <div>
          <div class="rh-name">${esc(brand)}</div>
          <div class="rh-sub">${esc(
            doc.locale === 'ar'
              ? 'للاستشارات الهندسية والسلامة'
              : 'Engineering & Fire Safety Consultancy'
          )}</div>
        </div>
      </div>
      <div class="rh-meta">
        <div>${esc(doc.locale === 'ar' ? doc.title_ar : doc.title_en)}</div>
        <div>${esc(doc.report_number)} · ${esc(doc.report_date)}</div>
        <div class="rh-meta-extra">${esc(metaRight)}</div>
      </div>
    </header>`;
}

function renderFooter(company: CompanyProfile, locale: 'ar' | 'en'): string {
  const brand = company.legal_name || company.name || '';
  const addr = [company.address, company.city, company.phone].filter(Boolean).join(' — ');
  return `
    <footer class="rf">
      <span class="rf-brand">${esc(brand)}${addr ? ` · ${esc(addr)}` : ''}</span>
      <span class="rf-page">${
        locale === 'ar' ? 'صفحة' : 'Page'
      } <span class="page-cur"></span> ${locale === 'ar' ? 'من' : 'of'} <span class="page-total"></span></span>
    </footer>`;
}

function renderImageFigure(
  doc: EngineeringStudyDocument,
  img: EngineeringStudyImage,
  sectionLabel: string
): string {
  const cap = captionOf(doc, img);
  const layout = img.layout_type || 'single';
  return `
    <figure class="fig fig-${esc(layout)}" data-image-id="${esc(img.image_id || '')}" data-order="${img.image_order || ''}">
      <div class="fig-frame">
        <img src="${esc(img.src)}" alt="${esc(cap)}" />
      </div>
      <figcaption class="fig-cap">
        <span class="fig-sec">${esc(sectionLabel)}</span>
        <span class="fig-text">${esc(cap)}</span>
      </figcaption>
    </figure>`;
}

function renderImageGallery(doc: EngineeringStudyDocument, section: EngineeringStudySection): string {
  const images = placeSectionImages(section);
  if (!images.length) return '';
  const sectionLabel = `${section.number - 2}. ${sectionTitle(doc, section)}`;
  const rows = groupImageRows(images);
  const blocks = rows
    .map((row) => {
      if (row.length === 2) {
        return `<div class="fig-row fig-row-double keep-together">
          ${row.map((img) => renderImageFigure(doc, img, sectionLabel)).join('')}
        </div>`;
      }
      const img = row[0];
      const cls =
        img.layout_type === 'full_width' ? 'fig-row fig-row-full keep-together' : 'fig-row fig-row-single keep-together';
      return `<div class="${cls}">${renderImageFigure(doc, img, sectionLabel)}</div>`;
    })
    .join('');

  return `
    <div class="gallery">
      <h3 class="gallery-title">${
        doc.locale === 'ar' ? 'الصور والوثائق المرفقة للقسم' : 'Section photographs & attachments'
      }</h3>
      ${blocks}
    </div>`;
}

function renderTables(doc: EngineeringStudyDocument, section: EngineeringStudySection): string {
  return (section.tables || [])
    .map((t) => {
      const caption = doc.locale === 'ar' ? t.caption_ar : t.caption_en;
      const headers = doc.locale === 'ar' ? t.headers_ar : t.headers_en;
      return `
        <div class="table-wrap keep-together">
          <div class="table-cap">${esc(caption)}</div>
          <table class="data">
            <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>
              ${t.rows
                .map(
                  (row) =>
                    `<tr>${row.map((c) => `<td>${esc(protectCodeTokens(c))}</td>`).join('')}</tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
    })
    .join('');
}

function renderParagraphs(doc: EngineeringStudyDocument, section: EngineeringStudySection): string {
  if (!section.paragraphs?.length) return '';
  const intro = section.paragraphs[0];
  const rest = section.paragraphs.slice(1);
  const introHtml = intro
    ? `<p class="para para-intro ${intro.incomplete ? 'incomplete' : ''}">${esc(
        protectCodeTokens(intro.text)
      )}</p>${
        intro.citations.length
          ? `<div class="cites">${esc(intro.citations.join(' · '))}</div>`
          : ''
      }`
    : '';
  const bodyHtml = rest
    .map((para) => {
      const cites = para.citations.length
        ? `<div class="cites">${esc(para.citations.join(' · '))}</div>`
        : '';
      return `<p class="para ${para.incomplete ? 'incomplete' : ''}">${esc(
        protectCodeTokens(para.text)
      )}</p>${cites}`;
    })
    .join('');
  return `${introHtml}${bodyHtml}`;
}

function renderSectionSheet(
  doc: EngineeringStudyDocument,
  company: CompanyProfile,
  section: EngineeringStudySection,
  displayNumber: number
): string {
  const title = sectionTitle(doc, section);
  // Fixed structure: title → intro/analysis text → tables → images (ordered) → no inventing
  return `
  <section class="sheet sheet-section" id="sec-${esc(section.id)}" data-section="${esc(section.id)}">
    ${renderHeader(doc, company, title)}
    <h2 class="sec-title">
      <span class="sec-no">${displayNumber}</span>
      <span class="sec-label">${esc(title)}</span>
    </h2>
    <div class="sec-body">
      ${renderParagraphs(doc, section)}
      ${renderTables(doc, section)}
      ${renderImageGallery(doc, section)}
    </div>
    ${renderFooter(company, doc.locale)}
  </section>`;
}

function renderCover(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const lang = doc.locale;
  const title = lang === 'ar' ? doc.title_ar : doc.title_en;
  const brand = company.legal_name || company.name || 'منصة توقع سلامة';
  const coverImg = doc.cover_image?.src
    ? `<figure class="cover-photo">
         <img src="${esc(doc.cover_image.src)}" alt="${esc(
           lang === 'ar' ? doc.cover_image.caption_ar : doc.cover_image.caption_en
         )}" />
         <figcaption>${esc(
           lang === 'ar' ? doc.cover_image.caption_ar : doc.cover_image.caption_en
         )}</figcaption>
       </figure>`
    : '';

  return `
  <section class="sheet sheet-cover" id="sec-cover">
    <div class="cover-frame">
      <div class="cover-top">
        ${
          company.logo_url
            ? `<img class="cover-logo" src="${esc(company.logo_url)}" alt="" />`
            : `<div class="cover-logo-fallback">${esc(company.name || 'توقع')}</div>`
        }
        <div class="cover-office">${esc(brand)}</div>
        <div class="cover-tag">${esc(
          company.tagline ||
            (lang === 'ar'
              ? 'للاستشارات الهندسية والسلامة والوقاية من الحريق'
              : 'Fire safety & life-safety engineering consultancy')
        )}</div>
      </div>
      ${coverImg}
      <div class="cover-mid">
        <div class="cover-kind">${lang === 'ar' ? 'تقرير فني / دراسة هندسية' : 'Technical / Engineering Study'}</div>
        <h1 class="cover-title">${esc(title)}</h1>
        <div class="cover-project">${esc(doc.project_name)}</div>
      </div>
      <div class="cover-meta">
        <div class="row"><span>${lang === 'ar' ? 'رقم التقرير' : 'Report No.'}</span><strong>${esc(
          doc.report_number
        )}</strong></div>
        <div class="row"><span>${lang === 'ar' ? 'التاريخ' : 'Date'}</span><strong>${esc(
          doc.report_date
        )}</strong></div>
        <div class="row"><span>${lang === 'ar' ? 'رمز العميل' : 'Client code'}</span><strong>${esc(
          doc.client_code
        )}</strong></div>
      </div>
    </div>
  </section>`;
}

function renderToc(
  doc: EngineeringStudyDocument,
  company: CompanyProfile,
  contentSections: EngineeringStudySection[]
): string {
  const tocPages = buildDynamicTocPages(contentSections);
  const rows = contentSections
    .map((s, i) => {
      const page = tocPages[i]?.page ?? i + 3;
      const num = i + 1;
      return `
        <a class="toc-row" href="#sec-${esc(s.id)}">
          <span class="toc-num">${num}.</span>
          <span class="toc-label">${esc(sectionTitle(doc, s))}</span>
          <span class="toc-dots" aria-hidden="true"></span>
          <span class="toc-page">${page}</span>
        </a>`;
    })
    .join('');

  return `
  <section class="sheet sheet-toc" id="sec-toc">
    ${renderHeader(doc, company, doc.locale === 'ar' ? 'الفهرس' : 'Contents')}
    <h2 class="toc-title">${doc.locale === 'ar' ? 'فهرس المحتويات' : 'Table of Contents'}</h2>
    <p class="toc-note">${
      doc.locale === 'ar'
        ? 'أرقام الصفحات محسوبة تلقائياً من أقسام التقرير الفعلية ومحتواها (نص / جداول / صور).'
        : 'Page numbers are computed automatically from actual sections and their content (text / tables / images).'
    }</p>
    <nav class="toc-list">${rows}</nav>
    ${renderFooter(company, doc.locale)}
  </section>`;
}

function renderApprovals(doc: EngineeringStudyDocument, company: CompanyProfile): string {
  const lang = doc.locale;
  return `
  <section class="sheet sheet-section" id="sec-approvals">
    ${renderHeader(doc, company, lang === 'ar' ? 'الاعتماد' : 'Approvals')}
    <h2 class="sec-title"><span class="sec-no">✓</span><span class="sec-label">${
      lang === 'ar' ? 'التوقيعات والاعتماد' : 'Signatures & Approval'
    }</span></h2>
    <p class="para">${
      lang === 'ar'
        ? 'يُعتمد هذا المستند بعد مراجعة المهندس المسؤول والمدير الفني، مع الالتزام بنتائج محرك القواعد الهندسية والمخططات المعتمدة. لا تُخترع قيم هندسية غير موثّقة في ملف المشروع.'
        : 'This document is approved after review by the responsible engineer and technical manager, subject to the Engineering Rules Engine and approved drawings. Undocumented engineering values are not invented.'
    }</p>
    <div class="sign-block">
      <div>
        <div class="sign-label">${lang === 'ar' ? 'المهندس المعدّ' : 'Prepared by'}</div>
        <div class="sign-line">................</div>
      </div>
      <div><div class="stamp">${esc(company.stamp_text || company.name)}</div></div>
      <div>
        <div class="sign-label">${lang === 'ar' ? 'اعتماد المكتب' : 'Office approval'}</div>
        <div class="sign-line">................</div>
      </div>
    </div>
    ${renderFooter(company, doc.locale)}
  </section>`;
}

function nasaimCss(doc: EngineeringStudyDocument): string {
  return `
    @page {
      size: A4 portrait;
      margin: 14mm 12mm 16mm 12mm;
    }
    @page :first {
      margin: 10mm 10mm 12mm 10mm;
    }
    html, body {
      width: 210mm;
      margin: 0;
      padding: 0;
      background: #fff;
      counter-reset: page 0;
    }
    body {
      font-family: "Tahoma","Segoe UI","Noto Naskh Arabic",Arial,sans-serif;
      color: #1a2332;
      line-height: 1.7;
      font-size: 11.5px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      box-sizing: border-box;
      width: 210mm;
      min-height: 297mm;
      padding: 12mm 11mm 16mm;
      margin: 0 auto 8px;
      background: #fff;
      position: relative;
      page-break-after: always;
      break-after: page;
      counter-increment: page;
    }
    .sheet:last-of-type { page-break-after: auto; break-after: auto; }
    /* الغلاف يُحسب في الترقيم (صفحة 1) لكن بدون إظهار الرقم */
    .sheet-cover { padding: 8mm; }
    .sheet-cover .rf, .sheet-cover .rh { display: none !important; }

    .cover-frame {
      min-height: 275mm;
      border: 2px solid #1f4d3a;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      padding: 12mm 10mm;
      box-sizing: border-box;
    }
    .cover-top { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .cover-logo { width: 78px; height: 78px; object-fit: contain; }
    .cover-logo-fallback {
      width: 78px; height: 78px; border: 2px solid #1f4d3a; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #1f4d3a; font-weight: 800; font-size: 12px;
    }
    .cover-office { font-size: 14px; font-weight: 800; color: #1f4d3a; }
    .cover-tag { font-size: 10px; color: #64748b; max-width: 160mm; }
    .cover-photo {
      width: 100%; max-width: 168mm; margin: 4mm 0;
      border: 1px solid #cbd5e1; background: #f8fafc;
      page-break-inside: avoid;
    }
    .cover-photo img {
      display: block; width: 100%; max-height: 100mm;
      object-fit: contain; object-position: center; background: #f1f5f9;
    }
    .cover-photo figcaption {
      font-size: 10.5px; font-weight: 700; color: #1f4d3a;
      padding: 5px 8px; border-top: 1px solid #e2e8f0;
    }
    .cover-kind {
      font-size: 11px; font-weight: 800; letter-spacing: 0.04em;
      color: #1f4d3a; text-transform: uppercase; margin-bottom: 4px;
    }
    .cover-title {
      margin: 0; max-width: 170mm; color: #9f1239;
      font-size: 20px; font-weight: 800; line-height: 1.4;
    }
    .cover-project { margin-top: 6px; font-size: 16px; font-weight: 800; color: #111827; }
    .cover-meta { width: 100%; max-width: 150mm; font-size: 12px; }
    .cover-meta .row {
      display: flex; justify-content: space-between; gap: 10px;
      border-bottom: 1px solid #e2e8f0; padding: 6px 2px;
    }

    .rh {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;
      border-bottom: 2.5px solid #1f4d3a; padding-bottom: 6px; margin-bottom: 10px;
    }
    .rh-brand { display: flex; align-items: center; gap: 8px; }
    .rh-brand img { width: 30px; height: 30px; object-fit: contain; }
    .rh-name { font-weight: 800; color: #1f4d3a; font-size: 11px; }
    .rh-sub { font-size: 9px; color: #64748b; }
    .rh-meta { text-align: end; font-size: 9.5px; color: #475569; line-height: 1.35; }
    .rh-meta-extra { font-weight: 700; color: #1f4d3a; }

    .rf {
      position: absolute; left: 11mm; right: 11mm; bottom: 7mm;
      display: flex; justify-content: space-between; gap: 8px;
      border-top: 1px solid #94a3b8; padding-top: 4px;
      font-size: 9px; color: #64748b;
    }
    .rf-page { font-weight: 800; color: #1f4d3a; white-space: nowrap; }
    .page-cur::after { content: counter(page); }
    .page-total::after { content: counter(pages); }

    .toc-title {
      text-align: center; color: #9f1239; font-size: 18px; font-weight: 800; margin: 4px 0 8px;
    }
    .toc-note { font-size: 10px; color: #64748b; margin: 0 0 12px; text-align: center; }
    .toc-row {
      display: flex; align-items: baseline; gap: 8px; margin: 8px 0;
      font-size: 12px; color: inherit; text-decoration: none;
    }
    .toc-num { font-weight: 800; color: #1f4d3a; min-width: 1.6rem; }
    .toc-label { font-weight: 650; max-width: 72%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .toc-dots { flex: 1; border-bottom: 1px dotted #94a3b8; transform: translateY(-3px); min-width: 12px; }
    .toc-page { font-weight: 800; color: #1f4d3a; }

    .sec-title {
      display: flex; align-items: center; gap: 10px;
      color: #1f4d3a; font-size: 15px; font-weight: 800;
      margin: 0 0 12px; padding-bottom: 6px;
      border-bottom: 1px solid #d1d5db;
      page-break-after: avoid;
    }
    .sec-no {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 1.7rem; height: 1.7rem; border-radius: 3px;
      background: #1f4d3a; color: #fff; font-size: 11px;
    }
    .sec-body { padding-bottom: 10mm; }
    .para { margin: 0 0 9px; text-align: justify; unicode-bidi: plaintext; }
    .para-intro { font-weight: 650; }
    .para.incomplete {
      color: #9f1239; font-weight: 700;
      border-inline-start: 3px solid #fda4af; padding-inline-start: 8px;
    }
    .cites { font-size: 10px; font-weight: 800; color: #166534; margin: -2px 0 10px; }

    .table-wrap { margin: 10px 0 14px; }
    .table-cap { font-weight: 800; font-size: 12px; margin-bottom: 5px; color: #1f4d3a; }
    table.data {
      width: 100%; border-collapse: collapse; font-size: 10.5px;
    }
    table.data thead { display: table-header-group; }
    table.data tr { page-break-inside: avoid; break-inside: avoid; }
    table.data th, table.data td {
      border: 1px solid #94a3b8; padding: 5px 6px; vertical-align: top;
    }
    table.data th { background: #e8f2ec; color: #1f4d3a; font-weight: 800; }

    .gallery { margin-top: 12px; }
    .gallery-title {
      font-size: 12px; font-weight: 800; color: #1f4d3a;
      margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px dashed #94a3b8;
      page-break-after: avoid;
    }
    .fig-row { display: flex; gap: 8px; margin: 0 0 10px; }
    .fig-row-double .fig { flex: 1 1 50%; }
    .fig-row-single .fig, .fig-row-full .fig { flex: 1 1 100%; }
    .keep-together { page-break-inside: avoid; break-inside: avoid; }
    .fig {
      margin: 0; border: 1px solid #94a3b8; background: #fff;
      display: flex; flex-direction: column; min-width: 0;
    }
    .fig-frame {
      display: flex; align-items: center; justify-content: center;
      background: #f8fafc; min-height: 42mm;
    }
    .fig img {
      display: block; width: 100%; height: auto;
      max-height: 145mm; object-fit: contain; object-position: center;
    }
    .fig-full img { max-height: 180mm; }
    .fig-cap {
      display: flex; flex-direction: column; gap: 2px;
      padding: 5px 8px; border-top: 1px solid #e2e8f0;
      font-size: 10px; background: #fff;
    }
    .fig-sec { font-weight: 800; color: #1f4d3a; }
    .fig-text { color: #334155; font-weight: 650; }

    .sign-block {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;
      margin-top: 28px; font-size: 11px;
    }
    .sign-label { font-weight: 700; }
    .sign-line { margin-top: 36px; }
    .stamp {
      border: 1px dashed #1f4d3a; border-radius: 50%; width: 88px; height: 88px;
      display: flex; align-items: center; justify-content: center; text-align: center;
      margin: 0 auto; color: #1f4d3a; font-weight: 800; font-size: 10px; padding: 6px;
    }

    a { color: inherit; }
    @media print {
      .sheet { margin: 0; box-shadow: none; }
      .sheet-section { page-break-before: always; }
      .sheet-toc { page-break-before: always; }
      .sheet-cover + .sheet-toc { page-break-before: always; }
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
  const contentSections = doc.sections.filter((s) => s.id !== 'cover' && s.id !== 'toc');

  const contentSheets = contentSections
    .map((s, i) => renderSectionSheet(doc, company, s, i + 1))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — ${esc(doc.project_name)}</title>
  <style>${nasaimCss(doc)}</style>
</head>
<body>
  ${renderCover(doc, company)}
  ${renderToc(doc, company, contentSections)}
  ${contentSheets}
  ${renderApprovals(doc, company)}
</body>
</html>`;
}
