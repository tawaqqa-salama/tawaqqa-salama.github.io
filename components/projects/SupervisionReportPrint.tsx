'use client';

/**
 * تقرير الإشراف الدوري ومتابعة الإنجاز — طباعة A4 أفقية متعددة الصفحات.
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { SupervisionReport, SupervisionTaskRow } from '@/lib/types/project-reports';
import {
  SUPERVISION_LEGEND,
  calcTaskTotalPercent,
  resolveOverallProgress,
  statusCellColor,
} from '@/lib/projects/supervision-report';
import { formatGregorianDate } from '@/lib/projects/safety-delivery-letter';

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
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return formatGregorianDate(raw);
  return raw;
}

function percentText(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

function categoryRowSpans(tasks: SupervisionTaskRow[]): Map<string, number> {
  const spans = new Map<string, number>();
  for (const task of tasks) {
    spans.set(task.category_id, (spans.get(task.category_id) || 0) + 1);
  }
  return spans;
}

export function buildSupervisionReportHtml(params: {
  client: ClientRecord;
  report: SupervisionReport;
  company: CompanyProfile;
}): string {
  const { client, report, company } = params;
  const months = report.months || [];
  const tasks = report.tasks || [];
  const overall = resolveOverallProgress(report);
  const spans = categoryRowSpans(tasks);
  const seenCategory = new Set<string>();

  const logo = company.logo_url
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="شعار" />`
    : `<div class="logo-fallback">${esc(company.name)}</div>`;

  const monthHeaders = months
    .map((m) => `<th class="month">${esc(m.label)}</th>`)
    .join('');

  const bodyRows = tasks
    .map((task) => {
      let categoryCell = '';
      if (!seenCategory.has(task.category_id)) {
        seenCategory.add(task.category_id);
        const rowspan = spans.get(task.category_id) || 1;
        categoryCell = `<td class="cat" rowspan="${rowspan}">${esc(task.category_label)}</td>`;
      }
      const monthCells = months
        .map((m) => {
          const cell = task.month_progress?.[m.id];
          const bg = statusCellColor(cell?.status || '');
          return `<td class="pct" style="background:${bg}">${esc(percentText(cell?.percent))}</td>`;
        })
        .join('');
      return `<tr>
        ${categoryCell}
        <td class="desc">${esc(task.description)}</td>
        <td class="type">${esc(task.work_type || '—')}</td>
        ${monthCells}
        <td class="pct total">${esc(percentText(calcTaskTotalPercent(task)))}</td>
      </tr>`;
    })
    .join('');

  const legend = SUPERVISION_LEGEND.map(
    (item) =>
      `<div class="legend-item"><span class="swatch" style="background:${item.color}"></span><span>${esc(item.label)}</span></div>`
  ).join('');

  const area = report.area_m2?.trim()
    ? `${report.area_m2.trim()}${/م/.test(report.area_m2) ? '' : ' م²'}`
    : '—';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير الإشراف الدوري ومتابعة الإنجاز — ${esc(report.project_name || client.business_name || client.name)}</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #e8eef2;
      color: #111;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 10px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    header, footer, .no-print { display: none !important; }

    .report-page-container {
      width: 297mm;
      min-height: 210mm;
      padding: 8mm 10mm;
      margin: 0 auto;
      background: #fff;
      color: #111;
      direction: rtl;
      page-break-after: always;
    }
    .report-page-container:last-child { page-break-after: auto; }

    .top {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 8px;
      align-items: center;
      border-bottom: 2px solid #1f4d3a;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .logo, .logo-fallback {
      width: 42px; height: 42px; object-fit: contain;
      display: block;
    }
    .logo-fallback {
      border: 1px solid #1f4d3a;
      display: flex; align-items: center; justify-content: center;
      font-size: 8px; text-align: center; padding: 2px;
    }
    .title-block { text-align: center; }
    .title-block h1 {
      margin: 0;
      font-size: 14px;
      color: #1f4d3a;
    }
    .title-block p { margin: 2px 0 0; font-size: 9px; color: #444; }
    .office { text-align: left; font-size: 9px; }

    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 14px;
      margin-bottom: 8px;
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      background: #f8fafc;
    }
    .meta .row {
      display: flex;
      gap: 6px;
      font-size: 9.5px;
    }
    .meta .label { font-weight: 700; color: #1f4d3a; white-space: nowrap; }
    .meta .value { flex: 1; border-bottom: 1px dotted #94a3b8; min-height: 14px; }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      margin: 0 0 8px;
      font-size: 9px;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .swatch {
      width: 14px; height: 14px;
      border: 1px solid #64748b;
      display: inline-block;
    }

    table.progress {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
      font-size: 9px;
    }
    table.progress thead { display: table-header-group; }
    table.progress tfoot { display: table-footer-group; }
    table.progress tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    table.progress th, table.progress td {
      border: 1px solid #334155;
      padding: 4px 5px;
      vertical-align: middle;
      text-align: center;
    }
    table.progress th {
      background: #1f4d3a;
      color: #fff;
      font-weight: 700;
    }
    table.progress th.month { min-width: 52px; }
    table.progress td.cat {
      background: #ecfdf5;
      font-weight: 700;
      writing-mode: horizontal-tb;
      max-width: 90px;
    }
    table.progress td.desc { text-align: right; min-width: 120px; }
    table.progress td.type { white-space: nowrap; }
    table.progress td.pct { font-weight: 600; }
    table.progress td.total { background: #f1f5f9; }

    .overall {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      font-size: 11px;
      font-weight: 700;
    }
    .overall span {
      border: 1.5px solid #1f4d3a;
      padding: 4px 12px;
      background: #ecfdf5;
    }

    .sign {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
      font-size: 9px;
      text-align: center;
    }
    .sign .box {
      border-top: 1px solid #64748b;
      padding-top: 4px;
      margin-top: 28px;
    }

    @media print {
      @page {
        size: A4 landscape;
        margin: 8mm;
      }
      html, body { background: #fff; }
      .report-page-container {
        width: 100%;
        min-height: auto;
        padding: 0;
        margin: 0;
        page-break-after: always;
      }
      .report-page-container:last-child { page-break-after: auto; }
      table.progress {
        width: 100%;
        border-collapse: collapse;
        page-break-inside: auto;
      }
      table.progress tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      table.progress thead { display: table-header-group; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="report-page-container">
    <div class="top">
      <div>${logo}</div>
      <div class="title-block">
        <h1>تقرير الإشراف الدوري ومتابعة الإنجاز</h1>
        <p>${esc(company.legal_name || company.name)} — ${esc(company.tagline || '')}</p>
      </div>
      <div class="office">
        <div>تاريخ التقرير: <strong>${esc(displayDate(report.report_date))}</strong></div>
        <div>رقم الاستمارة: <strong dir="ltr">${esc(report.inspection_form_number || '—')}</strong></div>
        <div>رقم الدراسة: <strong dir="ltr">${esc(report.study_number || '—')}</strong></div>
      </div>
    </div>

    <div class="meta">
      <div class="row"><span class="label">المستثمر / المالك:</span><span class="value">${esc(report.owner_name)}</span></div>
      <div class="row"><span class="label">المشروع:</span><span class="value">${esc(report.project_name)}</span></div>
      <div class="row"><span class="label">نوع المبنى:</span><span class="value">${esc(report.building_type)}</span></div>
      <div class="row"><span class="label">المساحة:</span><span class="value">${esc(area)}</span></div>
      <div class="row"><span class="label">المؤسسة / الشركة القائمة بأعمال التنفيذ:</span><span class="value">${esc(report.contractor_name)}</span></div>
      <div class="row"><span class="label">المكتب المشرف:</span><span class="value">${esc(report.supervising_office)}</span></div>
      <div class="row"><span class="label">اسم مدير الفرع:</span><span class="value">${esc(report.branch_manager_name)}</span></div>
      <div class="row"><span class="label">مهندس السلامة:</span><span class="value">${esc(report.safety_engineer_name)}</span></div>
      <div class="row"><span class="label">مدة التنفيذ الكلية:</span><span class="value">${esc(report.total_duration || '—')}</span></div>
      <div class="row"><span class="label">تاريخ البدء:</span><span class="value">${esc(displayDate(report.start_date))}</span></div>
    </div>

    <div class="legend">${legend}</div>

    <table class="progress">
      <thead>
        <tr>
          <th>الأعمال</th>
          <th>الملاحظات والتفاصيل</th>
          <th>نوع العمل (توريد / تركيب)</th>
          ${monthHeaders}
          <th>نسبة الإنجاز %</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows || `<tr><td colspan="${4 + months.length}">لا توجد بنود متابعة</td></tr>`}
      </tbody>
    </table>

    <div class="overall">
      <span>نسبة الإنجاز الكلي: ${esc(percentText(overall))}</span>
    </div>

    ${report.notes?.trim() ? `<p style="margin-top:8px;font-size:9px"><strong>ملاحظات:</strong> ${esc(report.notes)}</p>` : ''}

    <div class="sign">
      <div class="box">مهندس السلامة<br/>${esc(report.safety_engineer_name || '')}</div>
      <div class="box">مدير الفرع<br/>${esc(report.branch_manager_name || '')}</div>
      <div class="box">المكتب المشرف<br/>${esc(report.supervising_office || '')}</div>
    </div>
  </div>
</body>
</html>`;
}

export function printSupervisionReport(
  client: ClientRecord,
  report: SupervisionReport,
  company?: CompanyProfile | null
) {
  const run = async () => {
    const { loadCompanyProfile } = await import('@/lib/company-profile');
    const profile = company || (await loadCompanyProfile());
    const html = buildSupervisionReportHtml({ client, report, company: profile });
    const { openDocumentPreview } = await import('@/lib/print/document-preview');
    openDocumentPreview({
      title: `تقرير الإشراف — ${client.business_name || client.name}`,
      html,
      fileName: `supervision-report-${report.inspection_form_number || client.client_code || client.id}`,
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
