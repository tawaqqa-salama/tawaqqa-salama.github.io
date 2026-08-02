'use client';

import { formatCurrency, formatDate } from '@/lib/format/currency';
import { amountToArabicWords } from '@/lib/format/arabic-amount';
import {
  DEFAULT_COMPANY_PROFILE,
  loadCompanyProfile,
  type CompanyProfile,
} from '@/lib/company-profile';
import { zatcaQrImageUrl } from '@/lib/invoices/qr-display';
import type { TaxInvoice, TaxInvoiceLineItem } from '@/lib/types/tax-invoice';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function lineRows(items: TaxInvoiceLineItem[] | null | undefined, isStandard: boolean): string {
  const rows = items?.length
    ? items
    : [
        {
          id: '1',
          description: 'خدمات استشارية',
          quantity: 1,
          unitPrice: 0,
          lineSubtotal: 0,
          vatAmount: 0,
          lineTotal: 0,
        },
      ];

  return rows
    .map(
      (line, index) => `<tr>
      <td class="num">${index + 1}</td>
      <td>${escapeHtml(line.description)}</td>
      <td class="num">${line.quantity}</td>
      <td class="price">${escapeHtml(formatCurrency(line.unitPrice))}</td>
      <td class="price">${escapeHtml(formatCurrency(line.lineSubtotal))}</td>
      ${
        isStandard
          ? `<td class="price">${escapeHtml(formatCurrency(line.vatAmount))}</td>
             <td class="price">${escapeHtml(formatCurrency(line.lineTotal))}</td>`
          : ''
      }
    </tr>`
    )
    .join('');
}

export function buildTaxInvoiceHtml(
  invoice: TaxInvoice,
  company: CompanyProfile = DEFAULT_COMPANY_PROFILE
): string {
  const isStandard = (invoice.invoice_type || '').toUpperCase() === 'STANDARD' || invoice.invoice_kind === 'standard';
  const title = isStandard ? 'فاتورة ضريبية قياسية' : 'فاتورة ضريبية مبسطة';
  const companyName = company.legal_name || company.name;
  const subtotal = Number(invoice.subtotal || 0);
  const vatAmount = Number(invoice.vat_amount || 0);
  const totalAmount = Number(invoice.total_amount || 0);
  const words = amountToArabicWords(totalAmount);
  const qrUrl = invoice.qr_base64 ? zatcaQrImageUrl(invoice.qr_base64, 150) : '';
  const logo = company.logo_url
    ? `<img class="logo" src="${escapeHtml(company.logo_url)}" alt="شعار" />`
    : `<div class="logo-fallback">${escapeHtml(company.name || 'الشعار')}</div>`;
  const stamp = company.stamp_url
    ? `<img class="stamp" src="${escapeHtml(company.stamp_url)}" alt="ختم" />`
    : `<div class="stamp-box">${escapeHtml(company.stamp_text || company.name)}</div>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)} — ${escapeHtml(invoice.invoice_number)}</title>
  <style>
    @page { size: A4 portrait; margin: 9mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #111;
      font-family: "Tahoma", "Segoe UI", Arial, sans-serif;
      font-size: 10.5px; line-height: 1.4;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .sheet { width: 100%; max-width: 192mm; margin: 0 auto; }
    .top {
      display: grid; grid-template-columns: 1fr 1.3fr 120px; gap: 8px;
      border-bottom: 2px solid #1f4d3a; padding-bottom: 8px; margin-bottom: 8px;
      align-items: start;
    }
    .logo, .logo-fallback {
      width: 54px; height: 54px; object-fit: contain; display: block; margin: 0 auto 4px;
    }
    .logo-fallback {
      border: 1px solid #cbd5e1; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 8px; font-weight: 800; color: #1f4d3a; text-align: center; padding: 4px;
    }
    .brand { text-align: center; }
    .brand h1 { margin: 0; font-size: 15px; color: #1f4d3a; }
    .brand .sub { margin: 2px 0 0; font-size: 9px; color: #64748b; }
    .meta { font-size: 9px; line-height: 1.45; }
    .meta div { margin-bottom: 1px; }
    .qr-wrap { text-align: center; }
    .qr-wrap img { width: 110px; height: 110px; object-fit: contain; border: 1px solid #e2e8f0; }
    .qr-label { font-size: 8px; color: #64748b; margin-top: 2px; }
    .badge {
      display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px;
      background: #ecfdf5; color: #065f46; font-size: 9px; font-weight: 800;
    }
    .parties {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;
    }
    .box {
      border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; background: #f8fafc;
    }
    .box h3 { margin: 0 0 4px; font-size: 10px; color: #1f4d3a; }
    .box p { margin: 0 0 2px; }
    table.lines { width: 100%; border-collapse: collapse; margin: 0 0 8px; }
    table.lines th, table.lines td {
      border: 1px solid #64748b; padding: 4px 5px; vertical-align: middle;
    }
    table.lines th { background: #1f4d3a; color: #fff; font-size: 9px; }
    td.num, th.num { text-align: center; width: 28px; }
    td.price { text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .totals {
      width: 48%; margin-right: auto; border-collapse: collapse; margin-bottom: 8px;
    }
    .totals td { border: 1px solid #94a3b8; padding: 4px 6px; }
    .totals td.k { background: #f1f5f9; font-weight: 700; width: 55%; }
    .totals tr.due td { background: #ecfdf5; font-weight: 900; }
    .words {
      border: 1px dashed #94a3b8; border-radius: 6px; padding: 5px 7px; margin-bottom: 8px;
      font-size: 9.5px;
    }
    .signs {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px;
      page-break-inside: avoid;
    }
    .sign { text-align: center; }
    .sign .t { font-weight: 800; margin-bottom: 4px; }
    .stamp { width: 56px; height: 56px; object-fit: contain; margin: 0 auto; display: block; }
    .stamp-box {
      width: 56px; height: 56px; margin: 0 auto; border: 1.5px dashed #94a3b8; border-radius: 999px;
      display: flex; align-items: center; justify-content: center; text-align: center;
      font-size: 7px; font-weight: 700; color: #475569; padding: 4px;
    }
    .sign-line { margin-top: 16px; border-top: 1px solid #64748b; padding-top: 3px; font-size: 8px; color: #64748b; }
    .foot {
      margin-top: 8px; font-size: 8px; color: #64748b; text-align: center;
      border-top: 1px solid #e2e8f0; padding-top: 4px;
    }
    @media print {
      .sheet { max-width: none; }
      a[href]::after { content: none !important; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="meta">
        <div><strong>الرقم الضريبي للبائع:</strong> ${escapeHtml(company.tax_number || '—')}</div>
        <div><strong>السجل التجاري:</strong> ${escapeHtml(company.commercial_register || '—')}</div>
        <div><strong>رقم الفاتورة:</strong> ${escapeHtml(invoice.invoice_number)}</div>
        <div><strong>تاريخ الإصدار:</strong> ${escapeHtml(formatDate(invoice.issue_date || invoice.created_at))}</div>
        <div><strong>حالة ZATCA:</strong> ${escapeHtml(invoice.status || '—')}</div>
      </div>
      <div class="brand">
        ${logo}
        <h1>${escapeHtml(companyName)}</h1>
        <div class="sub">${escapeHtml(title)} — ZATCA Phase 2</div>
        <span class="badge">${isStandard ? 'STANDARD / B2B' : 'SIMPLIFIED / B2C'}</span>
      </div>
      <div class="qr-wrap">
        ${
          qrUrl
            ? `<img src="${escapeHtml(qrUrl)}" alt="ZATCA QR" />
               <div class="qr-label">رمز الاستجابة السريعة ZATCA</div>`
            : `<div class="qr-label">QR غير متوفر</div>`
        }
      </div>
    </div>

    <div class="parties">
      <div class="box">
        <h3>بيانات البائع</h3>
        <p>${escapeHtml(companyName)}</p>
        <p>VAT: <span dir="ltr">${escapeHtml(company.tax_number || '—')}</span></p>
        <p>س.ت: ${escapeHtml(company.commercial_register || '—')}</p>
        <p>${escapeHtml([company.address, company.city].filter(Boolean).join(' — ') || '—')}</p>
      </div>
      <div class="box">
        <h3>بيانات المشتري</h3>
        <p>${escapeHtml(invoice.buyer_name || '—')}</p>
        ${
          isStandard
            ? `<p>الرقم الضريبي: <span dir="ltr">${escapeHtml(invoice.buyer_vat || '—')}</span></p>
               <p>السجل التجاري: ${escapeHtml(invoice.buyer_cr || '—')}</p>`
            : `<p class="sub">فاتورة مبسطة — لا يُشترط الرقم الضريبي للمشتري</p>`
        }
      </div>
    </div>

    <table class="lines">
      <thead>
        <tr>
          <th class="num">م</th>
          <th>البيان</th>
          <th>الكمية</th>
          <th>سعر الوحدة</th>
          <th>الإجمالي قبل الضريبة</th>
          ${isStandard ? '<th>ضريبة 15%</th><th>الإجمالي شامل الضريبة</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${lineRows(invoice.line_items, isStandard)}
      </tbody>
    </table>

    <table class="totals">
      <tr><td class="k">المجموع الخاضع للضريبة</td><td class="price">${escapeHtml(formatCurrency(subtotal))}</td></tr>
      <tr><td class="k">ضريبة القيمة المضافة 15%</td><td class="price">${escapeHtml(formatCurrency(vatAmount))}</td></tr>
      <tr class="due"><td class="k">الإجمالي المستحق</td><td class="price">${escapeHtml(formatCurrency(totalAmount))}</td></tr>
    </table>

    <div class="words">المبلغ تفقيطاً: ${escapeHtml(words)}</div>
    ${invoice.notes ? `<div class="words"><strong>ملاحظات:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}

    <div class="signs">
      <div class="sign">
        <div class="t">ختم المنشأة</div>
        ${stamp}
        <div class="sign-line">الختم الرسمي</div>
      </div>
      <div class="sign">
        <div class="t">المحاسب / المالية</div>
        <div class="sign-line">التوقيع</div>
      </div>
      <div class="sign">
        <div class="t">اعتماد الإدارة</div>
        <div class="sign-line">التوقيع</div>
      </div>
    </div>

    <div class="foot">
      مستند إلكتروني متوافق مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA) — Phase 2
      ${invoice.uuid ? ` — UUID: ${escapeHtml(invoice.uuid)}` : ''}
    </div>
  </div>
</body>
</html>`;
}

export async function printTaxInvoice(invoice: TaxInvoice) {
  const company = await loadCompanyProfile();
  const html = buildTaxInvoiceHtml(invoice, company);
  const { openDocumentPreview } = await import('@/lib/print/document-preview');
  openDocumentPreview({
    title: `فاتورة ضريبية ${invoice.invoice_number}`,
    html,
    fileName: invoice.invoice_number,
  });
}

export async function downloadTaxInvoice(invoice: TaxInvoice) {
  const company = await loadCompanyProfile();
  const html = buildTaxInvoiceHtml(invoice, company);
  const { downloadHtmlDocument } = await import('@/lib/print/document-preview');
  downloadHtmlDocument(html, invoice.invoice_number);
}

export async function shareTaxInvoiceWhatsApp(invoice: TaxInvoice, phone?: string | null) {
  const total = formatCurrency(Number(invoice.total_amount || 0));
  const text = `فاتورة ضريبية رقم ${invoice.invoice_number}\nالمبلغ: ${total}\nالتاريخ: ${formatDate(invoice.issue_date || invoice.created_at)}\nالحالة: ${invoice.business_status || invoice.status}`;
  const { openWhatsAppChat, buildWhatsAppShareUrl } = await import('@/lib/notifications/whatsapp-link');
  if (phone?.trim()) {
    const result = openWhatsAppChat(phone, text);
    if (!result.ok) {
      // رقم غير صالح — افتح واتساب بدون رقم محدد
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
    return;
  }
  const url = buildWhatsAppShareUrl('0500000000', text);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  void url;
}
