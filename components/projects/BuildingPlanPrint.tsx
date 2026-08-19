'use client';

import {
  getBuildingPlanGeneralInfo,
  formatYesNo,
  type BuildingPlanReportWithSpaceSafety,
} from '@/lib/projects/building-plan';
import { DEFAULT_COMPANY_PROFILE, loadCompanyProfile, type CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { BuildingPlanGeneralInfo } from '@/lib/types/project-reports';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(value: string | number | null | undefined): string {
  const normalized = String(value ?? '').trim();
  return normalized || '—';
}

function isolateLatin(value: string | number | null | undefined): string {
  const safe = esc(text(value));
  return safe.replace(/([A-Za-z][A-Za-z0-9 .\/-]*)/g, '<bdi class="latin-term" dir="ltr">$1</bdi>');
}

function cell(label: string, value: string | number | null | undefined): string {
  return `<td class="label">${isolateLatin(label)}</td><td class="value">${isolateLatin(value)}</td>`;
}

function yesNoCell(label: string, value: string | null | undefined): string {
  return `<td class="label">${isolateLatin(label)}</td><td class="yesno">${isolateLatin(formatYesNo(value))}</td>`;
}

function approvalValue(preferred: string | null | undefined, fallback: string | null | undefined): string {
  return text(preferred || fallback || '');
}

function optionalImage(source: string | null | undefined, className: string, alt: string): string {
  return source ? `<img class="${className}" src="${esc(source)}" alt="${esc(alt)}" />` : '';
}

function planInfoRows(report: BuildingPlanReportWithSpaceSafety, general: BuildingPlanGeneralInfo): string {
  const leftRows: Array<[string, string]> = [
    ['تصنيف الإشغال', report.occupancy_classification || ''],
    ['نوع البناء', report.building_type_code || ''],
    ['مساحة الموقع العام (م²)', report.total_site_area_m2 || general.land_area],
    ['عدد الأدوار', report.floors_description || general.floors_count],
    ['الارتفاع (م)', report.building_height_m || ''],
    ['عدد أدوار القبو', report.basement_floors_count || ''],
    ['العمق تحت الأرض (م)', report.underground_depth_m || ''],
    ['عدد المخارج', report.exits_count || ''],
    ['عدد السلالم', report.stairs_count || ''],
    ['عدد السلالم الكهربائية', report.escalators_count || ''],
    ['عدد المصاعد', report.elevators_count || ''],
  ];

  const rightRows: Array<[string, string]> = [
    ['المبنى عالي (High Rise)', formatYesNo(report.high_rise_building)],
    ['يوجد بهو (Atrium)', formatYesNo(report.atrium_exists)],
    ['المبنى تحت الأرض', formatYesNo(report.underground_building)],
    ['المبنى بلا نوافذ', formatYesNo(report.windowless_building)],
    ['يوجد تأريض كهربائي', formatYesNo(report.electrical_grounding)],
    ['يوجد حماية من الصواعق', formatYesNo(report.lightning_protection)],
    ['يوجد مولد احتياطي', formatYesNo(report.backup_generator)],
    ['إضافة/استثناء متطلبات بالكود', formatYesNo(report.sbc_code_exceptions)],
    ['يلزم فرق إطفاء وإنقاذ خاصة', formatYesNo(report.special_rescue_team_required)],
    ['—', ''],
    ['—', ''],
  ];

  return leftRows
    .map((left, index) => {
      const right = rightRows[index];
      return `<tr>${cell(left[0], left[1])}${yesNoCell(right[0], right[1])}</tr>`;
    })
    .join('');
}

export function buildBuildingPlanPrintHtml(
  client: ClientRecord,
  report: BuildingPlanReportWithSpaceSafety,
  general: BuildingPlanGeneralInfo,
  company: CompanyProfile = DEFAULT_COMPANY_PROFILE
): string {
  const officeName = approvalValue(company.legal_name || company.name, report.office_name);
  const commercialRegistration = approvalValue(company.commercial_register, report.commercial_registration);
  const membership = approvalValue(company.membership_id, report.engineering_membership_no);
  const engineer = approvalValue(report.engineer_representative || client.assigned_engineer, '');
  const reportDate = text(report.report_date || report.certification_date);
  const city = text(report.manual_city || general.city);
  const district = text(report.manual_district || general.district);
  const location = [city, district, general.street !== '—' ? general.street : ''].filter((item) => item && item !== '—').join(' — ') || '—';
  const permitNumber = report.building_permit_number || client.license_number || '—';
  const permitDate = report.building_permit_date || '—';
  const officeLogo = optionalImage(company.logo_url, 'company-logo', 'شعار الشركة');
  const officeStamp = optionalImage(company.stamp_url, 'company-stamp', 'ختم الشركة');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>تقرير معلومات المخطط — ${esc(general.business_name)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 210mm; min-height: 0; margin: 0; padding: 0; background: #fff; color: #152012; font-family: Tahoma, "Segoe UI", Arial, sans-serif; font-size: 9px; }
    .sheet { width: 210mm; height: 297mm; margin: 0; padding: 7.5mm 9mm 7mm; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
    .doc-head { display: grid; grid-template-columns: 44mm 1fr 44mm; align-items: center; min-height: 22mm; border-top: .8px solid #5a7d47; border-bottom: 1.2px solid #5a7d47; padding: 1.5mm 0 2mm; flex: 0 0 auto; }
    .brand-mark { min-height: 17mm; display: flex; align-items: center; justify-content: flex-start; }
    .company-logo { max-width: 40mm; max-height: 17mm; object-fit: contain; }
    .company-fallback { color: #4f7e56; font-size: 10.5px; font-weight: 800; line-height: 1.35; }
    .doc-title { text-align: center; }
    .doc-title h1 { margin: 0; font-size: 14.5px; line-height: 1.22; color: #1e3218; }
    .doc-title p { margin: 1px 0 0; color: #5b6d62; font-size: 8.4px; letter-spacing: .05px; direction: ltr; unicode-bidi: isolate; }
    .doc-status { text-align: left; color: #4e6b3b; font-size: 8px; font-weight: 700; }
    .doc-status span { display: inline-block; border: 1px solid #94b772; padding: 1.15mm 2.3mm; background: #f2f8eb; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: .55px solid #557044; vertical-align: middle; line-height: 1.2; overflow-wrap: anywhere; }
    th { padding: 1.45mm 1.8mm; color: #fff; background: #638b4e; text-align: center; font-size: 9.4px; font-weight: 800; }
    td { padding: 1.22mm 1.65mm; }
    .label { width: 17%; background: #e3efd5; font-weight: 700; color: #314923; font-size: 8.3px; }
    .value { width: 33%; color: #172212; font-size: 8.55px; }
    .yesno { width: 33%; text-align: center; color: #172212; font-size: 8.7px; font-weight: 700; }
    .latin-term { direction: ltr; unicode-bidi: isolate; display: inline-block; text-align: left; }
    .building { margin-top: 3.2mm; }
    .building .label { width: 15%; }
    .building .value { width: 35%; }
    .section-title { margin: 0 0 1.35mm; padding: 1.35mm 2.2mm; background: #638b4e; color: #fff; font-size: 9.5px; font-weight: 800; text-align: center; border: .55px solid #557044; }
    .plan-info { margin-top: 3.2mm; }
    .plan-info tr { height: 6.1mm; }
    .plan-info .label { width: 18%; }
    .plan-info .value, .plan-info .yesno { width: 32%; }
    .safety { margin-top: 3.2mm; }
    .safety td { font-size: 8px; padding-top: 1.35mm; padding-bottom: 1.35mm; }
    .safety .label { width: 18%; }
    .safety .yesno { width: 32%; }
    .safety .wide { width: 82%; }
    .approval { margin-top: auto; padding-top: 4.5mm; }
    .approval .section-title { background: #635bdb; border-color: #4e47b8; }
    .approval .label { width: 18%; }
    .approval .value { width: 32%; }
    .approval tr { height: 5.7mm; }
    .approval th, .approval td { border-color: #596d4a; }
    .approval-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; min-height: 75mm; border: .55px solid #557044; border-top: 0; background: #fbfdf8; }
    .signature-box { padding: 3mm 2.5mm; text-align: center; border-inline-start: .55px solid #557044; font-size: 8.4px; display: flex; flex-direction: column; justify-content: space-between; }
    .signature-box:first-child { border-inline-start: 0; }
    .sign-line { margin-top: 38mm; border-top: .55px solid #697a61; padding-top: 1.25mm; }
    .company-stamp { max-width: 31mm; max-height: 31mm; object-fit: contain; margin: 0 auto; }
    .stamp-fallback { width: 29mm; height: 29mm; margin: 0 auto; border: 1.2px dashed #635bdb; border-radius: 50%; display: grid; place-items: center; color: #635bdb; font-size: 7px; line-height: 1.1; padding: 1.8mm; }
    .no-print { margin: 0; text-align: center; }
    .no-print button { padding: 7px 12px; font-size: 12px; }
    @media screen {
      body { background: #e5e7eb; padding: 10px 0 16px; }
      .sheet { margin: 0 auto; box-shadow: 0 8px 20px rgba(0,0,0,.12); }
    }
    @media print {
      html, body { width: 210mm; height: auto; min-height: 0; overflow: visible; background: #fff; }
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
      .sheet { width: 210mm; height: 297mm; min-height: 0; max-height: none; margin: 0; padding: 7.5mm 9mm 7mm; overflow: hidden; break-after: avoid-page; page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">طباعة / حفظ PDF</button></div>
  <main class="sheet">
    <header class="doc-head">
      <div class="brand-mark">${officeLogo || `<div class="company-fallback">${esc(officeName)}</div>`}</div>
      <div class="doc-title"><h1>تقرير معلومات المخطط</h1><p>Building Plan Information Report</p></div>
      <div class="doc-status"><span>${esc(text(report.status))}</span></div>
    </header>

    <section class="building">
      <div class="section-title">بيانات المنشأة</div>
      <table>
        <tr>${cell('اسم المنشأة / المبنى', general.business_name)}${cell('اسم المالك', general.owner_name)}</tr>
        <tr>${cell('نوع النشاط', general.activity_type_label)}${cell('الموقع', location)}</tr>
        <tr>${cell('العنوان الوطني', general.national_address)}${cell('رقم القطعة', general.plot_number)}</tr>
        <tr>${cell('رقم رخصة البناء', permitNumber)}${cell('تاريخ رخصة البناء', permitDate)}</tr>
      </table>
    </section>

    <section class="plan-info">
      <div class="section-title">معلومات المخطط</div>
      <table>
        ${planInfoRows(report, general)}
      </table>
      <div class="safety">
        <div class="section-title">أنظمة السلامة والاعتماد</div>
        <table>
          <tr>${yesNoCell('نظام إنذار الحريق', report.fire_alarm_system)}${yesNoCell('نظام رش آلي', report.sprinkler_system)}</tr>
          ${report.derived_space_safety_occupants ? `<tr><td class="label">الشاغلون التقديريون</td><td class="value">${isolateLatin(report.derived_space_safety_occupants)}</td><td class="label">مصدر البيانات</td><td class="value">المساحات وأنظمة السلامة</td></tr>` : ''}
          ${report.derived_space_safety_quantities ? `<tr><td class="label">ملخص كميات السلامة</td><td class="wide" colspan="3">${isolateLatin(report.derived_space_safety_quantities)}</td></tr>` : ''}
          <tr><td class="label">${isolateLatin('متطلبات SBC')}</td><td class="wide" colspan="3">${isolateLatin(report.sbc_requirements)}</td></tr>
          <tr><td class="label">أبواب ومخارج الطوارئ</td><td class="wide" colspan="3">${isolateLatin(report.emergency_exits_doors)}</td></tr>
          <tr><td class="label">حالة اعتماد المخطط</td><td class="value">${isolateLatin(report.plan_approval_status || report.status)}</td><td class="label">ملاحظات المعالجة الفنية</td><td class="value">${isolateLatin(report.technical_inspection_notes)}</td></tr>
        </table>
      </div>
    </section>

    <footer class="approval">
      <div class="section-title">اعتماد المكتب الاستشاري</div>
      <table>
        <tr>${cell('اسم المكتب', officeName)}${cell('السجل التجاري', commercialRegistration)}</tr>
        <tr>${cell('ممثل المكتب / المهندس', engineer)}${cell('رقم العضوية الهندسية', membership)}</tr>
        <tr>${cell('التاريخ', reportDate)}${cell('حالة الاعتماد', report.plan_approval_status || report.status)}</tr>
      </table>
      <div class="approval-grid">
        <div class="signature-box"><span>توقيع المهندس</span><span class="sign-line">${esc(engineer)}</span></div>
        <div class="signature-box"><span>الختم</span>${officeStamp || `<span class="stamp-fallback">${esc(text(company.stamp_text || officeName))}</span>`}<span>${esc(officeName)}</span></div>
        <div class="signature-box"><span>اعتماد المكتب</span><span class="sign-line">........................</span></div>
      </div>
    </footer>
  </main>
</body>
</html>`;
}

export async function printBuildingPlanReport(client: ClientRecord, report: BuildingPlanReportWithSpaceSafety) {
  const general = getBuildingPlanGeneralInfo(client);
  const company = await loadCompanyProfile();
  const html = buildBuildingPlanPrintHtml(client, report, general, company);
  const { openDocumentPreview } = await import('@/lib/print/document-preview');
  openDocumentPreview({
    title: `تقرير معلومات المخطط — ${client.client_code}`,
    html,
    fileName: `building-plan-${client.client_code}`,
  });
}

export async function exportBuildingPlanReport(client: ClientRecord, report: BuildingPlanReportWithSpaceSafety) {
  const general = getBuildingPlanGeneralInfo(client);
  const company = await loadCompanyProfile();
  const html = buildBuildingPlanPrintHtml(client, report, general, company);
  const { downloadHtmlDocument } = await import('@/lib/print/document-preview');
  downloadHtmlDocument(html, `building-plan-${client.client_code}`);
}
