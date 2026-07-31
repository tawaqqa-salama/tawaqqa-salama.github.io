'use client';

import { formatCurrency, formatDate } from '@/lib/format/currency';
import { PLATFORM_NAME } from '@/lib/constants/branding';
import { getQuotationServiceLabel } from '@/lib/constants/quotation-services';
import type { FinancialDocument } from '@/lib/types/client';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildServicesSection(document: FinancialDocument): string {
  const services = Array.isArray(document.quotationServices) ? document.quotationServices : [];
  if (services.length === 0) return '';

  const rows = services
    .map((id) => {
      const label = getQuotationServiceLabel(id);
      const detail =
        id === 'site_visits'
          ? ` — ${Math.max(1, Number(document.quotationVisitsCount || 1))} زيارة`
          : '';
      return `<tr><td>${escapeHtml(label)}${escapeHtml(detail)}</td><td>مشمول</td></tr>`;
    })
    .join('');

  return `
  <div class="section">
    <h3>نطاق عرض السعر / الخدمات المشمولة</h3>
    <table>
      <thead>
        <tr>
          <th>الخدمة</th>
          <th>الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
}

function buildPricingHint(document: FinancialDocument): string {
  if (!document.pricePerM2 || !document.buildingArea) return '';
  return `<div class="box" style="margin-top:8px">
    <strong>أساس التسعير:</strong>
    ${document.buildingArea} م² × ${escapeHtml(formatCurrency(document.pricePerM2))} / م²
  </div>`;
}

export function buildPrintHtml(document: FinancialDocument): string {
  const title = document.documentType === 'quotation' ? 'عرض سعر' : 'فاتورة ضريبية';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} - ${escapeHtml(document.documentNumber)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; margin: 24px; color: #1f2937; }
    .header { display: flex; justify-content: space-between; border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: bold; color: #2563eb; }
    .meta { text-align: left; font-size: 14px; color: #6b7280; }
    .section { margin-bottom: 20px; }
    .section h3 { margin: 0 0 8px; font-size: 16px; color: #111827; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: right; }
    th { background: #eff6ff; }
    .total { font-size: 18px; font-weight: bold; color: #2563eb; }
    .footer { margin-top: 32px; font-size: 12px; color: #6b7280; text-align: center; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 12px; }
    @media print {
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${escapeHtml(PLATFORM_NAME)}</div>
      <div>استشارات السلامة والوقاية من الحريق</div>
    </div>
    <div class="meta">
      <div>${escapeHtml(title)}</div>
      <div>رقم المستند: ${escapeHtml(document.documentNumber)}</div>
      <div>التاريخ: ${escapeHtml(formatDate(document.createdAt))}</div>
      <div>الحالة: ${escapeHtml(document.status)}</div>
    </div>
  </div>

  <div class="section">
    <h3>بيانات العميل / المنشأة</h3>
    <div class="grid">
      <div class="box"><strong>كود العميل:</strong> ${escapeHtml(document.clientCode || '—')}</div>
      <div class="box"><strong>اسم العميل:</strong> ${escapeHtml(document.clientName)}</div>
      <div class="box"><strong>اسم المنشأة:</strong> ${escapeHtml(document.businessName || '—')}</div>
      <div class="box"><strong>الجوال:</strong> ${escapeHtml(document.phone || '—')}</div>
      <div class="box"><strong>المنطقة:</strong> ${escapeHtml(document.region || '—')}</div>
      <div class="box"><strong>المدينة:</strong> ${escapeHtml(document.city || '—')}</div>
      <div class="box"><strong>الحي:</strong> ${escapeHtml(document.district || '—')}</div>
      <div class="box"><strong>الشارع:</strong> ${escapeHtml(document.street || '—')}</div>
    </div>
  </div>

  <div class="section">
    <h3>بيانات كود البناء والنشاط</h3>
    <div class="grid">
      <div class="box"><strong>نوع النشاط:</strong> ${escapeHtml(document.activityTypeLabel || document.activityType || '—')}</div>
      <div class="box"><strong>مساحة الأرض:</strong> ${document.landArea ? `${document.landArea} م²` : '—'}</div>
      <div class="box"><strong>مساحة المبنى:</strong> ${document.buildingArea ? `${document.buildingArea} م²` : '—'}</div>
      <div class="box"><strong>عدد الأدوار:</strong> ${document.floorsCount ?? '—'}</div>
    </div>
    ${buildPricingHint(document)}
  </div>

  ${buildServicesSection(document)}

  <div class="section">
    <h3>التفاصيل المالية <span class="badge">ضريبة القيمة المضافة 15%</span></h3>
    <table>
      <thead>
        <tr>
          <th>البيان</th>
          <th>المبلغ</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>المبلغ الأساسي (قبل ضريبة القيمة المضافة)</td>
          <td>${escapeHtml(formatCurrency(document.subtotal))}</td>
        </tr>
        <tr>
          <td>ضريبة القيمة المضافة (15%)</td>
          <td>${escapeHtml(formatCurrency(document.vatAmount))}</td>
        </tr>
        <tr>
          <td><strong>الإجمالي شامل الضريبة</strong></td>
          <td class="total">${escapeHtml(formatCurrency(document.totalAmount))}</td>
        </tr>
        <tr>
          <td>المبلغ المدفوع</td>
          <td>${escapeHtml(formatCurrency(document.paidAmount))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    مستند صادر إلكترونياً من ${escapeHtml(PLATFORM_NAME)} — ${escapeHtml(new Date().toLocaleString('ar-SA'))}
  </div>
</body>
</html>`;
}

export function printFinancialDocument(document: FinancialDocument) {
  const html = buildPrintHtml(document);
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

export function exportFinancialDocument(document: FinancialDocument) {
  const html = buildPrintHtml(document);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${document.documentNumber}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
