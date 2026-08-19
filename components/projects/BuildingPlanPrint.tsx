'use client';

import { formatYesNo, getBuildingPlanGeneralInfo } from '@/lib/projects/building-plan';
import { DEFAULT_COMPANY_PROFILE, loadCompanyProfile, type CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { BuildingPlanGeneralInfo, BuildingPlanReport } from '@/lib/types/project-reports';

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

function optionCells(value: string | null | undefined, header = false): string {
  if (header) return '<td class="choice yes">نعم</td><td class="choice no">لا</td>';
  const normalized = formatYesNo(value);
  if (normalized === 'نعم') return '<td class="choice yes">نعم</td><td class="choice no"></td>';
  if (normalized === 'لا') return '<td class="choice yes"></td><td class="choice no">لا</td>';
  return '<td class="choice yes"></td><td class="choice no">—</td>';
}

function projectInfoRows(client: ClientRecord, report: BuildingPlanReport, general: BuildingPlanGeneralInfo): string {
  const permitNumber = report.building_permit_number || client.license_number || '—';
  const permitDate = report.building_permit_date_hijri || report.building_permit_date || '—';
  const location = [general.city, general.district].filter((item) => item && item !== '—').join(' — ') || '—';
  const districtStreet = [general.district, general.street].filter((item) => item && item !== '—').join(' — ') || '—';

  return `
    <table class="project-info">
      <tr class="project-main">
        <td class="project-name"><strong>اسم المبنى:</strong><span>${isolateLatin(general.business_name)}</span></td>
        <td class="project-activity">${isolateLatin(general.activity_type_label)}</td>
        <td class="project-permit"><strong>رخصة البناء</strong><span>${isolateLatin(permitNumber)}</span></td>
        <td class="project-date"><strong>تاريخ:</strong><span>${isolateLatin(permitDate)}</span></td>
      </tr>
      <tr class="project-detail">
        <td class="project-location"><strong>الموقع:</strong> ${isolateLatin(location)}</td>
        <td class="project-city"><strong>المدينة:</strong> ${isolateLatin(general.city)}<br/><strong>رقم القطعة:</strong> ${isolateLatin(general.plot_number)}</td>
        <td class="project-address" colspan="2"><strong>الحي والشارع:</strong> ${isolateLatin(districtStreet)}<br/><strong>العنوان الوطني:</strong> ${isolateLatin(general.national_address)}</td>
      </tr>
    </table>`;
}

function planInfoRows(report: BuildingPlanReport, general: BuildingPlanGeneralInfo): string {
  const rows: Array<{ label: string; value: string; booleanLabel?: string; booleanValue?: string }> = [
    { label: 'تصنيف الإشغال', value: report.occupancy_classification || '', booleanLabel: '', booleanValue: '__header__' },
    { label: 'نوع البناء', value: report.building_type_code || '', booleanLabel: 'المبنى عالي (High Rise)', booleanValue: report.high_rise_building },
    { label: 'مساحة الموقع العام (م²)', value: report.total_site_area_m2 || general.land_area, booleanLabel: 'يوجد بهو (Atrium)', booleanValue: report.atrium_exists },
    { label: 'عدد الأدوار', value: report.floors_description || general.floors_count, booleanLabel: 'المبنى تحت الأرض', booleanValue: report.underground_building },
    { label: 'الارتفاع (م)', value: report.building_height_m || '', booleanLabel: 'المبنى بلا نوافذ', booleanValue: report.windowless_building },
    { label: 'عدد أدوار القبو', value: report.basement_floors_count || '', booleanLabel: 'يوجد نظام تأريض كهربائي', booleanValue: report.electrical_grounding },
    { label: 'العمق تحت الأرض', value: report.underground_depth_m || '', booleanLabel: 'يوجد نظام حماية من الصواعق', booleanValue: report.lightning_protection },
    { label: 'عدد المخارج', value: report.exits_count || '', booleanLabel: 'يوجد مولد احتياطي', booleanValue: report.backup_generator },
    { label: 'عدد السلالم', value: report.stairs_count || '', booleanLabel: 'تم إضافة أو استثناء متطلبات بالكود', booleanValue: report.sbc_code_exceptions },
    { label: 'عدد السلالم الكهربائية', value: report.escalators_count || '', booleanLabel: 'يلزم توفير فرق إطفاء وإنقاذ خاصة', booleanValue: report.special_rescue_team_required },
    { label: 'عدد المصاعد', value: report.elevators_count || '', booleanLabel: '', booleanValue: '' },
  ];

  return rows
    .map((row, index) => {
      const choices = index === 0 ? optionCells('', true) : optionCells(row.booleanValue);
      return `<tr><td class="plan-label">${isolateLatin(row.label)}</td><td class="plan-value">${isolateLatin(row.value)}</td><td class="plan-bool-label">${isolateLatin(row.booleanLabel || '')}</td>${choices}</tr>`;
    })
    .join('');
}

function officeRows(client: ClientRecord, report: BuildingPlanReport, company: CompanyProfile): string {
  const officeName = company.legal_name || company.name || report.office_name || '—';
  const engineer = report.engineer_representative || client.assigned_engineer || '—';
  const registration = company.commercial_register || report.commercial_registration || '—';
  const membership = company.membership_id || report.engineering_membership_no || '—';
  const date = report.certification_date || report.report_date || '—';
  const stamp = company.stamp_url
    ? `<img class="office-stamp" src="${esc(company.stamp_url)}" alt="ختم المكتب" />`
    : '<div class="stamp-fallback">—</div>';

  return `
    <table class="office-table">
      <tr class="office-head"><th>اسم المكتب</th><th>رقم السجل التجاري</th><th>الختم</th></tr>
      <tr><td>${isolateLatin(officeName)}</td><td>${isolateLatin(registration)}</td><td class="stamp-cell" rowspan="3">${stamp}</td></tr>
      <tr class="office-head"><th>ممثل المكتب</th><th>رقم العضوية الهندسية</th></tr>
      <tr><td>${isolateLatin(engineer)}</td><td>${isolateLatin(membership)}</td></tr>
      <tr class="office-head"><th>التاريخ</th><td>${isolateLatin(date)}</td><th>التوقيع</th></tr>
    </table>`;
}

function footerDetails(company: CompanyProfile): string {
  const lineOne = [company.legal_name || company.name, company.address, company.city].filter(Boolean).join(' — ') || '—';
  const lineTwo = [company.phone ? `جوال الإدارة: ${company.phone}` : '', company.fax ? `فاكس: ${company.fax}` : '', company.email || ''].filter(Boolean).join(' — ') || '—';
  return `<footer class="report-footer"><div>${isolateLatin(lineOne)}</div><div>${isolateLatin(lineTwo)}</div></footer>`;
}

export function buildBuildingPlanPrintHtml(
  client: ClientRecord,
  report: BuildingPlanReport,
  general: BuildingPlanGeneralInfo,
  company: CompanyProfile = DEFAULT_COMPANY_PROFILE
): string {
  const logo = company.logo_url
    ? `<img class="company-logo" src="${esc(company.logo_url)}" alt="شعار المكتب" />`
    : `<div class="company-wordmark">${isolateLatin(company.name || '—')}</div>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>معلومات المخطط — ${esc(general.business_name)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 210mm; min-height: 0; margin: 0; padding: 0; background: #fff; color: #101010; font-family: Tahoma, Arial, sans-serif; font-size: 8.4px; }
    .sheet { width: 210mm; height: 297mm; margin: 0; padding: 7mm 7.7mm 7mm 10.7mm; overflow: hidden; background: #fff; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { border: .5px solid #0e0e0e; vertical-align: middle; overflow-wrap: anywhere; }
    .latin-term { direction: ltr; unicode-bidi: isolate; display: inline-block; text-align: left; }
    .reference-header { height: 28.58mm; position: relative; direction: ltr; display: flex; align-items: flex-start; }
    .brand { width: 54mm; height: 18mm; display: flex; align-items: flex-start; justify-content: flex-start; padding-top: 1.5mm; }
    .company-logo { max-width: 48mm; max-height: 17mm; object-fit: contain; }
    .company-wordmark { color: #267154; font-size: 11px; font-weight: 800; line-height: 1.25; }
    .ornament { position: absolute; left: 0; right: 0; bottom: 9.1mm; height: 4mm; border-bottom: .5px solid #408469; }
    .project-info { margin-top: 1.2mm; }
    .project-main td { height: 14.3mm; background: #92d050; text-align: center; font-size: 10px; font-weight: 700; }
    .project-main span { display: block; margin-top: 1mm; font-size: 9.4px; }
    .project-name { width: 33.2%; text-align: right !important; padding: 1.6mm 2mm; }
    .project-activity { width: 27.45%; }
    .project-permit { width: 14.65%; }
    .project-date { width: 24.7%; }
    .project-detail td { height: 18.35mm; background: #fff; padding: 1.5mm 2.2mm; font-size: 9.6px; font-weight: 700; line-height: 1.65; vertical-align: top; }
    .project-location { width: 33.2%; }
    .project-city { width: 27.4%; text-align: center; }
    .project-address { width: 39.4%; }
    .plan-table { margin-top: 6.75mm; }
    .plan-table td { height: 8.12mm; padding: .35mm 1.2mm; font-size: 10.2px; font-weight: 700; white-space: nowrap; }
    .plan-table tr:nth-child(odd) td { background: #92d050; }
    .plan-label { width: 26.2%; text-align: right; }
    .plan-value { width: 26.47%; text-align: center; font-size: 11px !important; }
    .plan-bool-label { width: 28.13%; text-align: right; }
    .choice { width: 9.6%; text-align: center; }
    .office-section { margin-top: 12.1mm; }
    .office-table { width: calc(100% + 1mm); position: relative; right: -1.04mm; }
    .office-table th, .office-table td { padding: .25mm 1.2mm; font-size: 9.6px; height: 3.1mm; }
    .office-table .office-head th, .office-table .office-head td { background: #92d050; font-size: 10px; font-weight: 800; }
    .office-table th:nth-child(1), .office-table td:nth-child(1) { width: 34.7%; }
    .office-table th:nth-child(2), .office-table td:nth-child(2) { width: 32.585%; text-align: center; }
    .office-table th:nth-child(3), .office-table td:nth-child(3) { width: 32.715%; text-align: center; }
    .stamp-cell { height: 9.3mm; padding: .5mm !important; position: relative; overflow: visible; }
    .office-stamp { display: block; max-width: 30mm; max-height: 22mm; margin: 0 auto; object-fit: contain; }
    .stamp-fallback { width: 100%; height: 13.3mm; margin: 0; border: 0; color: #111; font-size: 10px; display: grid; place-items: center; text-align: center; padding: 0; }
    .report-footer { margin-top: 53.75mm; border-top: 1px solid #3c846c; padding-top: 1.8mm; color: #3a6d5c; direction: rtl; font-size: 9.2px; font-weight: 700; line-height: 1.45; text-align: right; }
    .no-print { margin: 0; text-align: center; }
    .no-print button { padding: 7px 12px; font-size: 12px; }
    @media screen { body { background: #e5e7eb; padding: 10px 0 16px; } .sheet { margin: 0 auto; box-shadow: 0 8px 20px rgba(0,0,0,.12); } }
    @media print { html, body { width: 210mm; height: auto; min-height: 0; overflow: visible; background: #fff; } body { margin: 0; padding: 0; } .no-print { display: none !important; } .sheet { width: 210mm; height: 297mm; min-height: 0; max-height: none; margin: 0; padding: 7mm 7.7mm 7mm 10.7mm; overflow: hidden; break-after: avoid-page; page-break-after: avoid; } }
  </style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">طباعة / حفظ PDF</button></div>
  <main class="sheet">
    <header class="reference-header"><div class="brand">${logo}</div><div class="ornament"></div></header>
    ${projectInfoRows(client, report, general)}
    <section class="plan-table"><table>${planInfoRows(report, general)}</table></section>
    <section class="office-section">${officeRows(client, report, company)}</section>
    ${footerDetails(company)}
  </main>
</body>
</html>`;
}

export async function printBuildingPlanReport(client: ClientRecord, report: BuildingPlanReport) {
  const general = getBuildingPlanGeneralInfo(client);
  const company = await loadCompanyProfile();
  const html = buildBuildingPlanPrintHtml(client, report, general, company);
  const { openDocumentPreview } = await import('@/lib/print/document-preview');
  openDocumentPreview({
    title: `معلومات المخطط — ${client.client_code}`,
    html,
    fileName: `building-plan-${client.client_code}`,
  });
}

export async function exportBuildingPlanReport(client: ClientRecord, report: BuildingPlanReport) {
  const general = getBuildingPlanGeneralInfo(client);
  const company = await loadCompanyProfile();
  const html = buildBuildingPlanPrintHtml(client, report, general, company);
  const { downloadHtmlDocument } = await import('@/lib/print/document-preview');
  downloadHtmlDocument(html, `building-plan-${client.client_code}`);
}
