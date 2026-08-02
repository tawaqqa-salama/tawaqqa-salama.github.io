'use client';

/**
 * شهادة الإنهاء ومطابقة الأعمال — قالب رسمي A4 أفقي (الدفاع المدني / الغرفة التجارية).
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { CompletionCertificateReport } from '@/lib/types/project-reports';
import { completionCertificateDates } from '@/lib/projects/completion-certificate';
import { resolveOfficeCivilDefenseLicense } from '@/lib/projects/safety-delivery-letter';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayDate(isoOrText: string | undefined | null): string {
  const raw = String(isoOrText ?? '').trim();
  if (!raw) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return completionCertificateDates(raw).gregorian;
  }
  return raw;
}

export function buildCompletionCertificateHtml(params: {
  client: ClientRecord;
  cert: CompletionCertificateReport;
  company: CompanyProfile;
}): string {
  const { client, cert, company } = params;
  const dates = completionCertificateDates(cert.issue_date);
  const officeName = company.legal_name || company.name || '—';
  const licenseNo =
    cert.office_license_number?.trim() || resolveOfficeCivilDefenseLicense(company);
  const licenseExpiry = displayDate(cert.office_license_expiry);
  const certNo = cert.certificate_number?.trim() || 'تحت الإجراء';
  const facility = cert.facility_name || cert.project_name || client.business_name || client.name || '—';
  const owner = cert.owner_name || client.owner_name || '—';
  const landArea = cert.land_area?.trim()
    ? `${cert.land_area.trim()}${/م/.test(cert.land_area) ? '' : ' م²'}`
    : '—';

  const logo = company.logo_url
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="شعار" />`
    : `<div class="logo-fallback">${esc(company.name)}</div>`;
  const stamp = company.stamp_url
    ? `<img class="stamp" src="${esc(company.stamp_url)}" alt="ختم" />`
    : `<div class="stamp-box">${esc(company.stamp_text || company.name)}</div>`;

  const qrData = encodeURIComponent(
    `CERT:${certNo}|${facility}|${dates.gregorian}|${licenseNo}`
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`;

  const declaration = `يشهد مكتب / <strong>${esc(officeName)}</strong> للاستشارات الهندسية والسلامة والمعتمد من قبل المديرية العامة للدفاع المدني بممارسة نشاط المكاتب الهندسية الاستشارية للوقاية والحماية من الحريق بموجب ترخيص رقم (<strong dir="ltr">${esc(licenseNo)}</strong>) بتاريخ انتهاء (<strong>${esc(licenseExpiry)}</strong>) بأنه أشرف على تنفيذ / تطبيق جميع أنظمة الوقاية والحماية من الحريق ومطابقتها لكود البناء السعودي ونظام ولوائح الدفاع المدني للمنشأة الموضحة بياناتها أدناه.`;

  const contractorLine = `علماً بأنه تم التنفيذ عن طريق <strong>${esc(cert.contractor_name || '—')}</strong> رقم ترخيص (<strong dir="ltr">${esc(cert.contractor_license || '—')}</strong>) بتاريخ انتهاء (<strong>${esc(displayDate(cert.contractor_license_expiry))}</strong>) وأنه تم استلام جميع أنظمة الوقاية والحماية من الحريق وهي مطابقة للمواصفات المحلية والدولية المعتمدة.`;

  const chamberNote =
    cert.chamber_footer_note?.trim() ||
    'تم إصدار هذا الختم بناء على طلب المشترك والتحقق من بيانات العضوية عبر الغرفة التجارية / الخدمات الإلكترونية المعتمدة.';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>شهادة الإنهاء ومطابقة الأعمال — ${esc(facility)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 6mm 10mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #e8eef2;
      color: #111;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 10px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    header, footer, .no-print { display: none !important; }

    .certificate-page {
      width: 297mm;
      min-height: 210mm;
      padding: 12mm 15mm;
      margin: 0 auto;
      box-sizing: border-box;
      direction: rtl;
      background: #fff;
      color: #111;
      border: 1.5px solid #1f4d3a;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .top {
      display: grid;
      grid-template-columns: 1.1fr 1.6fr 1.1fr;
      gap: 10px;
      align-items: start;
      border-bottom: 2px solid #1f4d3a;
      padding-bottom: 6px;
    }
    .meta { font-size: 9px; line-height: 1.45; }
    .meta div { margin: 0 0 2px; }
    .center { text-align: center; }
    .logo, .logo-fallback {
      width: 46px; height: 46px; object-fit: contain;
      margin: 0 auto 3px; display: block;
    }
    .logo-fallback {
      border: 1px solid #cbd5e1; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 7.5px; font-weight: 800; color: #1f4d3a; padding: 2px;
    }
    .brand { margin: 0; font-size: 11px; font-weight: 900; color: #1f4d3a; }
    .doc-title {
      margin: 3px 0 0;
      font-size: 17px;
      font-weight: 900;
      color: #143528;
      letter-spacing: 0.2px;
    }
    .doc-sub { margin: 2px 0 0; font-size: 9px; color: #475569; }
    .meta-end { text-align: left; }
    .cert-no {
      display: inline-block;
      border: 1px solid #1f4d3a;
      border-radius: 4px;
      padding: 2px 8px;
      font-weight: 800;
      margin-top: 2px;
      font-size: 10px;
    }

    .declaration {
      text-align: justify;
      margin: 0;
      padding: 6px 9px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      font-size: 9.5px;
      line-height: 1.5;
    }

    h3 {
      margin: 2px 0 3px;
      font-size: 10.5px;
      color: #1f4d3a;
      border-right: 3px solid #1f4d3a;
      padding-right: 6px;
    }

    table.grid {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
      table-layout: fixed;
    }
    table.grid th, table.grid td {
      border: 1px solid #64748b;
      padding: 4px 5px;
      vertical-align: middle;
      font-size: 8.5px;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    table.grid th {
      background: #eef6f1;
      color: #143528;
      font-weight: 800;
      text-align: center;
      line-height: 1.3;
    }
    table.grid td { text-align: center; }

    .contractor {
      text-align: justify;
      margin: 0;
      padding: 6px 9px;
      border: 1px dashed #94a3b8;
      border-radius: 5px;
      font-size: 9.5px;
      line-height: 1.5;
    }

    .bottom {
      margin-top: auto;
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 14px;
      align-items: end;
      page-break-inside: avoid;
    }

    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    .sign { text-align: center; }
    .sign .t { font-weight: 800; font-size: 10px; margin-bottom: 2px; }
    .sign .d { font-size: 9.5px; color: #334155; min-height: 18px; }
    .stamp {
      width: 56px; height: 56px; object-fit: contain;
      margin: 4px auto; display: block;
    }
    .stamp-box {
      width: 56px; height: 56px; margin: 4px auto;
      border: 1.5px dashed #94a3b8; border-radius: 999px;
      display: flex; align-items: center; justify-content: center;
      text-align: center; font-size: 7.5px; font-weight: 700;
      color: #475569; padding: 3px;
    }
    .sign-line {
      margin-top: 12px;
      border-top: 1px solid #64748b;
      padding-top: 2px;
      font-size: 8.5px;
      color: #475569;
    }

    .chamber {
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      padding: 6px 8px;
      display: grid;
      grid-template-columns: 58px 1fr;
      gap: 8px;
      align-items: center;
      background: #fafbfc;
    }
    .chamber img {
      width: 52px; height: 52px;
      border: 1px solid #e2e8f0; border-radius: 4px; background: #fff;
    }
    .chamber .note {
      font-size: 8px;
      color: #475569;
      line-height: 1.35;
      text-align: right;
    }
    .chamber .note strong { color: #1f4d3a; }

    @media print {
      @page {
        size: A4 landscape;
        margin: 6mm 10mm;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      header, footer, .no-print { display: none !important; }
      .certificate-page {
        width: 100%;
        min-height: auto;
        padding: 0;
        border: 1.5px solid #1f4d3a;
        margin: 0;
      }
      a[href]::after { content: none !important; }
    }

    @media screen {
      body { padding: 12px 0 24px; }
      .certificate-page {
        box-shadow: 0 8px 28px rgba(15, 23, 42, 0.12);
      }
    }
  </style>
</head>
<body>
  <div class="certificate-page">
    <div class="top">
      <div class="meta">
        <div><strong>ترخيص المكتب لدى الدفاع المدني</strong></div>
        <div dir="ltr"><strong>${esc(licenseNo)}</strong></div>
        <div>تاريخ انتهاء الترخيص: <strong>${esc(licenseExpiry)}</strong></div>
        <div>س.ت: ${esc(company.commercial_register || '—')}</div>
      </div>
      <div class="center">
        ${logo}
        <p class="brand">${esc(officeName)}</p>
        <h1 class="doc-title">شهادة الإنهاء ومطابقة الأعمال</h1>
        <p class="doc-sub">وفق كود البناء السعودي واشتراطات الدفاع المدني</p>
      </div>
      <div class="meta-end meta">
        <div>رقم الشهادة</div>
        <div class="cert-no" dir="ltr">${esc(certNo)}</div>
        <div style="margin-top:4px">تاريخ إصدارها (ميلادي)</div>
        <div><strong dir="ltr">${esc(dates.gregorian)}</strong></div>
        <div>تاريخ إصدارها (هجري)</div>
        <div><strong>${esc(dates.hijri)}</strong></div>
      </div>
    </div>

    <p class="declaration">${declaration}</p>

    <h3>أولاً: بيانات الدراسة</h3>
    <table class="grid">
      <thead>
        <tr>
          <th style="width:42%">المكتب المعد للدراسة التي تم الإشراف بناء عليها</th>
          <th style="width:36%">رقم تقرير الدراسة المرفق به المخططات</th>
          <th style="width:22%">تاريخ إعداد الدراسة</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(cert.study_office_name || officeName)}</td>
          <td dir="ltr">${esc(cert.study_report_number || '—')}</td>
          <td dir="ltr">${esc(displayDate(cert.study_date))}</td>
        </tr>
      </tbody>
    </table>

    <h3>ثانياً: بيانات المنشأة</h3>
    <table class="grid">
      <thead>
        <tr>
          <th>مسمى المنشأة</th>
          <th>المالك</th>
          <th>النشاط</th>
          <th>تصنيف النشاط</th>
          <th>الحي</th>
          <th>الشارع</th>
          <th>مساحة الأرض</th>
          <th>مكونات المبنى</th>
          <th>التصنيف الإنشائي للمبنى</th>
          <th>وسيلة التواصل (المالك / المستثمر)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(facility)}</td>
          <td>${esc(owner)}</td>
          <td>${esc(cert.activity_label || '—')}</td>
          <td>${esc(cert.activity_classification || '—')}</td>
          <td>${esc(cert.district || client.district || '—')}</td>
          <td>${esc(cert.street || client.street || '—')}</td>
          <td>${esc(landArea)}</td>
          <td>${esc(cert.building_components || '—')}</td>
          <td>${esc(cert.building_structural_class || '—')}</td>
          <td dir="ltr">${esc(cert.owner_contact || client.phone || '—')}</td>
        </tr>
      </tbody>
    </table>

    <p class="contractor">${contractorLine}</p>

    <div class="bottom">
      <div class="signs">
        <!-- RTL: العمود الأول يظهر يميناً -->
        <div class="sign">
          <div class="t">مهندس السلامة بالمكتب</div>
          <div class="d">${esc(cert.engineer_name || '—')}</div>
          <div class="sign-line">التوقيع</div>
        </div>
        <div class="sign">
          <div class="t">مالك المكتب / ${esc(cert.office_owner_name || officeName)}</div>
          ${stamp}
          <div class="sign-line">التوقيع والختم</div>
        </div>
      </div>
      <div class="chamber">
        <img src="${qrUrl}" alt="QR" width="52" height="52" />
        <div class="note">
          <strong>ختم التحقق الإلكتروني / الغرفة التجارية</strong><br/>
          ${esc(chamberNote)}
          <br/>مرجع الشهادة: <span dir="ltr">${esc(certNo)}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printCompletionCertificate(
  client: ClientRecord,
  cert: CompletionCertificateReport,
  company?: CompanyProfile | null
) {
  const run = async () => {
    const { loadCompanyProfile } = await import('@/lib/company-profile');
    const profile = company || (await loadCompanyProfile());
    const html = buildCompletionCertificateHtml({ client, cert, company: profile });
    const { openDocumentPreview } = await import('@/lib/print/document-preview');
    openDocumentPreview({
      title: `شهادة الإنهاء ومطابقة الأعمال — ${client.business_name || client.name}`,
      html,
      fileName: `completion-certificate-${cert.certificate_number || client.client_code || client.id}`,
    });
  };

  const schedule =
    typeof window !== 'undefined' &&
    typeof (window as Window & { requestIdleCallback?: Function }).requestIdleCallback === 'function'
      ? (cb: () => void) =>
          (
            window as Window & {
              requestIdleCallback: (fn: () => void, opts?: { timeout: number }) => number;
            }
          ).requestIdleCallback(cb, { timeout: 400 })
      : (cb: () => void) => setTimeout(cb, 0);

  schedule(() => {
    void run();
  });
}
