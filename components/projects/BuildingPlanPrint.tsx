'use client';

import { PLATFORM_NAME } from '@/lib/constants/branding';
import { getBuildingPlanGeneralInfo, formatYesNo } from '@/lib/projects/building-plan';
import type { ClientRecord } from '@/lib/types/client';
import type { BuildingPlanGeneralInfo, BuildingPlanReport } from '@/lib/types/project-reports';

function esc(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildBuildingPlanPrintHtml(
  client: ClientRecord,
  report: BuildingPlanReport,
  general: BuildingPlanGeneralInfo
): string {
  const rows: [string, string, string?][] = [
    ['تصنيف الإشغال', report.occupancy_classification || '—', ''],
    ['نوع البناء', report.building_type_code || '—', ''],
    ['المبنى عالي', '—', formatYesNo(report.high_rise_building)],
    ['مساحة الموقع العام', report.total_site_area_m2 || general.land_area, ''],
    ['يوجد بهو', '—', formatYesNo(report.atrium_exists)],
    ['عدد الأدوار', report.floors_description || general.floors_count, ''],
    ['المبنى تحت الأرض', '—', formatYesNo(report.underground_building)],
    ['الارتفاع', report.building_height_m ? `${report.building_height_m} m` : '—', ''],
    ['المبنى بلا نوافذ', '—', formatYesNo(report.windowless_building)],
    ['عدد أدوار القبو', report.basement_floors_count || '0', ''],
    ['نظام تأريض كهربائي', '—', formatYesNo(report.electrical_grounding)],
    ['العمق تحت الأرض', report.underground_depth_m ? `${report.underground_depth_m} m` : '0', ''],
    ['حماية من الصواعق', '—', formatYesNo(report.lightning_protection)],
    ['عدد المخارج', report.exits_count || '—', ''],
    ['مولد احتياطي', '—', formatYesNo(report.backup_generator)],
    ['عدد السلالم', report.stairs_count || '—', ''],
    ['استثناءات الكود', '—', formatYesNo(report.sbc_code_exceptions)],
    ['عدد السلالم الكهربائية', report.escalators_count || '0', ''],
    ['فرق إطفاء خاصة', '—', formatYesNo(report.special_rescue_team_required)],
    ['عدد المصاعد', report.elevators_count || '0', ''],
    ['نظام إنذار', '—', formatYesNo(report.fire_alarm_system)],
    ['رش آلي', '—', formatYesNo(report.sprinkler_system)],
  ];

  const engineeringRows = rows
    .map(
      ([label, value, yn]) => `<tr>
        <td class="lbl">${esc(label)}</td>
        <td>${esc(value)}</td>
        ${yn !== undefined ? `<td class="yn">${esc(yn)}</td>` : '<td></td>'}
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/>
<title>تقرير معلومات المخطط</title>
<style>
body{font-family:'Segoe UI',Tahoma,sans-serif;margin:24px;color:#111;font-size:13px}
.brand{text-align:center;font-weight:bold;color:#1f4d3a;margin-bottom:12px}
h1{text-align:center;font-size:18px;margin:8px 0 16px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th,td{border:1px solid #9ca3af;padding:8px;text-align:right}
th{background:#6b8f4e;color:#fff;font-weight:600}
.lbl{background:#d9e8c4;font-weight:600;width:28%}
.yn{text-align:center;width:12%}
.section-title{background:#6b8f4e;color:#fff;padding:8px;font-weight:bold;margin-top:12px}
.meta td{background:#f3f4f6}
.footer{margin-top:20px}
.status{display:inline-block;padding:4px 12px;border-radius:999px;background:#ecfdf5;color:#065f46;font-weight:bold}
</style></head><body>
<div class="brand">${esc(PLATFORM_NAME)}</div>
<h1>تقرير معلومات المخطط — Building Plan Information Report</h1>
<p>الحالة: <span class="status">${esc(report.status)}</span></p>

<table class="meta">
<tr><th colspan="2">البيانات العامة (من التسويق/المبيعات)</th></tr>
<tr><td class="lbl">اسم المنشأة</td><td>${esc(general.business_name)}</td></tr>
<tr><td class="lbl">اسم المالك</td><td>${esc(general.owner_name)}</td></tr>
<tr><td class="lbl">نوع النشاط</td><td>${esc(general.activity_type_label)}</td></tr>
<tr><td class="lbl">المدينة / الموقع</td><td>${esc(general.location_summary)}</td></tr>
<tr><td class="lbl">الحي والشارع</td><td>${esc(general.district)} — ${esc(general.street)}</td></tr>
<tr><td class="lbl">رقم القطعة</td><td>${esc(general.plot_number)}</td></tr>
<tr><td class="lbl">مساحة الأرض</td><td>${esc(general.land_area)}</td></tr>
<tr><td class="lbl">مساحة المبنى</td><td>${esc(general.building_area)}</td></tr>
<tr><td class="lbl">عدد الأدوار (مسجل)</td><td>${esc(general.floors_count)}</td></tr>
<tr><td class="lbl">رخصة البناء</td><td>${esc(report.building_permit_number || client.license_number || '—')}</td></tr>
<tr><td class="lbl">العنوان الوطني</td><td>${esc(general.national_address)}</td></tr>
<tr><td class="lbl">تاريخ التقرير</td><td>${esc(report.report_date || new Date().toISOString().slice(0, 10))}</td></tr>
</table>

<div class="section-title">المواصفات الهندسية ومتطلبات SBC</div>
<table>
<tr><th>البند</th><th>القيمة</th><th>نعم/لا</th></tr>
${engineeringRows}
</table>

<table>
<tr><th colspan="2">أنظمة السلامة والاعتماد</th></tr>
<tr><td class="lbl">متطلبات كود البناء SBC</td><td>${esc(report.sbc_requirements || '—')}</td></tr>
<tr><td class="lbl">أبواب ومخارج الطوارئ</td><td>${esc(report.emergency_exits_doors || '—')}</td></tr>
<tr><td class="lbl">حالة اعتماد المخطط</td><td>${esc(report.plan_approval_status || '—')}</td></tr>
<tr><td class="lbl">ملاحظات المعاينة الفنية</td><td>${esc(report.technical_inspection_notes || '—')}</td></tr>
</table>

<table class="footer">
<tr><th colspan="2">اعتماد المكتب الاستشاري</th></tr>
<tr><td class="lbl">اسم المكتب</td><td>${esc(report.office_name || PLATFORM_NAME)}</td></tr>
<tr><td class="lbl">السجل التجاري</td><td>${esc(report.commercial_registration || '—')}</td></tr>
<tr><td class="lbl">ممثل المكتب</td><td>${esc(report.engineer_representative || client.assigned_engineer || '—')}</td></tr>
<tr><td class="lbl">رقم العضوية الهندسية</td><td>${esc(report.engineering_membership_no || '—')}</td></tr>
<tr><td class="lbl">تاريخ الاعتماد</td><td>${esc(report.certification_date || '—')}</td></tr>
</table>
</body></html>`;
}

export function printBuildingPlanReport(client: ClientRecord, report: BuildingPlanReport) {
  const general = getBuildingPlanGeneralInfo(client);
  const html = buildBuildingPlanPrintHtml(client, report, general);
  const w = window.open('', '_blank', 'width=960,height=800');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

export function exportBuildingPlanReport(client: ClientRecord, report: BuildingPlanReport) {
  const general = getBuildingPlanGeneralInfo(client);
  const html = buildBuildingPlanPrintHtml(client, report, general);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `building-plan-${client.client_code}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
