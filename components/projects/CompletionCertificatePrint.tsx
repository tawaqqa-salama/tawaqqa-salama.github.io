'use client';

import { PLATFORM_NAME } from '@/lib/constants/branding';
import type { ClientRecord } from '@/lib/types/client';
import type { CompletionCertificateReport } from '@/lib/types/project-reports';
import { formatDate } from '@/lib/format/currency';

function escapeHtml(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function printCompletionCertificate(client: ClientRecord, cert: CompletionCertificateReport) {
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/>
<style>body{font-family:'Segoe UI',Tahoma,sans-serif;margin:40px;color:#111} .header{text-align:center;border:3px double #1f4d3a;padding:24px;margin-bottom:32px} h1{color:#1f4d3a;margin:0} .row{margin:12px 0} .label{color:#666;font-size:14px} .value{font-size:16px;font-weight:600} .footer{margin-top:48px;text-align:center;font-size:12px;color:#666}</style></head><body>
<div class="header"><div style="font-size:14px;margin-bottom:8px">${escapeHtml(PLATFORM_NAME)}</div><h1>شهادة إنهاء الأعمال</h1><div>Work Completion Certificate</div></div>
<div class="row"><div class="label">رقم الشهادة</div><div class="value">${escapeHtml(cert.certificate_number || '—')}</div></div>
<div class="row"><div class="label">تاريخ الإصدار</div><div class="value">${escapeHtml(cert.issue_date ? formatDate(cert.issue_date) : '—')}</div></div>
<div class="row"><div class="label">اسم المشروع</div><div class="value">${escapeHtml(cert.project_name || client.business_name || client.name)}</div></div>
<div class="row"><div class="label">المالك</div><div class="value">${escapeHtml(cert.owner_name || client.owner_name || '—')}</div></div>
<div class="row"><div class="label">نطاق الأعمال</div><div class="value">${escapeHtml(cert.scope_of_work || '—')}</div></div>
<div class="row"><div class="label">تاريخ الإنجاز</div><div class="value">${escapeHtml(cert.completion_date ? formatDate(cert.completion_date) : '—')}</div></div>
<div class="row"><div class="label">المهندس المسؤول</div><div class="value">${escapeHtml(cert.engineer_name || client.assigned_engineer || '—')}</div></div>
<div class="footer">شهادة صادرة إلكترونياً — ${escapeHtml(new Date().toLocaleString('ar-SA'))}</div>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
