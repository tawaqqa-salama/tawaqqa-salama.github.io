'use client';

/**
 * خطاب تسليم الدفاع المدني — توريد CD بالمخططات والتقرير الفني
 * قالب طباعة A4 عمودي (Portrait) مع سحب بيانات المشروع تلقائياً.
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
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="شعار" />`
    : `<div class="logo-fallback">${esc(company.name)}</div>`;

  const stamp = company.stamp_url
    ? `<img class="stamp" src="${esc(company.stamp_url)}" alt="ختم" />`
    : '';

  const copyBlock = snap.copyTo
    ? `<div class="copy-to"><strong>صورة إلى:</strong> ${esc(snap.copyTo)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>خطاب تسليم الدفاع المدني — ${esc(snap.projectName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    @media print {
      @page {
        size: A4 portrait;
        margin: 15mm 20mm;
      }
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print { display: none !important; }
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
      padding: 15mm;
      margin: 0 auto;
      box-sizing: border-box;
      direction: rtl;
      font-family: 'Tajawal', 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif;
      font-size: 12.5pt;
      line-height: 1.85;
      color: #111;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      border-bottom: 2px solid #1f4d3a;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .logo { max-height: 64px; max-width: 160px; object-fit: contain; }
    .logo-fallback {
      font-weight: 700;
      font-size: 14pt;
      color: #1f4d3a;
      max-width: 180px;
    }
    .company-meta {
      text-align: left;
      font-size: 9.5pt;
      line-height: 1.5;
      color: #333;
      direction: ltr;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 18px;
      margin-bottom: 16px;
      font-size: 11.5pt;
    }
    .meta-grid .label { color: #444; font-weight: 600; }
    .meta-grid .value { font-weight: 700; }

    .addressee {
      margin: 14px 0 8px;
      font-weight: 700;
      font-size: 12.5pt;
    }
    .subject {
      margin: 10px 0 16px;
      font-weight: 700;
      font-size: 12.5pt;
      line-height: 1.7;
    }
    .greeting { margin: 0 0 12px; font-weight: 600; }
    .body {
      text-align: justify;
      margin: 0 0 18px;
      font-size: 12.5pt;
    }
    .body strong { font-weight: 700; }
    .closing { margin: 18px 0 28px; font-weight: 600; }

    .copy-to {
      margin: 10px 0 22px;
      font-size: 11pt;
      color: #333;
    }

    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 28px;
    }
    .sig-box { text-align: center; min-height: 110px; }
    .sig-title { font-weight: 700; margin-bottom: 6px; color: #1f4d3a; }
    .sig-name { font-weight: 700; }
    .sig-role { font-size: 10.5pt; color: #444; }
    .sig-line {
      margin-top: 42px;
      border-top: 1px solid #999;
      padding-top: 4px;
      font-size: 10pt;
      color: #666;
    }
    .stamp {
      max-height: 90px;
      max-width: 90px;
      margin-top: 8px;
      object-fit: contain;
      opacity: 0.92;
    }

    .doc-title {
      text-align: center;
      font-size: 14pt;
      font-weight: 700;
      color: #1f4d3a;
      margin: 0 0 14px;
    }
  </style>
</head>
<body>
  <div class="cover-letter-page">
    <div class="header">
      ${logo}
      <div class="company-meta">
        <div><strong>${esc(company.legal_name || company.name)}</strong></div>
        <div>${esc(company.city || '')}</div>
        <div>${esc(company.phone || '')}</div>
      </div>
    </div>

    <h1 class="doc-title">خطاب تسليم الدفاع المدني</h1>

    <div class="meta-grid">
      <div><span class="label">رقم الصادر:</span> <span class="value" dir="ltr">${esc(snap.outgoingNumber)}</span></div>
      <div><span class="label">التاريخ الميلادي:</span> <span class="value" dir="ltr">${esc(snap.gregorianDate)}</span></div>
      <div><span class="label">التاريخ الهجري:</span> <span class="value">${esc(snap.hijriDate)}</span></div>
      <div><span class="label">اسم المنشأة:</span> <span class="value">${esc(snap.projectName)}</span></div>
    </div>

    <div class="addressee">${esc(snap.addressee)}</div>
    ${copyBlock}

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
