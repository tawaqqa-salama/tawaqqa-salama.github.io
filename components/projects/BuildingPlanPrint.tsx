'use client';

import { PLATFORM_NAME } from '@/lib/constants/branding';
import { getBuildingPlanGeneralInfo, formatYesNo } from '@/lib/projects/building-plan';
import type { ClientRecord } from '@/lib/types/client';
import type { BuildingPlanGeneralInfo, BuildingPlanReport } from '@/lib/types/project-reports';

function esc(v: string) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** صف رسمي: بند | قيمة رقمية/نصية | نعم/لا */
function engRow(label: string, value: string, yn = '') {
  return `<tr>
    <td class="lbl">${esc(label)}</td>
    <td class="val">${esc(value || '—')}</td>
    <td class="yn">${esc(yn || '')}</td>
  </tr>`;
}

function kvRow(label: string, value: string, spanRest = false) {
  if (spanRest) {
    return `<tr><td class="lbl">${esc(label)}</td><td class="val" colspan="2">${esc(value || '—')}</td></tr>`;
  }
  return `<tr><td class="lbl">${esc(label)}</td><td class="val">${esc(value || '—')}</td></tr>`;
}

export function buildBuildingPlanPrintHtml(
  client: ClientRecord,
  report: BuildingPlanReport,
  general: BuildingPlanGeneralInfo
): string {
  // ترتيب الصفوف مطابق لنموذج الدفاع المدني / واجهة المهندس حرفياً
  const engineeringRows = [
    engRow('تصنيف الإشغال', report.occupancy_classification || ''),
    engRow('نوع البناء', report.building_type_code || ''),
    engRow('المبنى عالي', '—', formatYesNo(report.high_rise_building)),
    engRow('مساحة الموقع (م²)', report.total_site_area_m2 || general.land_area),
    engRow('يوجد بهو', '—', formatYesNo(report.atrium_exists)),
    engRow('عدد الأدوار (وصف)', report.floors_description || general.floors_count),
    engRow('المبنى تحت الأرض', '—', formatYesNo(report.underground_building)),
    engRow('الارتفاع (m)', report.building_height_m || ''),
    engRow('بلا نوافذ', '—', formatYesNo(report.windowless_building)),
    engRow('أدوار القبو', report.basement_floors_count || '0'),
    engRow('تأريض كهربائي', '—', formatYesNo(report.electrical_grounding)),
    engRow('عمق تحت الأرض (m)', report.underground_depth_m || '0'),
    engRow('حماية صواعق', '—', formatYesNo(report.lightning_protection)),
    engRow('عدد المخارج', report.exits_count || ''),
    engRow('مولد احتياطي', '—', formatYesNo(report.backup_generator)),
    engRow('عدد السلالم', report.stairs_count || ''),
    engRow('استثناءات الكود', '—', formatYesNo(report.sbc_code_exceptions)),
    engRow('سلالم كهربائية', report.escalators_count || '0'),
    engRow('فرق إطفاء خاصة', '—', formatYesNo(report.special_rescue_team_required)),
    engRow('عدد المصاعد', report.elevators_count || '0'),
  ].join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير معلومات المخطط — ${esc(general.business_name)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 5mm 8mm;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: "Tahoma","Segoe UI",Arial,sans-serif;
      font-size: 10px;
    }

    .sheet {
      width: 210mm;
      min-height: 297mm;
      max-height: 297mm;
      margin: 0 auto;
      padding: 5mm 8mm;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .head {
      text-align: center;
      margin-bottom: 3px;
      flex: 0 0 auto;
    }

    .head .brand {
      font-size: 11px;
      font-weight: 700;
      color: #1f4d3a;
      margin: 0 0 1px;
    }

    .head h1 {
      margin: 0;
      font-size: 12px;
      font-weight: 800;
      color: #111;
      line-height: 1.3;
    }

    .head .en {
      margin: 1px 0 0;
      font-size: 9px;
      color: #475569;
    }

    .status {
      display: inline-block;
      margin-top: 2px;
      padding: 0 6px;
      border: 1px solid #86efac;
      background: #ecfdf5;
      color: #065f46;
      font-size: 9px;
      font-weight: 700;
    }

    .body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    table.form {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 0 3px;
      font-size: 9.5px;
    }

    table.form th,
    table.form td {
      border: 1px solid #5f7d45;
      padding: 2px 5px;
      vertical-align: middle;
      line-height: 1.2;
    }

    table.form th {
      background: #6b8f4e;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
    }

    table.form .lbl {
      width: 28%;
      background: #d9e8c4;
      font-weight: 700;
      color: #1f2f14;
      font-size: 9px;
    }

    table.form .val {
      background: #fff;
      font-size: 9.5px;
      word-break: break-word;
    }

    /* جدول المواصفات: بند | قيمة | نعم/لا */
    table.eng .lbl { width: 34%; }
    table.eng .val { width: 46%; }
    table.eng .yn {
      width: 20%;
      text-align: center;
      font-weight: 700;
      background: #fff;
      font-size: 9.5px;
    }

    table.meta .lbl { width: 22%; }
    table.meta .val { width: 28%; }

    table.safety .lbl { width: 28%; }
    table.safety .val { width: 72%; }
    table.safety .yn {
      width: 18%;
      text-align: center;
      font-weight: 700;
    }

    .cert {
      flex: 0 0 auto;
      margin-top: auto;
    }

    table.cert {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9.5px;
      margin: 0;
    }

    table.cert th,
    table.cert td {
      border: 1px solid #5f7d45;
      padding: 2px 5px;
      vertical-align: middle;
    }

    table.cert th {
      background: #1f4d3a;
      color: #fff;
      font-size: 10px;
      text-align: center;
    }

    table.cert .lbl {
      width: 18%;
      background: #d9e8c4;
      font-weight: 700;
      font-size: 9px;
    }

    table.cert .val { width: 32%; }

    .sign-wrap {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      border: 1px solid #5f7d45;
      border-top: 0;
      background: #f7faf3;
    }

    .sign-box {
      text-align: center;
      padding: 4px 4px 5px;
      font-size: 9px;
      border-left: 1px solid #5f7d45;
      min-height: 48px;
    }

    .sign-box:last-child { border-left: 0; }

    .stamp {
      width: 46px;
      height: 46px;
      margin: 1px auto 2px;
      border: 1.5px dashed #1f4d3a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1f4d3a;
      font-size: 8px;
      font-weight: 700;
      line-height: 1.15;
      padding: 3px;
    }

    .sign-line {
      margin-top: 18px;
      border-top: 1px solid #64748b;
      padding-top: 2px;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 0;
      }

      html, body {
        width: auto;
        height: 100vh;
        overflow: hidden;
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
        break-after: avoid !important;
        break-inside: avoid !important;
      }

      body { margin: 8mm; }

      .sheet {
        width: auto;
        min-height: auto;
        max-height: none;
        margin: 0;
        padding: 0;
        overflow: hidden;
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
      }

      header, footer, .no-print {
        display: none !important;
      }
    }

    @media screen {
      body { background: #e5e7eb; padding: 12px 0 24px; }
      .sheet {
        background: #fff;
        box-shadow: 0 8px 20px rgba(0,0,0,.12);
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:8px">
    <button onclick="window.print()" style="padding:7px 12px;font-size:12px">طباعة / حفظ PDF (A4 صفحة واحدة — نموذج الدفاع المدني)</button>
  </div>

  <div class="sheet">
    <div class="head">
      <p class="brand">${esc(PLATFORM_NAME)}</p>
      <h1>تقرير معلومات المخطط</h1>
      <p class="en">Building Plan Information Report — نموذج رسمي موحد</p>
      <span class="status">${esc(report.status || 'مسودة')}</span>
    </div>

    <div class="body">
      <!-- 1) بيانات المنشأة -->
      <table class="form meta">
        <tr><th colspan="4">بيانات المنشأة</th></tr>
        <tr>
          <td class="lbl">اسم المنشأة / المبنى</td>
          <td class="val">${esc(general.business_name)}</td>
          <td class="lbl">اسم المالك</td>
          <td class="val">${esc(general.owner_name)}</td>
        </tr>
        <tr>
          <td class="lbl">نوع النشاط التجاري</td>
          <td class="val">${esc(general.activity_type_label)}</td>
          <td class="lbl">المدينة</td>
          <td class="val">${esc(general.city)}</td>
        </tr>
        <tr>
          <td class="lbl">الموقع (مدينة — حي)</td>
          <td class="val">${esc(general.location_summary)}</td>
          <td class="lbl">الحي والشارع</td>
          <td class="val">${esc(general.district)} — ${esc(general.street)}</td>
        </tr>
        <tr>
          <td class="lbl">مساحة الأرض</td>
          <td class="val">${esc(general.land_area)}</td>
          <td class="lbl">مساحة المبنى</td>
          <td class="val">${esc(general.building_area)}</td>
        </tr>
        <tr>
          <td class="lbl">عدد الأدوار (مسجل)</td>
          <td class="val">${esc(general.floors_count)}</td>
          <td class="lbl">رقم القطعة</td>
          <td class="val">${esc(general.plot_number)}</td>
        </tr>
        <tr>
          <td class="lbl">العنوان الوطني</td>
          <td class="val">${esc(general.national_address)}</td>
          <td class="lbl">رخصة البناء</td>
          <td class="val">${esc(report.building_permit_number || client.license_number || '—')}</td>
        </tr>
        <tr>
          <td class="lbl">تاريخ التقرير</td>
          <td class="val">${esc(report.report_date || new Date().toISOString().slice(0, 10))}</td>
          <td class="lbl">حالة التقرير</td>
          <td class="val">${esc(report.status || 'مسودة')}</td>
        </tr>
      </table>

      <!-- 2) المواصفات الهندسية ومتطلبات SBC — بند | قيمة | نعم/لا -->
      <table class="form eng">
        <tr>
          <th>البند</th>
          <th>القيمة</th>
          <th>نعم / لا</th>
        </tr>
        ${engineeringRows}
      </table>

      <!-- 3) أنظمة السلامة -->
      <table class="form safety">
        <tr><th colspan="3">أنظمة السلامة والاعتماد</th></tr>
        <tr>
          <td class="lbl">نظام إنذار حريق</td>
          <td class="val">—</td>
          <td class="yn">${esc(formatYesNo(report.fire_alarm_system))}</td>
        </tr>
        <tr>
          <td class="lbl">نظام رش آلي</td>
          <td class="val">—</td>
          <td class="yn">${esc(formatYesNo(report.sprinkler_system))}</td>
        </tr>
        ${kvRow('متطلبات كود البناء SBC', report.sbc_requirements || '—', true)}
        ${kvRow('أبواب ومخارج الطوارئ', report.emergency_exits_doors || '—', true)}
        ${kvRow('حالة اعتماد المخطط', report.plan_approval_status || '—', true)}
        ${kvRow('ملاحظات المعاينة الفنية', report.technical_inspection_notes || '—', true)}
      </table>
    </div>

    <!-- 4) اعتماد المكتب — قاع الصفحة -->
    <div class="cert">
      <table class="cert">
        <tr><th colspan="4">اعتماد المكتب الاستشاري</th></tr>
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
      <div class="sign-wrap">
        <div class="sign-box">
          <div>توقيع المهندس</div>
          <div class="sign-line">${esc(report.engineer_representative || client.assigned_engineer || '................')}</div>
        </div>
        <div class="sign-box">
          <div class="stamp">ختم<br/>المكتب</div>
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
