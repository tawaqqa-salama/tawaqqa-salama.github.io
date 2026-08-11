/**
 * HTML fragment for Compliance Matrix (UI preview + PDF appendix).
 */

import type { ComplianceRunResult } from '@/lib/projects/compliance/types';
import { complianceStatusLabelAr } from '@/lib/projects/compliance/engine';

const STATUS_COLOR: Record<string, string> = {
  PASS: '#1f7a4d',
  FAIL: '#b42318',
  NEEDS_DATA: '#b54708',
  'N/A': '#667085',
};

export function buildComplianceMatrixHtml(run: ComplianceRunResult, opts?: { title?: string }): string {
  const title = opts?.title || 'مصفوفة المطابقة الكودية — SBC 201 / SBC 801';
  const rows = run.matrix
    .map((r) => {
      const color = STATUS_COLOR[r.status] || '#333';
      return `<tr>
        <td>${escapeHtml(r.requirement)}</td>
        <td>${escapeHtml(r.code)}</td>
        <td>${escapeHtml(r.section)}</td>
        <td>${escapeHtml(r.actual)}${r.required !== '—' ? ` / req ${escapeHtml(r.required)}` : ''}</td>
        <td style="color:${STATUS_COLOR[r.result] || '#333'};font-weight:700">${r.result}</td>
        <td>${escapeHtml(r.code_reference)}</td>
        <td>${escapeHtml(r.evidence)}</td>
        <td>${escapeHtml(r.engineerOverride)}</td>
        <td style="color:${color};font-weight:700">${r.status}</td>
      </tr>`;
    })
    .join('');

  const claim = complianceStatusLabelAr(run);
  const gateColor = run.gate === 'ALLOW' ? '#1f7a4d' : '#b42318';

  return `
<section class="sbc-compliance-matrix" dir="rtl" style="font-family:Tahoma,Arial,sans-serif;margin:24px 0">
  <h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(title)}</h2>
  <p style="margin:0 0 12px;font-size:13px;color:#444">
    الحكم النهائي حتمي بالقواعد — لا يُعلن «مطابق» إلا باجتياز كل المتطلبات الإلزامية.
    الحالة الإجمالية: <strong>${escapeHtml(claim)}</strong>
    — البوابة: <strong style="color:${gateColor}">${run.gate}</strong>
    (PASS ${run.counts.PASS} / FAIL ${run.counts.FAIL} / NEEDS_DATA ${run.counts.NEEDS_DATA} / N/A ${run.counts['N/A']})
  </p>
  ${
    run.gateReasons.length
      ? `<ul style="margin:0 0 12px;padding-inline-start:18px;font-size:12px;color:#b42318">${run.gateReasons
          .map((g) => `<li>${escapeHtml(g)}</li>`)
          .join('')}</ul>`
      : ''
  }
  <table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead>
      <tr style="background:#f2f4f7">
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Requirement</th>
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Code</th>
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Section</th>
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Actual / Required</th>
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Result</th>
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Code Reference</th>
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Evidence</th>
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Engineer Override</th>
        <th style="border:1px solid #d0d5dd;padding:6px;text-align:right">Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
