'use client';

/**
 * التقرير النهائي بنمط باندا — غلاف + نسب أنظمة + صفحات مقارنة قبل/بعد (A4).
 */

import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { FinalInspectionReport, ProjectEngineeringData } from '@/lib/types/project-reports';
import {
  finalReportDates,
  overallSystemsPercent,
} from '@/lib/projects/final-safety-report';
import { resolveOfficeCivilDefenseLicense } from '@/lib/projects/safety-delivery-letter';

function esc(value: string | number | null | undefined): string {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function buildFinalSafetyReportHtml(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  report: FinalInspectionReport;
  company: CompanyProfile;
}): string {
  const { client, report, company } = params;
  const dates = finalReportDates(report.inspection_date);
  const officeLicense = resolveOfficeCivilDefenseLicense(company);
  const systems = report.system_completion || [];
  const observations = report.observations || [];
  const overall = overallSystemsPercent(systems);
  const projectName = client.business_name || client.name || '—';
  const branch = report.branch_name || [client.city, client.district].filter(Boolean).join(' — ') || '—';

  const logo = company.logo_url
    ? `<img class="logo" src="${esc(company.logo_url)}" alt="شعار" />`
    : `<div class="logo-fallback">${esc(company.name)}</div>`;

  const systemRows = systems
    .map(
      (sys) => `<tr>
      <td class="sys">${esc(sys.label)}</td>
      <td class="c">${esc(sys.percent)}%</td>
      <td class="c">${sys.verified || sys.percent >= 100 ? 'مكتمل' : 'قيد العمل'}</td>
    </tr>`
    )
    .join('');

  // صفحتان ملاحظات لكل صفحة A4 تقريباً
  const pages = chunk(observations, 2);
  const observationPages =
    pages.length === 0
      ? `<section class="sheet page-break">
          <h2>ملاحظات قبل / بعد</h2>
          <p class="muted">لا توجد ملاحظات مسجّلة في هذا الإصدار.</p>
        </section>`
      : pages
          .map((pair, pageIndex) => {
            const blocks = pair
              .map((obs) => {
                const before = obs.before_photo?.dataUrl
                  ? `<img src="${esc(obs.before_photo.dataUrl)}" alt="قبل" />`
                  : `<div class="ph-empty">لا توجد صورة قبل</div>`;
                const after = obs.after_photo?.dataUrl
                  ? `<img src="${esc(obs.after_photo.dataUrl)}" alt="بعد" />`
                  : `<div class="ph-empty">بانتظار صورة بعد</div>`;
                return `<article class="obs">
                  <header>
                    <h3>${esc(obs.title)}</h3>
                    <span class="badge ${obs.status === 'fixed' ? 'ok' : 'pending'}">${
                      obs.status === 'fixed' ? 'تم الإصلاح — 100%' : 'قيد المعالجة'
                    }</span>
                  </header>
                  ${obs.description ? `<p class="desc">${esc(obs.description)}</p>` : ''}
                  <div class="pair">
                    <figure>
                      <figcaption>قبل</figcaption>
                      ${before}
                    </figure>
                    <figure>
                      <figcaption>بعد</figcaption>
                      ${after}
                    </figure>
                  </div>
                </article>`;
              })
              .join('');

            return `<section class="sheet page-break">
              <div class="page-head">
                <span>${esc(projectName)}</span>
                <span>صفحة ملاحظات ${pageIndex + 1} / ${pages.length}</span>
              </div>
              ${blocks}
            </section>`;
          })
          .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>التقرير النهائي — ${esc(projectName)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #111;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 11px; line-height: 1.45;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    header, footer, .no-print { display: none !important; }
    .sheet {
      width: 100%; max-width: 190mm; margin: 0 auto 8mm;
      page-break-inside: avoid;
    }
    .page-break { page-break-after: always; }
    .page-break:last-child { page-break-after: auto; }
    .cover {
      border: 2px solid #1f4d3a; border-radius: 8px; padding: 16px;
      min-height: 240mm; display: flex; flex-direction: column;
    }
    .cover-top {
      display: grid; grid-template-columns: 1fr 1.2fr 1fr;
      gap: 8px; align-items: start; border-bottom: 2px solid #1f4d3a;
      padding-bottom: 10px; margin-bottom: 18px;
    }
    .meta div { margin: 0 0 4px; font-size: 10px; }
    .center { text-align: center; }
    .logo, .logo-fallback {
      width: 64px; height: 64px; object-fit: contain; margin: 0 auto 6px; display: block;
    }
    .logo-fallback {
      border: 1px solid #cbd5e1; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 800; color: #1f4d3a; padding: 4px;
    }
    .brand { margin: 0; font-size: 14px; font-weight: 900; color: #1f4d3a; }
    .doc-title { margin: 6px 0 0; font-size: 22px; font-weight: 900; color: #143528; }
    .subtitle { margin: 4px 0 0; font-size: 12px; color: #475569; }
    .cover-body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
    .cover-card {
      border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; background: #f8fafc;
    }
    .cover-card h2 { margin: 0 0 6px; font-size: 13px; color: #1f4d3a; }
    .cover-card p { margin: 0 0 4px; font-size: 12px; }
    .big-result {
      text-align: center; font-size: 18px; font-weight: 900; color: #1f4d3a;
      padding: 14px; border: 2px dashed #1f4d3a; border-radius: 10px; margin-top: 12px;
    }
    h2 {
      margin: 0 0 8px; font-size: 14px; color: #1f4d3a;
      border-right: 4px solid #1f4d3a; padding-right: 8px;
    }
    table.systems {
      width: 100%; border-collapse: collapse; margin: 0 0 12px;
    }
    table.systems th, table.systems td {
      border: 1px solid #64748b; padding: 7px 8px; vertical-align: middle;
    }
    table.systems th { background: #f1f5f9; font-size: 11px; }
    table.systems td.sys { font-weight: 800; text-align: right; }
    table.systems td.c { text-align: center; font-weight: 800; }
    .muted { color: #64748b; }
    .summary {
      border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px;
      background: #f8fafc; margin-bottom: 12px; text-align: justify;
    }
    .page-head {
      display: flex; justify-content: space-between; font-size: 10px; color: #64748b;
      border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px;
    }
    .obs {
      border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px;
      margin-bottom: 12px; page-break-inside: avoid;
    }
    .obs header {
      display: flex; justify-content: space-between; gap: 8px; align-items: flex-start;
      margin-bottom: 6px;
    }
    .obs h3 { margin: 0; font-size: 13px; }
    .badge {
      font-size: 10px; font-weight: 800; border-radius: 999px; padding: 3px 8px; white-space: nowrap;
    }
    .badge.ok { background: #dcfce7; color: #166534; }
    .badge.pending { background: #fef3c7; color: #92400e; }
    .desc { margin: 0 0 8px; color: #334155; font-size: 11px; }
    .pair {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    }
    figure { margin: 0; }
    figcaption {
      text-align: center; font-weight: 800; font-size: 11px; margin-bottom: 4px; color: #1f4d3a;
    }
    figure img {
      width: 100%; height: 210px; object-fit: cover; border: 1px solid #94a3b8; border-radius: 6px;
      background: #fff; display: block;
    }
    .ph-empty {
      width: 100%; height: 210px; border: 1.5px dashed #94a3b8; border-radius: 6px;
      display: flex; align-items: center; justify-content: center; color: #94a3b8; background: #f8fafc;
    }
    @media print {
      @page { size: A4 portrait; margin: 10mm; }
      html, body { margin: 0 !important; padding: 0 !important; }
      header, footer, .no-print { display: none !important; }
      .sheet { max-width: none; margin-bottom: 0; }
      .page-break { page-break-after: always; }
      a[href]::after { content: none !important; }
    }
  </style>
</head>
<body>
  <section class="sheet page-break cover">
    <div class="cover-top">
      <div class="meta">
        <div><strong>ترخيص المكتب لدى الدفاع المدني</strong></div>
        <div dir="ltr"><strong>${esc(officeLicense)}</strong></div>
        <div>س.ت: ${esc(company.commercial_register || 'تحت الإجراء')}</div>
        <div>جوال المكتب: ${esc(company.phone || '—')}</div>
      </div>
      <div class="center">
        ${logo}
        <p class="brand">${esc(company.legal_name || company.name)}</p>
        <h1 class="doc-title">التقرير النهائي</h1>
        <p class="subtitle">تقرير سلامة بنمط باندا — مقارنة قبل / بعد</p>
      </div>
      <div class="meta" style="text-align:left">
        <div>التاريخ الميلادي: <strong dir="ltr">${esc(dates.gregorian)}</strong></div>
        <div>التاريخ الهجري: <strong>${esc(dates.hijri)}</strong></div>
        <div>الحالة: <strong>${esc(report.status)}</strong></div>
      </div>
    </div>

    <div class="cover-body">
      <div class="cover-card">
        <h2>بيانات المشروع</h2>
        <p><strong>اسم المشروع / المنشأة:</strong> ${esc(projectName)}</p>
        <p><strong>المالك:</strong> ${esc(client.owner_name || client.name || '—')}</p>
        <p><strong>الفرع / الموقع:</strong> ${esc(branch)}</p>
        <p><strong>المدينة:</strong> ${esc(client.city || '—')} — <strong>الحي:</strong> ${esc(client.district || '—')}</p>
        <p><strong>المفتش:</strong> ${esc(report.inspector_name || '—')}</p>
      </div>

      <div class="cover-card">
        <h2>الملخص التنفيذي</h2>
        <p>${esc(report.executive_summary || report.compliance_summary || '—')}</p>
      </div>

      <div class="big-result">
        النتيجة العامة: ${esc(report.overall_result || '—')}
        <div style="font-size:13px;margin-top:6px;font-weight:700">متوسط اكتمال الأنظمة: ${overall}%</div>
      </div>
    </div>
  </section>

  <section class="sheet page-break">
    <h2>نسب اكتمال الأنظمة المعتمدة</h2>
    <div class="summary">
      يبيّن الجدول أدناه نسب التحقق لأنظمة السلامة بعد استكمال التصحيحات الميدانية وإرفاق صور «بعد».
    </div>
    <table class="systems">
      <thead>
        <tr>
          <th>النظام</th>
          <th>نسبة الاكتمال</th>
          <th>حالة التحقق</th>
        </tr>
      </thead>
      <tbody>${systemRows}</tbody>
    </table>
    ${
      report.license_recommendation
        ? `<div class="summary"><strong>توصية الترخيص:</strong> ${esc(report.license_recommendation)}</div>`
        : ''
    }
  </section>

  ${observationPages}
</body>
</html>`;
}

export function printFinalSafetyReport(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  report: FinalInspectionReport;
  company: CompanyProfile;
}) {
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
    const html = buildFinalSafetyReportHtml(params);
    void import('@/lib/print/document-preview').then(({ openDocumentPreview }) => {
      openDocumentPreview({
        title: `التقرير النهائي — ${params.client.business_name || params.client.name}`,
        html,
        fileName: `final-safety-report-${params.client.client_code || params.client.id}`,
      });
    });
  });
}
