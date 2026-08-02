'use client';

/**
 * شهادة الإنهاء ومطابقة الأعمال — قالب رسمي A4 (الدفاع المدني / الغرفة التجارية).
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
  const licenseExpiry = cert.office_license_expiry?.trim() || '—';
  const certNo = cert.certificate_number?.trim() || 'تحت الإجراء';
  const facility = cert.facility_name || cert.project_name || client.business_name || client.name || '—';
  const owner = cert.owner_name || client.owner_name || '—';

  const logo = company.logo_url
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="شعار" />`
    : `<div class="logo-fallback">${esc(company.name)}</div>`;
  const stamp = company.stamp_url
    ? `<img class="stamp" src="${esc(company.stamp_url)}" alt="ختم" />`
    : `<div class="stamp-box">${esc(company.stamp_text || company.name)}</div>`;

  const qrData = encodeURIComponent(
    `CERT:${certNo}|${facility}|${dates.gregorian}|${licenseNo}`
  );
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrData}`;

  const declaration = `يشهد مكتب / <strong>${esc(officeName)}</strong> للاستشارات الهندسية والسلامة والمعتمد من قبل المديرية العامة للدفاع المدني بممارسة نشاط المكاتب الهندسية الاستشارية للوقاية والحماية من الحريق بموجب ترخيص رقم (<strong dir="ltr">${esc(licenseNo)}</strong>) بتاريخ انتهاء (<strong>${esc(licenseExpiry)}</strong>) بأنه أشرف على تنفيذ / تطبيق جميع أنظمة الوقاية والحماية من الحريق ومطابقتها لكود البناء السعودي ونظام ولوائح الدفاع المدني للمنشأة الموضحة بياناتها أدناه.`;

  const contractorLine = `علماً بأنه تم التنفيذ عن طريق <strong>${esc(cert.contractor_name || '—')}</strong> رقم ترخيص (<strong dir="ltr">${esc(cert.contractor_license || '—')}</strong>) بتاريخ انتهاء (<strong>${esc(cert.contractor_license_expiry || '—')}</strong>) وأنه تم استلام جميع أنظمة الوقاية والحماية من الحريق وهي مطابقة للمواصفات المحلية والدولية المعتمدة.`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>شهادة الإنهاء ومطابقة الأعمال — ${esc(facility)}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #111;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 10.5px; line-height: 1.45;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    header, footer, .no-print { display: none !important; }
    .sheet {
      width: 100%; max-width: 194mm; margin: 0 auto;
      border: 2px solid #1f4d3a; padding: 10px 12px 8px;
      min-height: 270mm;
      display: flex; flex-direction: column;
    }
    .top {
      display: grid; grid-template-columns: 1fr 1.4fr 1fr;
      gap: 8px; align-items: start;
      border-bottom: 2px solid #1f4d3a; padding-bottom: 8px; margin-bottom: 10px;
    }
    .meta { font-size: 9.5px; line-height: 1.5; }
    .meta div { margin: 0 0 3px; }
    .center { text-align: center; }
    .logo, .logo-fallback {
      width: 52px; height: 52px; object-fit: contain; margin: 0 auto 4px; display: block;
    }
    .logo-fallback {
      border: 1px solid #cbd5e1; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 8px; font-weight: 800; color: #1f4d3a; padding: 3px;
    }
    .brand { margin: 0; font-size: 12px; font-weight: 900; color: #1f4d3a; }
    .doc-title {
      margin: 4px 0 0; font-size: 18px; font-weight: 900; color: #143528;
      letter-spacing: 0.2px;
    }
    .doc-sub { margin: 3px 0 0; font-size: 10px; color: #475569; }
    .left { text-align: left; }
    .cert-no {
      display: inline-block; border: 1px solid #1f4d3a; border-radius: 4px;
      padding: 3px 8px; font-weight: 800; margin-top: 2px;
    }
    .declaration {
      text-align: justify; margin: 0 0 10px; padding: 8px 10px;
      background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: 10.5px;
    }
    h3 {
      margin: 0 0 5px; font-size: 11.5px; color: #1f4d3a;
      border-right: 3px solid #1f4d3a; padding-right: 6px;
    }
    table.grid {
      width: 100%; border-collapse: collapse; margin: 0 0 10px;
    }
    table.grid th, table.grid td {
      border: 1px solid #64748b; padding: 5px 6px; vertical-align: middle;
      font-size: 9.5px;
    }
    table.grid th {
      background: #eef6f1; color: #143528; font-weight: 800; text-align: center;
    }
    table.grid td { text-align: center; }
    table.facility td.k {
      background: #f1f5f9; font-weight: 700; width: 18%; text-align: right;
    }
    table.facility td.v { width: 32%; text-align: right; }
    .contractor {
      text-align: justify; margin: 0 0 12px; padding: 8px 10px;
      border: 1px dashed #94a3b8; border-radius: 6px; font-size: 10.5px;
    }
    .signs {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
      margin-top: auto; page-break-inside: avoid;
    }
    .sign { text-align: center; }
    .sign .t { font-weight: 800; font-size: 11px; margin-bottom: 4px; }
    .sign .d { font-size: 10px; color: #334155; min-height: 28px; }
    .stamp {
      width: 64px; height: 64px; object-fit: contain; margin: 6px auto; display: block;
    }
    .stamp-box {
      width: 64px; height: 64px; margin: 6px auto; border: 1.5px dashed #94a3b8;
      border-radius: 999px; display: flex; align-items: center; justify-content: center;
      text-align: center; font-size: 8px; font-weight: 700; color: #475569; padding: 4px;
    }
    .sign-line {
      margin-top: 18px; border-top: 1px solid #64748b; padding-top: 3px;
      font-size: 9px; color: #475569;
    }
    .chamber {
      margin-top: 10px; border-top: 1px solid #cbd5e1; padding-top: 8px;
      display: grid; grid-template-columns: 70px 1fr; gap: 10px; align-items: center;
      page-break-inside: avoid;
    }
    .chamber img {
      width: 64px; height: 64px; border: 1px solid #e2e8f0; border-radius: 4px;
      background: #fff;
    }
    .chamber .note {
      font-size: 8.5px; color: #475569; line-height: 1.4;
    }
    .chamber .note strong { color: #1f4d3a; }
    @media print {
      @page { size: A4 portrait; margin: 8mm; }
      html, body {
        margin: 0 !important; padding: 0 !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      header, footer, .no-print { display: none !important; }
      .sheet { max-width: none; border-width: 1.5px; min-height: auto; }
      a[href]::after { content: none !important; }
    }
  </style>
</head>
<body>
  <div class="sheet">
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
      <div class="left meta">
        <div>رقم الشهادة</div>
        <div class="cert-no" dir="ltr">${esc(certNo)}</div>
        <div style="margin-top:6px">تاريخ إصدارها (ميلادي)</div>
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
          <th>المكتب المعد للدراسة التي تم الإشراف بناء عليها</th>
          <th>رقم تقرير الدراسة المرفق به المخططات</th>
          <th>تاريخ إعداد الدراسة</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(cert.study_office_name || officeName)}</td>
          <td dir="ltr">${esc(cert.study_report_number || '—')}</td>
          <td dir="ltr">${esc(cert.study_date ? completionCertificateDates(cert.study_date).gregorian : '—')}</td>
        </tr>
      </tbody>
    </table>

    <h3>ثانياً: بيانات المنشأة</h3>
    <table class="grid facility">
      <tr>
        <td class="k">مسمى المنشأة</td><td class="v">${esc(facility)}</td>
        <td class="k">المالك</td><td class="v">${esc(owner)}</td>
      </tr>
      <tr>
        <td class="k">النشاط</td><td class="v">${esc(cert.activity_label || '—')}</td>
        <td class="k">تصنيف النشاط</td><td class="v">${esc(cert.activity_classification || '—')}</td>
      </tr>
      <tr>
        <td class="k">الحي</td><td class="v">${esc(cert.district || client.district || '—')}</td>
        <td class="k">الشارع</td><td class="v">${esc(cert.street || client.street || '—')}</td>
      </tr>
      <tr>
        <td class="k">مساحة الأرض</td><td class="v">${esc(cert.land_area || '—')}${cert.land_area ? ' م²' : ''}</td>
        <td class="k">مكونات المبنى</td><td class="v">${esc(cert.building_components || '—')}</td>
      </tr>
      <tr>
        <td class="k">التصنيف الإنشائي للمبنى</td><td class="v">${esc(cert.building_structural_class || '—')}</td>
        <td class="k">وسيلة التواصل (المالك / المستثمر)</td><td class="v" dir="ltr">${esc(cert.owner_contact || client.phone || '—')}</td>
      </tr>
    </table>

    <p class="contractor">${contractorLine}</p>

    <div class="signs">
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
      <img src="${qrUrl}" alt="QR" width="64" height="64" />
      <div class="note">
        <strong>ختم التحقق الإلكتروني / الغرفة التجارية</strong><br/>
        ${esc(cert.chamber_footer_note || 'تم إصدار هذا الختم بناء على طلب المشترك والتحقق من بيانات العضوية عبر الغرفة التجارية / الخدمات الإلكترونية المعتمدة.')}
        <br/>مرجع الشهادة: <span dir="ltr">${esc(certNo)}</span>
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
