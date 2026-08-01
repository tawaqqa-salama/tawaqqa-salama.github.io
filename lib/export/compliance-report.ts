import type { ComplianceValidationResult } from '@/lib/compliance/types';
import { getEkbTopic } from '@/lib/compliance/ekb-catalog';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** تقرير امتثال HTML جاهز للطباعة/PDF عبر المتصفح */
export function buildComplianceReportHtml(
  result: ComplianceValidationResult,
  meta?: { projectName?: string; preparedBy?: string }
): string {
  const findings = result.findings
    .map(
      (f) => `<tr>
      <td>${escapeHtml(f.standard)}</td>
      <td>${escapeHtml(f.code)}</td>
      <td>${escapeHtml(f.severity)}</td>
      <td><strong>${escapeHtml(f.title)}</strong><br/><span style="color:#64748b">${escapeHtml(f.detail)}</span></td>
    </tr>`
    )
    .join('');

  const ekb = result.ekbHints
    .map((id) => getEkbTopic(id))
    .filter(Boolean)
    .map((t) => `<li><strong>${escapeHtml(t!.title)}</strong> — ${escapeHtml(t!.summary)}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير امتثال SBC/NFPA</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; color: #111; }
    h1 { color: #1f4d3a; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; vertical-align: top; }
    th { background: #1f4d3a; color: #fff; }
    .meta { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  </style>
</head>
<body>
  <h1>تقرير الامتثال — SBC &amp; NFPA</h1>
  <div class="meta">
    <div>المشروع: <strong>${escapeHtml(meta?.projectName || '—')}</strong></div>
    <div>أعدّه: <strong>${escapeHtml(meta?.preparedBy || '—')}</strong></div>
    <div>النتيجة: <strong>${result.ok ? 'مقبول مع ملاحظات' : 'يتطلب معالجة'}</strong> — الدرجة ${result.score}</div>
    <div>${escapeHtml(result.summary)}</div>
  </div>
  <table>
    <thead><tr><th>المعيار</th><th>الكود</th><th>الحالة</th><th>البند</th></tr></thead>
    <tbody>${findings}</tbody>
  </table>
  <h2>مواضيع قاعدة المعرفة (EKB)</h2>
  <ul>${ekb || '<li>لا توجد مواضيع مرتبطة</li>'}</ul>
</body>
</html>`;
}

/**
 * يصدّر مستند Word بسيطاً بصيغة HTML متوافقة مع Word (يفتح كـ .doc/.docx في أغلب الحالات).
 * لا ننفّذ ثنائيات OOXML معقدة هنا — صيغة آمنة وخفيفة.
 */
export function buildComplianceReportDocHtml(result: ComplianceValidationResult, meta?: { projectName?: string; preparedBy?: string }): string {
  return buildComplianceReportHtml(result, meta);
}

export function downloadTextFile(content: string, fileName: string, mime: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
