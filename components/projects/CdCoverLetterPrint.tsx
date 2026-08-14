'use client';

/**
 * خطاب تسليم الدفاع المدني — توريد CD بالمخططات والتقرير الفني
 * قالب طباعة A4 عمودي رسمي: هوامش نظيفة، بلا تداخل حقول، وتقليل آثار طباعة المتصفح.
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { CdCoverLetterReport, ProjectEngineeringData } from '@/lib/types/project-reports';
import {
  buildCdCoverLetterSnapshot,
  seedCdCoverLetter,
} from '@/lib/projects/cd-cover-letter';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildCdCoverLetterHtml(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  letter: CdCoverLetterReport;
  company: CompanyProfile;
}): string {
  const letter = seedCdCoverLetter(params.client, params.data, params.letter);
  const snap = buildCdCoverLetterSnapshot({
    client: params.client,
    data: params.data,
    letter,
  });
  const company = params.company;

  const logo = company.logo_url
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="" />`
    : `<div class="logo-fallback">${esc(company.name)}</div>`;

  const stamp = company.stamp_url
    ? `<img class="stamp" src="${esc(company.stamp_url)}" alt="" />`
    : `<div class="stamp-placeholder">الختم</div>`;

  const copyBlock = snap.copyTo
    ? `<tr>
        <td class="k">صورة إلى</td>
        <td class="v" colspan="3">${esc(snap.copyTo)}</td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <!-- Short title reduces browser print header clutter -->
  <title>خطاب تسليم الدفاع المدني</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm 15mm 15mm;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 12mm 15mm 15mm 15mm;
      }

      html, body {
        background: #fff !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Hide print header & footer browser defaults / chrome chrome */
      header, footer, .no-print { display: none !important; }
      a[href]::after { content: none !important; }
      a { text-decoration: none !important; color: inherit !important; }

      .cover-letter-page {
        width: auto !important;
        min-height: auto !important;
        max-width: none !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
      }
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .cover-letter-page {
      width: 210mm;
      min-height: 297mm;
      padding: 12mm 15mm 15mm 15mm;
      margin: 0 auto;
      box-sizing: border-box;
      direction: rtl;
      font-family: 'Tajawal', 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.75;
      color: #111;
      background: #fff;
    }

    @media screen {
      body { background: #e5e7eb; padding: 16px 0; }
      .cover-letter-page {
        box-shadow: 0 1px 8px rgba(15, 23, 42, 0.12);
      }
    }

    .header {
      display: grid;
      grid-template-columns: 1.1fr 1.4fr 1.1fr;
      gap: 10px;
      align-items: start;
      border-bottom: 2.5px solid #635bdb;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .header-side { font-size: 9.5pt; line-height: 1.45; color: #334155; }
    .header-side .row { margin: 0 0 3px; word-break: break-word; }
    .header-side strong { color: #0f172a; }
    .header-center { text-align: center; }
    .logo {
      display: block;
      max-height: 58px;
      max-width: 130px;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: 0 auto 4px;
    }
    .logo-fallback {
      width: 58px;
      height: 58px;
      margin: 0 auto 4px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 8pt;
      font-weight: 800;
      color: #635bdb;
      padding: 4px;
    }
    .brand {
      margin: 0;
      font-size: 11.5pt;
      font-weight: 800;
      color: #635bdb;
      line-height: 1.35;
    }
    .doc-title {
      margin: 4px 0 0;
      font-size: 13.5pt;
      font-weight: 800;
      color: #111;
    }
    .doc-sub {
      margin: 2px 0 0;
      font-size: 9pt;
      color: #64748b;
    }
    .header-left { text-align: left; direction: rtl; }

    table.meta {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 0 14px;
      font-size: 11pt;
    }
    table.meta td {
      border: 1px solid #94a3b8;
      padding: 6px 8px;
      vertical-align: middle;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    table.meta td.k {
      width: 18%;
      background: #f1f5f9;
      font-weight: 700;
      color: #1e293b;
      white-space: nowrap;
    }
    table.meta td.v {
      width: 32%;
      font-weight: 700;
      color: #0f172a;
    }
    .ltr { direction: ltr; unicode-bidi: isolate; text-align: left; }

    .addressee {
      margin: 0 0 10px;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      font-weight: 700;
      font-size: 12pt;
      line-height: 1.55;
    }
    .subject {
      margin: 0 0 12px;
      font-weight: 800;
      font-size: 12pt;
      line-height: 1.65;
    }
    .greeting {
      margin: 0 0 10px;
      font-weight: 700;
    }
    .body {
      margin: 0 0 14px;
      text-align: justify;
      font-size: 12pt;
      line-height: 1.9;
    }
    .body strong { font-weight: 800; }
    .closing {
      margin: 16px 0 22px;
      font-weight: 700;
    }

    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
      margin-top: 8px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sig-box {
      text-align: center;
      min-height: 130px;
      padding: 4px 6px;
    }
    .sig-title {
      font-weight: 800;
      margin-bottom: 6px;
      color: #635bdb;
      font-size: 11.5pt;
    }
    .sig-name {
      font-weight: 800;
      font-size: 11.5pt;
      word-break: break-word;
    }
    .sig-role {
      font-size: 10pt;
      color: #475569;
      margin-top: 2px;
    }
    .stamp {
      display: block;
      width: 72px;
      height: 72px;
      object-fit: contain;
      margin: 10px auto 0;
    }
    .stamp-placeholder {
      width: 72px;
      height: 72px;
      margin: 10px auto 0;
      border: 1.5px dashed #94a3b8;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9pt;
      color: #64748b;
      font-weight: 700;
    }
    .sig-line {
      margin-top: 28px;
      border-top: 1px solid #64748b;
      padding-top: 4px;
      font-size: 9.5pt;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="cover-letter-page">
    <div class="header">
      <div class="header-side">
        <div class="row"><strong>رقم الصادر</strong></div>
        <div class="row ltr">${esc(snap.outgoingNumber)}</div>
        <div class="row"><strong>التاريخ الميلادي</strong></div>
        <div class="row ltr">${esc(snap.gregorianDate)}</div>
        <div class="row"><strong>التاريخ الهجري</strong></div>
        <div class="row">${esc(snap.hijriDate)}</div>
      </div>
      <div class="header-center">
        ${logo}
        <p class="brand">${esc(company.legal_name || company.name)}</p>
        <h1 class="doc-title">خطاب تسليم الدفاع المدني</h1>
        <p class="doc-sub">توريد CD بالمخططات والتقرير الفني</p>
      </div>
      <div class="header-side header-left">
        <div class="row"><strong>س.ت</strong>: ${esc(company.commercial_register || '—')}</div>
        <div class="row"><strong>الهاتف</strong>: <span class="ltr">${esc(company.phone || '—')}</span></div>
        <div class="row"><strong>المدينة</strong>: ${esc(company.city || '—')}</div>
      </div>
    </div>

    <div class="addressee">${esc(snap.addressee)}</div>

    <table class="meta" role="presentation">
      <tr>
        <td class="k">اسم المنشأة</td>
        <td class="v">${esc(snap.projectName)}</td>
        <td class="k">حالة المبنى</td>
        <td class="v">${esc(snap.buildingStatus)}</td>
      </tr>
      <tr>
        <td class="k">الموقع</td>
        <td class="v">${esc(snap.location)}</td>
        <td class="k">المالك</td>
        <td class="v">${esc(snap.ownerName)}</td>
      </tr>
      <tr>
        <td class="k">المساحة</td>
        <td class="v">${esc(snap.totalAreaM2)} متر مربع</td>
        <td class="k">تصنيف الإشغال</td>
        <td class="v ltr">${esc(snap.occupancyCode)}</td>
      </tr>
      ${copyBlock}
    </table>

    <div class="subject">
      الموضوع: توريد CD الخاص بالمخططات والتقرير الفني الخاص بـ (${esc(snap.projectName)})
    </div>

    <p class="greeting">السلام عليكم ورحمة الله وبركاته،،</p>

    <p class="body">
      نرفق لكم نسخة من CD يحتوي على مخططات السلامة والدراسة الفنية الخاصة بـ
      (<strong>${esc(snap.projectName)}</strong>) -
      <strong>${esc(snap.buildingStatus)}</strong>،
      المالك / <strong>${esc(snap.ownerName)}</strong>،
      <strong>${esc(snap.location)}</strong>،
      وتبلغ مساحة الموقع العام (<strong>${esc(snap.totalAreaM2)} متر مربع</strong>)،
      وتصنيف الإشغال للمشروع طبقاً للكود السعودي (<strong>${esc(snap.occupancyCode)}</strong>)،
      وذلك حسب النظام المتبع لديكم وحسب الأوامر والتعليمات الصادرة في هذا الشأن.
    </p>

    <p class="closing">وتفضلوا بقبول وافر التحية والتقدير،،</p>

    <div class="signatures">
      <div class="sig-box">
        <div class="sig-title">مهندس السلامة</div>
        <div class="sig-name">${esc(snap.engineerName)}</div>
        <div class="sig-role">${esc(snap.engineerTitle)}</div>
        <div class="sig-line">التوقيع</div>
      </div>
      <div class="sig-box">
        <div class="sig-title">مدير المكتب</div>
        <div class="sig-name">${esc(snap.managerName)}</div>
        <div class="sig-role">${esc(snap.managerTitle)}</div>
        ${stamp}
        <div class="sig-line">التوقيع والختم</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printCdCoverLetter(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  letter: CdCoverLetterReport;
  company: CompanyProfile;
}) {
  const schedule = (cb: () => void) => {
    const ric = (
      window as Window & { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number }
    ).requestIdleCallback;
    if (typeof ric === 'function') ric(cb, { timeout: 400 });
    else setTimeout(cb, 0);
  };

  schedule(() => {
    const html = buildCdCoverLetterHtml(params);
    void import('@/lib/print/document-preview').then(({ openDocumentPreview }) => {
      openDocumentPreview({
        title: `خطاب تسليم الدفاع المدني — ${params.client.business_name || params.client.name}`,
        html,
        fileName: `cd-cover-letter-${params.client.client_code || params.client.id}`,
      });
    });
  });
}
