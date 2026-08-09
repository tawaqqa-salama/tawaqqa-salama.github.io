import type { CompanyProfile } from '@/lib/company-profile';
import type {
  EngineeringStudyDocument,
  EngineeringStudyImage,
  EngineeringStudySection,
} from '@/lib/projects/engineering-report-engine/types';

function esc(value: string | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionTitle(doc: EngineeringStudyDocument, s: EngineeringStudySection): string {
  return doc.locale === 'ar' ? s.title_ar : s.title_en;
}

function renderImages(
  doc: EngineeringStudyDocument,
  images: EngineeringStudyImage[] | undefined,
  className = 'photo-block'
): string {
  if (!images?.length) return '';
  return `<div class="photos ${className}">${images
    .map((img) => {
      const caption = doc.locale === 'ar' ? img.caption_ar : img.caption_en;
      return `<figure class="photo">
        <img src="${esc(img.src)}" alt="${esc(caption)}" />
        ${caption ? `<figcaption class="cap">${esc(caption)}</figcaption>` : ''}
      </figure>`;
    })
    .join('')}</div>`;
}

function renderSectionBody(doc: EngineeringStudyDocument, s: EngineeringStudySection): string {
  const paras = s.paragraphs
    .map((para) => {
      const cites = para.citations.length
        ? `<div class="cites">${esc(para.citations.join(' · '))}</div>`
        : '';
      const cls = para.incomplete ? 'para incomplete' : 'para';
      return `<p class="${cls}">${esc(para.text)}</p>${cites}`;
    })
    .join('');

  const images = renderImages(doc, s.images, s.id === 'site_information' ? 'photo-map' : 'photo-block');

  const tables = (s.tables || [])
    .map((t) => {
      const caption = doc.locale === 'ar' ? t.caption_ar : t.caption_en;
      const headers = doc.locale === 'ar' ? t.headers_ar : t.headers_en;
      return `
        <div class="table-wrap">
          <div class="table-cap">${esc(caption)}</div>
          <table class="data">
            <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>
              ${t.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    })
    .join('');

  // للصفحة 5 (بيانات الموقع): الصورة أولاً ثم النص والجدول
  if (s.id === 'site_information') {
    return `${images}${paras}${tables}`;
  }
  return `${paras}${images}${tables}`;
}

/** A4 printable HTML — cover, TOC, headers/footers, company branding, CSS page counters. */
export function buildEngineeringStudyHtml(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
}): string {
  const { document: doc, company } = params;
  const dir = doc.locale === 'ar' ? 'rtl' : 'ltr';
  const lang = doc.locale;
  const title = doc.locale === 'ar' ? doc.title_ar : doc.title_en;
  const contentSections = doc.sections.filter((s) => s.id !== 'cover' && s.id !== 'toc');

  const tocHtml = contentSections
    .map((s, i) => {
      const page = i + 3; // cover=1, toc=2, content from 3
      return `
        <div class="toc-row">
          <span class="toc-num">${s.number - 2}.</span>
          <span class="toc-label">${esc(sectionTitle(doc, s))}</span>
          <span class="toc-dots" aria-hidden="true"></span>
          <span class="toc-page">${page}</span>
        </div>`;
    })
    .join('');

  const contentSheets = contentSections
    .map((s) => {
      return `
  <section class="sheet">
    <div class="running-header">
      <div class="rh-brand">
        ${company.logo_url ? `<img src="${esc(company.logo_url)}" alt="" />` : ''}
        <span>${esc(company.legal_name || company.name)}</span>
      </div>
      <div class="rh-meta">${esc(doc.report_number)} · ${esc(doc.report_date)}</div>
    </div>
    <h2 class="sec-title"><span class="sec-no">${s.number - 2}</span> ${esc(sectionTitle(doc, s))}</h2>
    ${renderSectionBody(doc, s)}
    <div class="running-footer">
      <span>${esc(company.address)}${company.city ? ` — ${esc(company.city)}` : ''}${
        company.phone ? ` | ${esc(company.phone)}` : ''
      }</span>
      <span class="page-no"></span>
    </div>
  </section>`;
    })
    .join('');

  const gateBanner =
    doc.locale === 'ar'
      ? doc.rules_gate_ok
        ? 'محرك القرار الهندسي: التسلسل متوافق'
        : `محرك القرار: ${doc.rules_summary_ar}`
      : doc.rules_gate_ok
        ? 'Engineering Decision Engine: cascade compliant'
        : `Decision Engine: ${doc.rules_summary_en}`;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — ${esc(doc.project_name)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 16mm 14mm 18mm 14mm;
      @bottom-center {
        content: counter(page);
        font-size: 9pt;
        color: #64748b;
      }
    }
    html, body {
      width: 210mm;
      margin: 0;
      padding: 0;
      background: #fff;
      counter-reset: page;
    }
    body {
      font-family: "Tahoma","Segoe UI",Arial,sans-serif;
      color: #1f2937;
      line-height: 1.65;
      font-size: 11.5px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      box-sizing: border-box;
      width: 210mm;
      min-height: 297mm;
      padding: 14mm 12mm 18mm;
      margin: 0 auto 10px;
      background: #fff;
      page-break-after: always;
      break-after: page;
      position: relative;
      counter-increment: page;
    }
    .sheet:last-of-type { page-break-after: auto; break-after: auto; }
    .sheet-cover { display: flex; flex-direction: column; }
    .cover-frame {
      flex: 1;
      min-height: 260mm;
      border: 1.5px solid #1f4d3a;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      padding: 16mm 10mm;
      box-sizing: border-box;
    }
    .cover-brand { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 4mm; }
    .cover-brand img.logo { width: 72px; height: 72px; object-fit: contain; }
    .cover-brand-fallback {
      width: 72px; height: 72px; border: 2px solid #1f4d3a; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: #1f4d3a; font-weight: 700; font-size: 11px; padding: 6px;
    }
    .cover-office { font-size: 13px; font-weight: 700; color: #1f4d3a; }
    .cover-facade {
      width: 100%; max-width: 165mm; margin: 6mm 0 4mm;
      border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #f8fafc;
    }
    .cover-facade img {
      display: block; width: 100%; max-height: 95mm; object-fit: cover; object-position: center;
    }
    .cover-facade .cap {
      font-size: 11px; font-weight: 700; color: #1f4d3a; padding: 6px 10px; text-align: center;
      border-top: 1px solid #e2e8f0; background: #fff;
    }
    .cover-facade-missing {
      width: 100%; max-width: 165mm; min-height: 70mm; margin: 6mm 0 4mm;
      border: 1.5px dashed #94a3b8; border-radius: 6px;
      display: flex; align-items: center; justify-content: center; text-align: center;
      color: #64748b; font-size: 12px; font-weight: 650; padding: 16px; background: #f8fafc;
    }
    .cover-title {
      margin: 0; max-width: 170mm; color: #b91c1c; font-size: 20px; font-weight: 800; line-height: 1.45;
    }
    .cover-project { font-size: 15px; font-weight: 700; color: #111827; max-width: 170mm; }
    .cover-meta { width: 100%; max-width: 150mm; font-size: 12.5px; margin-bottom: 4mm; }
    .cover-meta .row {
      display: flex; justify-content: space-between; gap: 10px;
      border-bottom: 1px solid #e2e8f0; padding: 6px 2px;
    }
    .cover-meta .label { color: #64748b; font-weight: 600; }
    .cover-meta .value { font-weight: 700; }
    .photos { display: flex; flex-direction: column; gap: 10px; margin: 10px 0 14px; }
    .photo {
      margin: 0; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #fff;
      page-break-inside: avoid; break-inside: avoid;
    }
    .photo img { display: block; width: 100%; max-height: 140mm; object-fit: contain; background: #f8fafc; }
    .photo-map .photo img { max-height: 120mm; object-fit: cover; object-position: center; }
    .photo .cap {
      font-size: 11px; font-weight: 700; color: #1f4d3a; padding: 6px 10px;
      border-top: 1px solid #e2e8f0; text-align: center;
    }
    .gate {
      margin-top: 8px; font-size: 11px; font-weight: 700;
      color: ${doc.rules_gate_ok ? '#166534' : '#9f1239'};
    }
    .toc-title {
      text-align: center; color: #b91c1c; font-size: 18px; font-weight: 800; margin: 6px 0 18px;
    }
    .toc-row {
      display: flex; align-items: baseline; gap: 8px; margin: 10px 0; font-size: 12.5px;
    }
    .toc-num { font-weight: 700; color: #1f4d3a; min-width: 1.5rem; }
    .toc-label { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
    .toc-dots {
      flex: 1; border-bottom: 1px dotted #94a3b8; transform: translateY(-3px); min-width: 16px;
    }
    .toc-page { font-weight: 800; color: #1f4d3a; }
    .running-header {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      border-bottom: 2px solid #1f4d3a; padding-bottom: 6px; margin-bottom: 12px; font-size: 10px;
    }
    .rh-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1f4d3a; }
    .rh-brand img { width: 28px; height: 28px; object-fit: contain; }
    .rh-meta { color: #64748b; white-space: nowrap; }
    .running-footer {
      position: absolute; left: 12mm; right: 12mm; bottom: 8mm;
      display: flex; justify-content: space-between; gap: 10px;
      border-top: 1px solid #cbd5e1; padding-top: 4px;
      font-size: 9px; color: #64748b;
    }
    .page-no::after { content: counter(page); font-weight: 700; color: #1f4d3a; }
    .sec-title {
      color: #1f4d3a; font-size: 15px; font-weight: 800; margin: 0 0 10px;
      display: flex; align-items: baseline; gap: 8px;
    }
    .sec-no {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 1.6rem; height: 1.6rem; border-radius: 4px;
      background: #1f4d3a; color: #fff; font-size: 11px;
    }
    .para { margin: 0 0 10px; text-align: justify; }
    .para.incomplete { color: #9f1239; font-weight: 600; border-right: 3px solid #fda4af; padding-inline-start: 8px; }
    html[dir="ltr"] .para.incomplete { border-right: none; border-left: 3px solid #fda4af; }
    .cites {
      font-size: 10px; font-weight: 700; color: #166534; margin: -4px 0 12px;
    }
    .table-wrap { margin: 12px 0 16px; }
    .table-cap { font-weight: 700; font-size: 12px; margin-bottom: 6px; color: #1f4d3a; }
    table.data {
      width: 100%; border-collapse: collapse; font-size: 10.5px;
    }
    table.data th, table.data td {
      border: 1px solid #cbd5e1; padding: 5px 6px; vertical-align: top;
    }
    table.data th { background: #eef6f1; color: #1f4d3a; font-weight: 700; }
    .sign-block {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;
      margin-top: 28px; font-size: 11px;
    }
    .stamp {
      border: 1px dashed #1f4d3a; border-radius: 50%; width: 88px; height: 88px;
      display: flex; align-items: center; justify-content: center; text-align: center;
      margin: 0 auto; color: #1f4d3a; font-weight: 700; font-size: 10px; padding: 6px;
    }
    @media print {
      .sheet { margin: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <section class="sheet sheet-cover">
    <div class="cover-frame">
      <div class="cover-brand">
        ${
          company.logo_url
            ? `<img class="logo" src="${esc(company.logo_url)}" alt="logo" />`
            : `<div class="cover-brand-fallback">${esc(company.name || 'Logo')}</div>`
        }
        <div class="cover-office">${esc(company.legal_name || company.name)}</div>
        <div style="font-size:10px;color:#64748b;max-width:160mm">${esc(company.tagline)}</div>
      </div>
      ${
        doc.cover_image?.src
          ? `<figure class="cover-facade">
              <img src="${esc(doc.cover_image.src)}" alt="${esc(
                lang === 'ar' ? doc.cover_image.caption_ar : doc.cover_image.caption_en
              )}" />
              <figcaption class="cap">${esc(
                lang === 'ar' ? doc.cover_image.caption_ar : doc.cover_image.caption_en
              )}</figcaption>
            </figure>`
          : `<div class="cover-facade-missing">${
              lang === 'ar'
                ? 'يلزم إرفاق صورة واجهة المشروع لتظهر في صفحة الغلاف'
                : 'Attach the project facade photo to show it on the cover page'
            }</div>`
      }
      <h1 class="cover-title">${esc(title)}</h1>
      <div class="cover-project">${esc(doc.project_name)}</div>
      <div class="cover-meta">
        <div class="row"><span class="label">${lang === 'ar' ? 'رقم التقرير' : 'Report No.'}</span><span class="value">${esc(doc.report_number)}</span></div>
        <div class="row"><span class="label">${lang === 'ar' ? 'التاريخ' : 'Date'}</span><span class="value">${esc(doc.report_date)}</span></div>
        <div class="row"><span class="label">${lang === 'ar' ? 'رمز العميل' : 'Client code'}</span><span class="value">${esc(doc.client_code)}</span></div>
        <div class="gate">${esc(gateBanner)}</div>
      </div>
    </div>
  </section>

  <section class="sheet">
    <div class="running-header">
      <div class="rh-brand">
        ${company.logo_url ? `<img src="${esc(company.logo_url)}" alt="" />` : ''}
        <span>${esc(company.legal_name || company.name)}</span>
      </div>
      <div class="rh-meta">${esc(title)}</div>
    </div>
    <h2 class="toc-title">${lang === 'ar' ? 'فهرس المحتويات' : 'Table of Contents'}</h2>
    ${tocHtml}
    <div class="running-footer">
      <span>${esc(company.name)}</span>
      <span class="page-no"></span>
    </div>
  </section>

  ${contentSheets}

  <section class="sheet">
    <div class="running-header">
      <div class="rh-brand"><span>${esc(company.legal_name || company.name)}</span></div>
      <div class="rh-meta">${lang === 'ar' ? 'الاعتماد' : 'Approvals'}</div>
    </div>
    <h2 class="sec-title">${lang === 'ar' ? 'التوقيعات والاعتماد' : 'Signatures & Approval'}</h2>
    <p class="para">${
      lang === 'ar'
        ? 'يُعتمد هذا المستند بعد مراجعة المهندس المسؤول والمدير الفني، مع الالتزام بنتائج محرك القواعد الهندسية والمخططات المعتمدة.'
        : 'This document is approved after review by the responsible engineer and technical manager, subject to the Engineering Rules Engine and approved drawings.'
    }</p>
    <div class="sign-block">
      <div>
        <div>${lang === 'ar' ? 'المهندس المعدّ' : 'Prepared by'}</div>
        <div style="margin-top:40px">................</div>
      </div>
      <div><div class="stamp">${esc(company.stamp_text || company.name)}</div></div>
      <div>
        <div>${lang === 'ar' ? 'اعتماد المكتب' : 'Office approval'}</div>
        <div style="margin-top:40px">................</div>
      </div>
    </div>
    <div class="running-footer">
      <span>${esc(company.address)}</span>
      <span class="page-no"></span>
    </div>
  </section>
</body>
</html>`;
}

export function printEngineeringStudy(params: {
  document: EngineeringStudyDocument;
  company: CompanyProfile;
  clientCode?: string;
}) {
  const html = buildEngineeringStudyHtml(params);
  const title =
    params.document.locale === 'ar'
      ? `دراسة هندسية — ${params.document.project_name}`
      : `Engineering Study — ${params.document.project_name}`;
  void import('@/lib/print/document-preview').then(({ openDocumentPreview }) => {
    openDocumentPreview({
      title,
      html,
      fileName: `engineering-study-${params.clientCode || params.document.client_code || 'report'}`,
    });
  });
}
