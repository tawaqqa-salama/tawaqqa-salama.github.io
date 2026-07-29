'use client';

import { PLATFORM_NAME } from '@/lib/constants/branding';
import type { SalesContract } from '@/lib/types/sales';
import type { ClientRecord } from '@/lib/types/client';
import { formatCurrency, formatDate } from '@/lib/format/currency';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildContractPrintHtml(contract: SalesContract, client: ClientRecord): string {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8" />
<style>
body{font-family:'Segoe UI',Tahoma,sans-serif;margin:40px;color:#1f2937}
.header{border-bottom:3px solid #1f4d3a;padding-bottom:16px;margin-bottom:24px}
.brand{font-size:20px;font-weight:bold;color:#1f4d3a}
.section{margin-bottom:20px}
.box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-top:8px}
.label{color:#6b7280;font-size:13px}
.value{font-weight:600;margin-top:4px}
.signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}
.line{border-top:1px solid #9ca3af;padding-top:8px;text-align:center;font-size:13px}
</style></head><body>
<div class="header"><div class="brand">${escapeHtml(PLATFORM_NAME)}</div><div>عقد خدمات استشارية — السلامة والوقاية من الحريق</div></div>
<h2>عقد خدمات استشارية</h2>
<p>رقم العقد: <strong>${escapeHtml(contract.contract_number)}</strong> | التاريخ: ${escapeHtml(formatDate(contract.contract_date))}</p>
<div class="section"><div class="label">الطرف الأول (المنصة)</div><div class="value">${escapeHtml(PLATFORM_NAME)}</div></div>
<div class="section"><div class="label">الطرف الثاني (العميل)</div><div class="value">${escapeHtml(client.business_name || client.name)} — ${escapeHtml(client.client_code)}</div></div>
<div class="section"><div class="label">عرض السعر المرتبط</div><div class="value">${escapeHtml(contract.quotation_number || '—')}</div></div>
<div class="section"><div class="label">نطاق الخدمة</div><div class="box">${escapeHtml(contract.service_scope || '—')}</div></div>
<div class="section"><div class="label">الشروط والأحكام</div><div class="box">${escapeHtml(contract.terms || '—')}</div></div>
<div class="section"><div class="label">القيمة الإجمالية</div><div class="value">${escapeHtml(formatCurrency(Number(contract.total_amount)))} (شامل ضريبة ${escapeHtml(formatCurrency(Number(contract.vat_amount)))})</div></div>
<div class="signatures"><div class="line">توقيع المنصة</div><div class="line">توقيع العميل</div></div>
</body></html>`;
}

export function printContract(contract: SalesContract, client: ClientRecord) {
  const html = buildContractPrintHtml(contract, client);
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
