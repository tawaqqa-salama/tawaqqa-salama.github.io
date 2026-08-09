/**
 * Build a printable HTML audit package (Save as PDF via browser print).
 * Processing stays local — no server round-trip.
 */

import type { CADAnalysisResult } from '@/lib/projects/design-center/vision/types';

export function buildPreDesignAuditHtml(
  result: CADAnalysisResult,
  meta: { projectName: string; projectId: string; preferAr?: boolean }
): string {
  const ar = Boolean(meta.preferAr);
  const report = result.compliance_report;
  const cov = result.coverage;
  const pre = result.pre_calculations;
  const eg = result.egress;

  const rows =
    report?.items
      .map(
        (it) => `<tr>
      <td>${escapeHtml(ar ? it.title_ar : it.title_en)}</td>
      <td><strong>${it.status}</strong></td>
      <td>${escapeHtml(ar ? it.detail_ar : it.detail_en)}</td>
      <td>${escapeHtml(it.code_refs.join(', '))}</td>
    </tr>`
      )
      .join('') || '';

  const zones = result.zones
    .map(
      (z) =>
        `<li>${escapeHtml(z.label || z.id)} — ${z.area_m2 ?? '—'} m² — ${z.classification || 'unknown'} — travel ${z.travel_distance_m ?? '—'} m</li>`
    )
    .join('');

  const issues =
    cov?.issues
      .slice(0, 40)
      .map((i) => `<li>[${i.kind}] ${escapeHtml(ar ? i.message_ar : i.message_en)}</li>`)
      .join('') || `<li>${ar ? 'لا ملاحظات تغطية' : 'No coverage notes'}</li>`;

  return `<!DOCTYPE html>
<html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8"/>
<title>${ar ? 'تدقيق هندسي ما قبل التصميم' : 'Pre-Design Engineering Audit'}</title>
<style>
  body{font-family:system-ui,Segoe UI,Tahoma,sans-serif;margin:24px;color:#0f172a;line-height:1.45}
  h1,h2{margin:0 0 8px}
  .muted{color:#64748b;font-size:13px}
  .badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#e2e8f0;font-weight:700;font-size:12px}
  .crit{background:#fecaca}.ok{background:#bbf7d0}.rev{background:#fde68a}
  table{width:100%;border-collapse:collapse;margin:12px 0 24px;font-size:13px}
  th,td{border:1px solid #cbd5e1;padding:8px;vertical-align:top}
  th{background:#f1f5f9;text-align:start}
  ul{padding-inline-start:18px}
  @media print{button{display:none}}
</style>
</head>
<body>
  <button onclick="window.print()">${ar ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}</button>
  <h1>${ar ? 'تفريغ الحسابات والمطابقة' : 'Pre-Design Calculations & Compliance'}</h1>
  <p class="muted">${escapeHtml(meta.projectName)} · ID ${escapeHtml(meta.projectId)} · ${escapeHtml(result.processed_at)}</p>
  <p><span class="badge ${
    report?.overall_status === 'CRITICAL_NON_COMPLIANCE'
      ? 'crit'
      : report?.overall_status === 'COMPLIANT'
        ? 'ok'
        : 'rev'
  }">${report?.overall_status || 'NEEDS_ENGINEER_REVIEW'}</span></p>

  <h2>${ar ? 'ملخص المقياس والفراغات' : 'Scale & zones'}</h2>
  <p class="muted">${ar ? 'المقياس' : 'Scale'}: ${escapeHtml(result.scale.ratio_text || 'Unknown')} · GFA ${result.gross_floor_area_m2 ?? '—'} m² · ${ar ? 'الإشغال' : 'Occupancy'}: ${escapeHtml(result.occupancy || 'Needs Engineer Input')}</p>
  <ul>${zones || `<li>${ar ? 'لا فراغات' : 'No zones'}</li>`}</ul>

  <h2>${ar ? 'الإخلاء' : 'Egress'}</h2>
  <p class="muted">${
    eg
      ? `${ar ? 'حد' : 'Limit'} ${eg.limit.applied_max_m} m · max ${eg.max_travel_m ?? '—'} m · ${eg.overall_status}`
      : ar
        ? 'غير متاح'
        : 'N/A'
  }</p>

  <h2>${ar ? 'تغطية الأجهزة' : 'Device coverage'}</h2>
  <p class="muted">${escapeHtml(ar ? cov?.summary_ar || '' : cov?.summary_en || '')}</p>
  <ul>${issues}</ul>

  <h2>${ar ? 'حسابات أولية' : 'Pre-calculations'}</h2>
  <p><strong>${ar ? 'هيدروليك' : 'Hydraulic'}:</strong> ${escapeHtml(ar ? pre?.hydraulic.note_ar || '' : pre?.hydraulic.note_en || '')}</p>
  <p><strong>${ar ? 'بطارية إنذار' : 'Alarm battery'}:</strong> ${escapeHtml(ar ? pre?.alarm_battery.note_ar || '' : pre?.alarm_battery.note_en || '')}</p>

  <h2>${ar ? 'قائمة المطابقة' : 'Compliance checklist'}</h2>
  <table>
    <thead><tr>
      <th>${ar ? 'البند' : 'Item'}</th>
      <th>${ar ? 'الحالة' : 'Status'}</th>
      <th>${ar ? 'التفاصيل' : 'Detail'}</th>
      <th>${ar ? 'المراجع' : 'Codes'}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <p class="muted">${
    ar
      ? 'تقرير تقديري محلي — ليس اعتمادًا نهائيًا. يراجع المهندس المعتمد الجداول الرسمية SBC/NFPA.'
      : 'Local indicative report — not final approval. Licensed engineer must verify official SBC/NFPA tables.'
  }</p>
  <script type="application/json" id="compliance-json">${escapeHtml(
    JSON.stringify(report || {}, null, 2)
  )}</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadPreDesignAuditHtml(html: string, fileName: string) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Open printable window so the engineer can Save as PDF */
export function openPreDesignAuditPrint(html: string) {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
