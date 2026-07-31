'use client';

import { PLATFORM_NAME } from '@/lib/constants/branding';
import { getBuildingPlanGeneralInfo, formatYesNo } from '@/lib/projects/building-plan';
import type { ClientRecord } from '@/lib/types/client';
import type { BuildingPlanGeneralInfo, BuildingPlanReport } from '@/lib/types/project-reports';

function esc(v: string) {
  return String(v || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type FieldCell = {
  label: string;
  value: string;
  yn?: string;
};

function cellHtml(field: FieldCell) {
  if (!field.label && !field.value && !field.yn) {
    return `<td class="lbl empty"></td><td class="val empty"></td>`;
  }
  const yn = field.yn
    ? `<span class="yn ${field.yn === 'نعم' ? 'yes' : field.yn === 'لا' ? 'no' : ''}">${esc(field.yn)}</span>`
    : '';
  const shownValue = field.value || (field.yn ? '' : '—');
  return `<td class="lbl">${esc(field.label)}</td><td class="val">${esc(shownValue)}${yn}</td>`;
}

function tripleRow(a: FieldCell, b?: FieldCell, c?: FieldCell) {
  return `<tr>${cellHtml(a)}${b ? cellHtml(b) : '<td class="lbl"></td><td class="val"></td>'}${
    c ? cellHtml(c) : '<td class="lbl"></td><td class="val"></td>'
  }</tr>`;
}

function pairRows(left: FieldCell[], mid: FieldCell[], right: FieldCell[]): string {
  const empty: FieldCell = { label: '', value: '' };
  const max = Math.max(left.length, mid.length, right.length);
  const rows: string[] = [];
  for (let i = 0; i < max; i++) {
    rows.push(tripleRow(left[i] || empty, mid[i] || empty, right[i] || empty));
  }
  return rows.join('');
}

export function buildBuildingPlanPrintHtml(
  client: ClientRecord,
  report: BuildingPlanReport,
  general: BuildingPlanGeneralInfo
): string {
  const generalFields: FieldCell[] = [
    { label: 'اسم المنشأة', value: general.business_name },
    { label: 'المالك', value: general.owner_name },
    { label: 'النشاط', value: general.activity_type_label },
    { label: 'المدينة / الموقع', value: general.location_summary },
    { label: 'الحي / الشارع', value: `${general.district} — ${general.street}` },
    { label: 'رقم القطعة', value: general.plot_number },
    { label: 'مساحة الأرض', value: general.land_area },
    { label: 'مساحة المبنى', value: general.building_area },
    { label: 'عدد الأدوار (مسجل)', value: general.floors_count },
    {
      label: 'رخصة البناء',
      value: report.building_permit_number || client.license_number || '—',
    },
    { label: 'العنوان الوطني', value: general.national_address },
    {
      label: 'تاريخ التقرير',
      value: report.report_date || new Date().toISOString().slice(0, 10),
    },
  ];

  const engineeringFields: FieldCell[] = [
    { label: 'تصنيف الإشغال', value: report.occupancy_classification || '—' },
    { label: 'نوع البناء', value: report.building_type_code || '—' },
    {
      label: 'مساحة الموقع العام',
      value: report.total_site_area_m2 || general.land_area,
    },
    {
      label: 'عدد الأدوار',
      value: report.floors_description || general.floors_count,
    },
    {
      label: 'الارتفاع',
      value: report.building_height_m ? `${report.building_height_m} m` : '—',
    },
    { label: 'عدد أدوار القبو', value: report.basement_floors_count || '0' },
    {
      label: 'العمق تحت الأرض',
      value: report.underground_depth_m ? `${report.underground_depth_m} m` : '0',
    },
    { label: 'عدد المخارج', value: report.exits_count || '—' },
    { label: 'عدد السلالم', value: report.stairs_count || '—' },
    { label: 'السلالم الكهربائية', value: report.escalators_count || '0' },
    { label: 'عدد المصاعد', value: report.elevators_count || '0' },
    {
      label: 'المبنى عالي',
      value: '',
      yn: formatYesNo(report.high_rise_building),
    },
    { label: 'يوجد بهو', value: '', yn: formatYesNo(report.atrium_exists) },
    {
      label: 'المبنى تحت الأرض',
      value: '',
      yn: formatYesNo(report.underground_building),
    },
    {
      label: 'بلا نوافذ',
      value: '',
      yn: formatYesNo(report.windowless_building),
    },
    {
      label: 'تأريض كهربائي',
      value: '',
      yn: formatYesNo(report.electrical_grounding),
    },
    {
      label: 'حماية من الصواعق',
      value: '',
      yn: formatYesNo(report.lightning_protection),
    },
    {
      label: 'مولد احتياطي',
      value: '',
      yn: formatYesNo(report.backup_generator),
    },
    {
      label: 'استثناءات الكود',
      value: '',
      yn: formatYesNo(report.sbc_code_exceptions),
    },
    {
      label: 'فرق إطفاء خاصة',
      value: '',
      yn: formatYesNo(report.special_rescue_team_required),
    },
  ];

  const safetyFields: FieldCell[] = [
    {
      label: 'نظام إنذار',
      value: '',
      yn: formatYesNo(report.fire_alarm_system),
    },
    {
      label: 'رش آلي',
      value: '',
      yn: formatYesNo(report.sprinkler_system),
    },
    {
      label: 'أبواب/مخارج الطوارئ',
      value: report.emergency_exits_doors || '—',
    },
    {
      label: 'متطلبات SBC',
      value: report.sbc_requirements || '—',
    },
    {
      label: 'حالة اعتماد المخطط',
      value: report.plan_approval_status || '—',
    },
    {
      label: 'ملاحظات المعاينة',
      value: report.technical_inspection_notes || '—',
    },
  ];

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير معلومات المخطط — ${esc(general.business_name)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: "Tahoma","Segoe UI",Arial,sans-serif;
    }

    .sheet {
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      margin: 0 auto;
      padding: 8mm 10mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .title-bar {
      text-align: center;
      border: 1px solid #4d6b35;
      background: linear-gradient(180deg, #edf5e4 0%, #d9e8c4 100%);
      padding: 6px 8px;
      margin-bottom: 6px;
      flex: 0 0 auto;
    }

    .brand {
      font-size: 12px;
      font-weight: 700;
      color: #1f4d3a;
      margin: 0 0 2px;
    }

    h1 {
      margin: 0;
      font-size: 14px;
      color: #1f2937;
      font-weight: 800;
      line-height: 1.35;
    }

    .sub {
      margin: 2px 0 0;
      font-size: 10px;
      color: #475569;
    }

    .status {
      display: inline-block;
      margin-top: 3px;
      padding: 1px 8px;
      border-radius: 999px;
      background: #ecfdf5;
      color: #065f46;
      font-size: 10px;
      font-weight: 700;
    }

    .section-head {
      background: #6b8f4e;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 6px;
      text-align: center;
    }

    table.grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 0 5px;
      font-size: 10.5px;
    }

    table.grid th,
    table.grid td {
      border: 1px solid #8aa56a;
      padding: 3px 5px;
      vertical-align: middle;
      line-height: 1.25;
    }

    table.grid .lbl {
      width: 14%;
      background: #e5f0d6;
      font-weight: 700;
      color: #243b18;
      font-size: 10px;
    }

    table.grid .val {
      width: 19.33%;
      background: #fff;
      font-size: 10.5px;
      word-break: break-word;
    }

    .yn {
      display: inline-block;
      min-width: 28px;
      margin-inline-start: 4px;
      padding: 0 5px;
      border-radius: 3px;
      text-align: center;
      font-size: 10px;
      font-weight: 700;
      background: #f1f5f9;
      color: #334155;
    }

    .yn.yes { background: #dcfce7; color: #166534; }
    .yn.no { background: #fee2e2; color: #991b1b; }

    .body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    .cert {
      flex: 0 0 auto;
      margin-top: auto;
      border: 1px solid #4d6b35;
    }

    .cert-head {
      background: #1f4d3a;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 6px;
      text-align: center;
    }

    .cert-grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10.5px;
    }

    .cert-grid td {
      border: 1px solid #8aa56a;
      padding: 4px 6px;
      vertical-align: top;
    }

    .cert-grid .lbl {
      width: 16%;
      background: #e5f0d6;
      font-weight: 700;
    }

    .cert-grid .val { width: 34%; }

    .sign-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      padding: 6px;
      border-top: 1px solid #8aa56a;
      background: #f8faf5;
    }

    .sign-box {
      text-align: center;
      font-size: 10px;
      color: #334155;
      min-height: 52px;
    }

    .stamp-box {
      width: 58px;
      height: 58px;
      margin: 2px auto 4px;
      border: 1.5px dashed #1f4d3a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1f4d3a;
      font-size: 9px;
      font-weight: 700;
      padding: 4px;
      text-align: center;
      line-height: 1.2;
    }

    .sign-line {
      margin-top: 28px;
      border-top: 1px solid #64748b;
      padding-top: 3px;
    }

    @media print {
      html, body {
        width: auto;
        height: 100vh;
        overflow: hidden;
        page-break-after: avoid;
        page-break-inside: avoid;
      }

      .sheet {
        width: auto;
        height: auto;
        max-height: none;
        margin: 0;
        padding: 0;
        overflow: hidden;
        page-break-after: avoid;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      header, footer, .no-print {
        display: none !important;
      }
    }

    @media screen {
      body { background: #e5e7eb; padding: 16px 0; }
      .sheet {
        background: #fff;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:10px">
    <button onclick="window.print()" style="padding:8px 14px;font-size:13px">طباعة / حفظ PDF (A4 صفحة واحدة)</button>
  </div>

  <div class="sheet">
    <div class="title-bar">
      <div class="brand">${esc(PLATFORM_NAME)}</div>
      <h1>تقرير معلومات المخطط — Building Plan Information Report</h1>
      <p class="sub">نموذج مكثف — صفحة A4 واحدة</p>
      <span class="status">${esc(report.status || 'مسودة')}</span>
    </div>

    <div class="body">
      <div class="section-head">البيانات العامة + المواصفات الهندسية ومتطلبات SBC + أنظمة السلامة</div>
      <table class="grid">
        <tr>
          <th colspan="2">بيانات عامة</th>
          <th colspan="2">مواصفات هندسية / SBC</th>
          <th colspan="2">أنظمة السلامة والاعتماد</th>
        </tr>
        ${pairRows(generalFields, engineeringFields, safetyFields)}
      </table>
    </div>

    <div class="cert">
      <div class="cert-head">اعتماد المكتب الاستشاري</div>
      <table class="cert-grid">
        <tr>
          <td class="lbl">اسم المكتب</td>
          <td class="val">${esc(report.office_name || PLATFORM_NAME)}</td>
          <td class="lbl">السجل التجاري</td>
          <td class="val">${esc(report.commercial_registration || '—')}</td>
        </tr>
        <tr>
          <td class="lbl">ممثل المكتب</td>
          <td class="val">${esc(report.engineer_representative || client.assigned_engineer || '—')}</td>
          <td class="lbl">رقم العضوية</td>
          <td class="val">${esc(report.engineering_membership_no || '—')}</td>
        </tr>
        <tr>
          <td class="lbl">تاريخ الاعتماد</td>
          <td class="val">${esc(report.certification_date || '—')}</td>
          <td class="lbl">الحالة</td>
          <td class="val">${esc(report.plan_approval_status || report.status || '—')}</td>
        </tr>
      </table>
      <div class="sign-row">
        <div class="sign-box">
          <div>توقيع المهندس</div>
          <div class="sign-line">${esc(report.engineer_representative || client.assigned_engineer || '................')}</div>
        </div>
        <div class="sign-box">
          <div class="stamp-box">ختم المكتب</div>
          <div>${esc(report.office_name || PLATFORM_NAME)}</div>
        </div>
        <div class="sign-box">
          <div>اعتماد المكتب</div>
          <div class="sign-line">................</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function printBuildingPlanReport(client: ClientRecord, report: BuildingPlanReport) {
  const general = getBuildingPlanGeneralInfo(client);
  const html = buildBuildingPlanPrintHtml(client, report, general);
  const w = window.open('', '_blank', 'width=900,height=1200');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
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
