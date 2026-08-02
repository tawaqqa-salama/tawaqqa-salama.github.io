'use client';

/**
 * خطاب تسليم دراسة السلامة — قالب طباعة A4 رسمي (يُعاد بناؤه بالكامل).
 * لا تعتمد على delivery.hijri_date المخزّن؛ يُحسب الهجري/الميلادي من تاريخ التسليم فقط.
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { EngineeringDeliveryReport, ProjectEngineeringData } from '@/lib/types/project-reports';
import {
  extractCityFromAddressee,
  formatCopyToLines,
  formatGregorianDate,
  formatHijriDate,
  getFacilitySnapshotForLetter,
  resolveOfficeCivilDefenseLicense,
  toSafetySystemMatrix,
} from '@/lib/projects/safety-delivery-letter';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yesNo(active: boolean): string {
  return active ? 'نعم' : 'لا';
}

function formatPermitDate(raw: string): string {
  const match = String(raw).match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (match) return formatGregorianDate(`${match[1]}-${match[2]}-${match[3]}`);
  return raw;
}

export function buildSafetyDeliveryLetterHtml(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  delivery: EngineeringDeliveryReport;
  company: CompanyProfile;
}): string {
  const { client, data, delivery, company } = params;
  const facility = getFacilitySnapshotForLetter(client, data);

  const deliveryDate = delivery.delivery_date || new Date().toISOString().slice(0, 10);
  // فصل صارم: الميلادي لاتيني، الهجري نص عربي فقط — لا خلط
  const gregorian = formatGregorianDate(deliveryDate);
  const hijri = formatHijriDate(deliveryDate);

  const city =
    delivery.civil_defense_city?.trim() ||
    extractCityFromAddressee(delivery.delivered_to) ||
    (facility.city !== '—' ? facility.city : '') ||
    company.city ||
    'الرياض';

  const addressee =
    delivery.delivered_to?.trim() ||
    `سعادة مدير الإدارة العامة للدفاع المدني بمحافظة ${city}`;

  const copyLines = formatCopyToLines(facility.ownerName, delivery.copy_to);
  const officeLicense = resolveOfficeCivilDefenseLicense(company);
  const systems = toSafetySystemMatrix(delivery.safety_scope);

  const logo = company.logo_url
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="شعار" />`
    : `<div class="logo-fallback">${esc(company.name)}</div>`;
  const stamp = company.stamp_url
    ? `<img class="stamp" src="${esc(company.stamp_url)}" alt="ختم" />`
    : `<div class="stamp-box">${esc(company.stamp_text || company.name)}</div>`;

  const scopeRows = systems
    .map(
      (sys) => `<tr>
        <td class="sys">${esc(sys.name)}</td>
        <td class="c">${yesNo(sys.newDesign)}</td>
        <td class="c">${yesNo(sys.modified)}</td>
        <td class="c">${yesNo(sys.approved)}</td>
        <td class="c">${yesNo(sys.notRequired)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>خطاب تسليم دراسة السلامة — ${esc(facility.facilityName)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #111;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 9.5px; line-height: 1.35;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    header, footer { display: none !important; }
    .sheet { width: 100%; max-width: 190mm; margin: 0 auto; }
    .top {
      display: grid;
      grid-template-columns: 1fr 1.25fr 1fr;
      gap: 6px;
      align-items: start;
      border-bottom: 2px solid #1f4d3a;
      padding-bottom: 6px;
      margin-bottom: 7px;
    }
    .meta-box { font-size: 8.5px; line-height: 1.45; }
    .meta-box div { margin: 0 0 2px; }
    .center { text-align: center; }
    .logo, .logo-fallback {
      width: 48px; height: 48px; object-fit: contain; margin: 0 auto 2px; display: block;
    }
    .logo-fallback {
      border: 1px solid #cbd5e1; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 8px; font-weight: 800; color: #1f4d3a; padding: 3px;
    }
    .brand { margin: 0; font-size: 12px; font-weight: 900; color: #1f4d3a; }
    .doc-title { margin: 2px 0 0; font-size: 13px; font-weight: 900; }
    .left { text-align: left; }
    .addressee {
      margin: 4px 0 6px; padding: 5px 7px;
      border: 1px solid #cbd5e1; border-radius: 5px; background: #f8fafc;
    }
    .addressee p { margin: 0 0 2px; }
    .preamble { margin: 0 0 6px; text-align: justify; }
    h3 {
      margin: 0 0 3px; font-size: 10px; color: #1f4d3a;
      border-right: 3px solid #1f4d3a; padding-right: 5px;
    }
    table.grid, table.scope {
      width: 100%; border-collapse: collapse; margin: 0 0 6px;
    }
    table.grid td, table.scope th, table.scope td {
      border: 1px solid #64748b; padding: 3px 4px; vertical-align: middle;
    }
    table.grid td.k { width: 22%; background: #f1f5f9; font-weight: 700; }
    table.scope th {
      background: #f3f4f6; color: #111; font-size: 7.5px; font-weight: 800;
      text-align: center; line-height: 1.25;
    }
    table.scope td.sys { font-weight: 800; width: 22%; text-align: right; }
    table.scope td.c { text-align: center; width: 19.5%; font-weight: 800; }
    .notes {
      border: 1px solid #cbd5e1; border-radius: 5px; padding: 4px 6px;
      margin-bottom: 6px; min-height: 28px;
    }
    .signs {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
      margin-top: 4px; page-break-inside: avoid;
    }
    .sign { text-align: center; }
    .sign .t { font-weight: 800; margin-bottom: 2px; font-size: 9px; }
    .sign .d { font-size: 8px; color: #334155; line-height: 1.3; }
    .stamp { width: 52px; height: 52px; object-fit: contain; margin: 2px auto; display: block; }
    .stamp-box {
      width: 52px; height: 52px; margin: 2px auto; border: 1.5px dashed #94a3b8;
      border-radius: 999px; display: flex; align-items: center; justify-content: center;
      text-align: center; font-size: 7px; font-weight: 700; color: #475569; padding: 3px;
    }
    .sign-line {
      margin-top: 14px; border-top: 1px solid #64748b; padding-top: 2px;
      font-size: 8px; color: #475569;
    }
    @media print {
      @page { size: A4 portrait; margin: 10mm; }
      html, body {
        margin: 0 !important; padding: 0 !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      header, footer, .no-print { display: none !important; }
      .sheet { max-width: none; }
      a[href]::after { content: none !important; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="meta-box">
        <div><strong>ترخيص المكتب لدى الدفاع المدني</strong></div>
        <div><strong dir="ltr">${esc(officeLicense)}</strong></div>
        <div>الرقم الصادر: <strong>${esc(delivery.outgoing_number || data.technical_report.outgoing_number || 'تحت الإجراء')}</strong></div>
        <div>التاريخ الهجري: <strong>${esc(hijri)}</strong></div>
        <div>التاريخ الميلادي: <strong dir="ltr">${esc(gregorian)}</strong></div>
      </div>
      <div class="center">
        ${logo}
        <p class="brand">${esc(company.legal_name || company.name)}</p>
        <h1 class="doc-title">خطاب تسليم دراسة السلامة</h1>
        <div style="font-size:8px;color:#64748b">وفق كود البناء السعودي SBC واشتراطات NFPA</div>
      </div>
      <div class="left meta-box">
        <div>المرفقات: <strong>${esc(delivery.attachments_count ?? 1)}</strong></div>
        <div>س.ت: ${esc(company.commercial_register || 'تحت الإجراء')}</div>
        <div>جوال المكتب: ${esc(delivery.manager_phone || company.phone || '—')}</div>
        <div>المدينة: <strong>${esc(city)}</strong></div>
      </div>
    </div>

    <div class="addressee">
      <p><strong>${esc(addressee)}</strong></p>
      <p>السلام عليكم ورحمة الله وبركاته،،،</p>
      ${copyLines.map((line) => `<p>${esc(line)}</p>`).join('')}
    </div>

    <p class="preamble">
      إشارةً إلى طلب دراسة أنظمة السلامة والوقاية من الحريق للمنشأة الموضحة بياناتها أدناه،
      نفيد سعادتكم بأنه قد تم إنجاز الدراسة الهندسية وفق متطلبات <strong>كود البناء السعودي (SBC)</strong>
      واشتراطات <strong>الجمعية الوطنية للحماية من الحرائق (NFPA)</strong> والأنظمة المعتمدة لدى الدفاع المدني،
      ونرفع لسعادتكم هذا الخطاب لتسليم الدراسة واعتمادها وفق الإجراءات النظامية.
    </p>

    <h3>أولاً: بيانات المنشأة</h3>
    <table class="grid">
      <tr>
        <td class="k">مسمى المنشأة</td><td>${esc(facility.facilityName)}</td>
        <td class="k">المالك</td><td>${esc(facility.ownerName)}</td>
      </tr>
      <tr>
        <td class="k">النشاط</td><td>${esc(facility.activityLabel)}</td>
        <td class="k">تصنيف النشاط / الإشغال</td><td>${esc(facility.occupancyLabel)}</td>
      </tr>
      <tr>
        <td class="k">مساحة الموقع العام</td><td>${esc(facility.landArea)} م²</td>
        <td class="k">مساحة البناء</td><td>${esc(facility.buildingArea)} م²</td>
      </tr>
      <tr>
        <td class="k">عدد الأدوار</td><td>${esc(facility.floorsCount)}</td>
        <td class="k">تصنيف المبنى</td><td>${esc(facility.buildingStatus)}</td>
      </tr>
      <tr>
        <td class="k">رقم رخصة البناء</td><td>${esc(facility.permitNumber)}</td>
        <td class="k">تاريخ الرخصة</td><td>${esc(formatPermitDate(facility.permitDate))}</td>
      </tr>
      <tr>
        <td class="k">وسيلة التواصل</td><td dir="ltr">${esc(facility.phone)}</td>
        <td class="k">الموقع</td><td>${esc(facility.location)}</td>
      </tr>
    </table>

    <h3>ثانياً: الأعمال التي تمت في الدراسة</h3>
    <table class="scope">
      <thead>
        <tr>
          <th>النظام</th>
          <th>تم تصميم النظام من جديد</th>
          <th>تم التعديل على النظام الموجود</th>
          <th>تم اعتماد النظام الموجود</th>
          <th>لا يتطلب وجود النظام</th>
        </tr>
      </thead>
      <tbody>${scopeRows}</tbody>
    </table>

    <h3>ثالثاً: ملاحظات</h3>
    <div class="notes">${esc(delivery.notes || delivery.study_summary || 'لا يوجد')}</div>

    <div class="signs">
      <div class="sign">
        <div class="t">ختم الغرفة / المكتب</div>
        ${stamp}
        <div class="sign-line">الختم الرسمي</div>
      </div>
      <div class="sign">
        <div class="t">مهندس السلامة المعتمد</div>
        <div class="d">
          ${esc(delivery.safety_engineer_name || '—')}<br/>
          ${esc(delivery.safety_engineer_title || 'مهندس سلامة معتمد')}<br/>
          ${esc(delivery.safety_engineer_phone || '—')}
        </div>
        <div class="sign-line">التوقيع</div>
      </div>
      <div class="sign">
        <div class="t">مدير المكتب</div>
        <div class="d">
          ${esc(delivery.manager_name || '—')}<br/>
          ${esc(delivery.manager_title || 'مدير المكتب')}<br/>
          ${esc(delivery.manager_phone || company.phone || '—')}
        </div>
        <div class="sign-line">التوقيع</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printSafetyDeliveryLetter(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  delivery: EngineeringDeliveryReport;
  company: CompanyProfile;
}) {
  // بناء HTML وطباعة خارج المسار الحرج — لا html2canvas / لا rasterization
  const schedule = (cb: () => void) => {
    const ric = (window as Window & { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (typeof ric === 'function') ric(cb, { timeout: 400 });
    else setTimeout(cb, 0);
  };

  schedule(() => {
    const html = buildSafetyDeliveryLetterHtml(params);
    void import('@/lib/print/document-preview').then(({ openDocumentPreview }) => {
      openDocumentPreview({
        title: `خطاب تسليم دراسة — ${params.client.business_name || params.client.name}`,
        html,
        fileName: `safety-delivery-${params.client.client_code || params.client.id}`,
      });
    });
  });
}
