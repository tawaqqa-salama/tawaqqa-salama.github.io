'use client';

import { formatCurrency, formatDate } from '@/lib/format/currency';
import { amountToArabicWords } from '@/lib/format/arabic-amount';
import { getQuotationServiceLabel } from '@/lib/constants/quotation-services';
import {
  DEFAULT_COMPANY_PROFILE,
  loadCompanyProfile,
  type CompanyProfile,
} from '@/lib/company-profile';
import type { FinancialDocument } from '@/lib/types/client';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso || Date.now());
  if (Number.isNaN(date.getTime())) return formatDate(new Date().toISOString());
  date.setDate(date.getDate() + days);
  return formatDate(date.toISOString());
}

function buildServiceRows(document: FinancialDocument): string {
  const services = Array.isArray(document.quotationServices) ? document.quotationServices : [];
  const labels =
    services.length > 0
      ? services.map((id) => {
          const label = getQuotationServiceLabel(id);
          if (id === 'site_visits') {
            return `${label} (${Math.max(1, Number(document.quotationVisitsCount || 1))} زيارة)`;
          }
          return label;
        })
      : ['خدمات الدراسات والمخططات حسب نطاق العرض'];

  return labels
    .map((label, index) => {
      const price =
        index === 0
          ? escapeHtml(formatCurrency(document.subtotal))
          : 'ضمن الباقة';
      return `<tr>
        <td class="num">${index + 1}</td>
        <td>${escapeHtml(label)}</td>
        <td class="price">${price}</td>
      </tr>`;
    })
    .join('');
}

export function buildPrintHtml(
  document: FinancialDocument,
  company: CompanyProfile = DEFAULT_COMPANY_PROFILE
): string {
  const isQuotation = document.documentType === 'quotation';
  const title = isQuotation ? 'عرض أسعار' : 'فاتورة ضريبية';
  const companyName = company.legal_name || company.name;
  const clientLabel = document.businessName || document.clientName || '—';
  const validityDays = Math.max(1, Number(company.quotation_validity_days) || 14);
  const words = amountToArabicWords(document.totalAmount);
  const logo = company.logo_url
    ? `<img class="logo" src="${company.logo_url}" alt="شعار الشركة" />`
    : `<div class="logo-fallback">${escapeHtml(company.name || 'الشعار')}</div>`;
  const stamp = company.stamp_url
    ? `<img class="stamp-img" src="${company.stamp_url}" alt="الختم الرسمي" />`
    : `<div class="stamp-box">${escapeHtml(company.stamp_text || company.name || 'الختم')}</div>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} - ${escapeHtml(document.documentNumber)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111827;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 11px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .sheet {
      width: 190mm;
      min-height: 277mm;
      max-height: 277mm;
      margin: 0 auto;
      padding: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .header {
      display: grid;
      grid-template-columns: 1fr 1.2fr 1fr;
      gap: 8px;
      align-items: center;
      border-bottom: 2.5px solid #1f4d3a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }

    .logo, .logo-fallback {
      width: 68px;
      height: 68px;
      object-fit: contain;
    }

    .logo-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 700;
      color: #1f4d3a;
      text-align: center;
      padding: 4px;
    }

    .brand-wrap { text-align: center; }
    .brand-name {
      font-size: 16px;
      font-weight: 800;
      color: #1f4d3a;
      margin: 0 0 4px;
      line-height: 1.3;
    }
    .doc-title {
      margin: 0;
      font-size: 26px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: 0.5px;
    }
    .tagline {
      margin: 4px 0 0;
      font-size: 9px;
      color: #64748b;
    }

    .company-meta {
      text-align: left;
      font-size: 9.5px;
      color: #334155;
      line-height: 1.55;
    }
    .company-meta strong { color: #0f172a; }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 12px;
      margin-bottom: 10px;
      border: 1px solid #dbe3ea;
      border-radius: 8px;
      padding: 8px 10px;
      background: #f8fafc;
    }
    .meta-grid .item { font-size: 11px; }
    .meta-grid .label { color: #64748b; margin-left: 4px; }
    .meta-grid .value { font-weight: 700; color: #0f172a; }
    .client-line {
      grid-column: 1 / -1;
      font-size: 12px;
      padding-top: 2px;
      border-top: 1px dashed #cbd5e1;
    }

    table.services {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
    }
    table.services th,
    table.services td {
      border: 1px solid #94a3b8;
      padding: 6px 8px;
      text-align: right;
      vertical-align: middle;
    }
    table.services th {
      background: #1f4d3a;
      color: #fff;
      font-size: 11px;
    }
    table.services td.num {
      width: 28px;
      text-align: center;
      font-weight: 700;
      background: #f1f5f9;
    }
    table.services td.price {
      width: 110px;
      text-align: left;
      font-family: "Courier New", monospace;
      font-weight: 700;
      direction: ltr;
    }
    table.services tr.totals td {
      background: #f8fafc;
      font-weight: 700;
    }
    table.services tr.totals.due td {
      background: #e8f5ef;
      color: #14532d;
      font-size: 12px;
    }

    .words {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 7px 10px;
      margin-bottom: 8px;
      background: #fffbeb;
      font-size: 11px;
      font-weight: 700;
    }

    .footer-grid {
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: 10px;
      margin-top: 4px;
      flex: 1;
    }
    .panel {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      background: #fff;
    }
    .panel h3 {
      margin: 0 0 6px;
      font-size: 12px;
      color: #1f4d3a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .panel ul {
      margin: 0;
      padding: 0 16px 0 0;
      list-style: disc;
    }
    .panel li, .panel p {
      margin: 0 0 4px;
      font-size: 10.5px;
      line-height: 1.45;
      color: #1e293b;
    }
    .panel .muted { color: #64748b; font-size: 10px; }

    .signs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 10px;
      padding-top: 6px;
    }
    .sign {
      text-align: center;
      min-height: 78px;
    }
    .sign .title {
      font-size: 11px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 6px;
    }
    .stamp-img {
      width: 72px;
      height: 72px;
      object-fit: contain;
      margin: 0 auto 4px;
      display: block;
    }
    .stamp-box {
      width: 72px;
      height: 72px;
      margin: 0 auto 4px;
      border: 2px dashed #94a3b8;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 9px;
      font-weight: 700;
      color: #475569;
      padding: 6px;
    }
    .sign-line {
      margin-top: 28px;
      border-top: 1px solid #64748b;
      padding-top: 3px;
      font-size: 10px;
      color: #475569;
    }

    .tiny-note {
      margin-top: 6px;
      text-align: center;
      font-size: 8.5px;
      color: #94a3b8;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm;
      }

      html, body {
        width: auto;
        height: auto;
        overflow: hidden;
      }

      .sheet {
        width: auto;
        min-height: auto;
        max-height: none;
        margin: 0;
        overflow: hidden;
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
      }

      a[href]::after { content: none !important; }
      header, footer, .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>${logo}</div>
      <div class="brand-wrap">
        <p class="brand-name">${escapeHtml(companyName)}</p>
        <h1 class="doc-title">${escapeHtml(title)}</h1>
        ${company.tagline ? `<p class="tagline">${escapeHtml(company.tagline)}</p>` : ''}
      </div>
      <div class="company-meta">
        ${company.tax_number ? `<div><strong>الرقم الضريبي:</strong> ${escapeHtml(company.tax_number)}</div>` : ''}
        ${company.commercial_register ? `<div><strong>السجل التجاري:</strong> ${escapeHtml(company.commercial_register)}</div>` : ''}
        ${company.phone ? `<div><strong>الجوال:</strong> ${escapeHtml(company.phone)}</div>` : ''}
        ${company.email ? `<div><strong>البريد:</strong> ${escapeHtml(company.email)}</div>` : ''}
        ${company.address ? `<div><strong>العنوان:</strong> ${escapeHtml(company.address)}${company.city ? ` — ${escapeHtml(company.city)}` : ''}</div>` : ''}
      </div>
    </div>

    <div class="meta-grid">
      <div class="item"><span class="label">رقم ${isQuotation ? 'العرض' : 'الفاتورة'}:</span><span class="value">${escapeHtml(document.documentNumber)}</span></div>
      <div class="item"><span class="label">التاريخ:</span><span class="value">${escapeHtml(formatDate(document.createdAt))}</span></div>
      ${
        isQuotation
          ? `<div class="item"><span class="label">صلاحية العرض:</span><span class="value">${validityDays} يوم (حتى ${escapeHtml(addDays(document.createdAt, validityDays))})</span></div>`
          : `<div class="item"><span class="label">الحالة:</span><span class="value">${escapeHtml(document.status)}</span></div>`
      }
      <div class="item"><span class="label">كود العميل:</span><span class="value">${escapeHtml(document.clientCode || '—')}</span></div>
      <div class="item client-line">
        <span class="label">السادة / </span>
        <span class="value">${escapeHtml(clientLabel)} المحترمين</span>
        ${document.phone ? ` <span class="label">— جوال:</span> <span class="value">${escapeHtml(document.phone)}</span>` : ''}
      </div>
    </div>

    <table class="services">
      <thead>
        <tr>
          <th class="num">م</th>
          <th>البند / الخدمة</th>
          <th>السعر</th>
        </tr>
      </thead>
      <tbody>
        ${buildServiceRows(document)}
        <tr class="totals">
          <td colspan="2">المجموع</td>
          <td class="price">${escapeHtml(formatCurrency(document.subtotal))}</td>
        </tr>
        <tr class="totals">
          <td colspan="2">الضريبة 15%</td>
          <td class="price">${escapeHtml(formatCurrency(document.vatAmount))}</td>
        </tr>
        <tr class="totals due">
          <td colspan="2">المستحق الإجمالي</td>
          <td class="price">${escapeHtml(formatCurrency(document.totalAmount))}</td>
        </tr>
      </tbody>
    </table>

    <div class="words">المبلغ المستحق تفقيطاً: ${escapeHtml(words)}</div>

    <div class="footer-grid">
      <div class="panel">
        <h3>خطة السداد</h3>
        <ul>
          ${company.payment_first ? `<li>${escapeHtml(company.payment_first)}</li>` : ''}
          ${company.payment_second ? `<li>${escapeHtml(company.payment_second)}</li>` : ''}
          ${company.payment_final ? `<li>${escapeHtml(company.payment_final)}</li>` : ''}
        </ul>
        ${company.payment_terms ? `<p class="muted">${escapeHtml(company.payment_terms)}</p>` : ''}
      </div>
      <div class="panel">
        <h3>الحساب البنكي والبيانات الضريبية</h3>
        <p><strong>البنك:</strong> ${escapeHtml(company.bank_name || '—')}</p>
        <p><strong>رقم الحساب:</strong> ${escapeHtml(company.bank_account || '—')}</p>
        <p><strong>IBAN:</strong> <span dir="ltr">${escapeHtml(company.iban || '—')}</span></p>
        <p><strong>الرقم الضريبي:</strong> ${escapeHtml(company.tax_number || '—')}</p>
        <p><strong>السجل التجاري:</strong> ${escapeHtml(company.commercial_register || '—')}</p>
      </div>
    </div>

    <div class="signs">
      <div class="sign">
        <div class="title">اعتماد العميل</div>
        <div class="sign-line">التوقيع / الختم</div>
      </div>
      <div class="sign">
        <div class="title">اعتماد إدارة الشركة</div>
        ${stamp}
        <div class="sign-line">التوقيع والختم الرسمي</div>
      </div>
    </div>

    <div class="tiny-note">مستند صادر إلكترونياً — ${escapeHtml(companyName)}</div>
  </div>
</body>
</html>`;
}

async function openPrintWindow(html: string) {
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
  }, 300);
}

export async function printFinancialDocument(document: FinancialDocument) {
  const company = await loadCompanyProfile();
  await openPrintWindow(buildPrintHtml(document, company));
}

export async function exportFinancialDocument(document: FinancialDocument) {
  const company = await loadCompanyProfile();
  const html = buildPrintHtml(document, company);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${document.documentNumber}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
