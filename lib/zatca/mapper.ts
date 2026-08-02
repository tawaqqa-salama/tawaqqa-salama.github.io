import { getQuotationServiceLabel, normalizeQuotationServices } from '@/lib/constants/quotation-services';
import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type { ZatcaInvoiceInput, ZatcaInvoiceKind, ZatcaInvoiceLine } from '@/lib/zatca/types';

function round2(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

function splitIssueDateTime(iso?: string | null): { issueDate: string; issueTime: string } {
  const date = iso ? new Date(iso) : new Date();
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const issueDate = safe.toISOString().slice(0, 10);
  const issueTime = `${String(safe.getUTCHours()).padStart(2, '0')}:${String(safe.getUTCMinutes()).padStart(2, '0')}:${String(safe.getUTCSeconds()).padStart(2, '0')}`;
  return { issueDate, issueTime };
}

export function mapClientToZatcaInput(options: {
  client: ClientRecord;
  company: CompanyProfile;
  invoiceNumber: string;
  invoiceKind: ZatcaInvoiceKind;
  previousInvoiceHash: string;
  uuid?: string;
}): Omit<ZatcaInvoiceInput, 'uuid'> & { uuid?: string } {
  const { client, company, invoiceNumber, invoiceKind, previousInvoiceHash, uuid } = options;
  const subtotal = round2(Number(client.quotation_amount || 0));
  const vatAmount = round2(Number(client.vat_amount || subtotal * 0.15));
  const totalAmount = round2(Number(client.total_amount || subtotal + vatAmount));
  const { issueDate, issueTime } = splitIssueDateTime(client.created_at);

  const services = normalizeQuotationServices(client.quotation_services);
  const labels =
    services.length > 0
      ? services.map((id) => {
          const label = getQuotationServiceLabel(id);
          return id === 'site_visits'
            ? `${label} (${Math.max(1, Number(client.quotation_visits_count || 1))} زيارة)`
            : label;
        })
      : ['خدمات استشارات السلامة والوقاية من الحريق'];

  const lines: ZatcaInvoiceLine[] = labels.map((name, index) => {
    const isFirst = index === 0;
    const lineExtensionAmount = isFirst ? subtotal : 0;
    const taxAmount = isFirst ? vatAmount : 0;
    return {
      id: String(index + 1),
      name,
      quantity: 1,
      unitPrice: lineExtensionAmount,
      lineExtensionAmount,
      taxAmount,
      taxPercent: 15,
    };
  });

  return {
    uuid,
    invoiceNumber,
    issueDate,
    issueTime,
    invoiceKind,
    previousInvoiceHash,
    seller: {
      name: company.legal_name || company.name,
      vatNumber: company.tax_number || '',
      crNumber: company.commercial_register || '',
      street: company.address || company.city || 'Riyadh',
      city: company.city || 'Riyadh',
      district: company.city || 'Riyadh',
      countryCode: 'SA',
    },
    buyer: {
      name: client.business_name || client.name,
      vatNumber: client.tax_number || undefined,
      street: client.street || client.district || undefined,
      city: client.city || undefined,
      countryCode: 'SA',
    },
    lines,
    lineExtensionAmount: subtotal,
    taxExclusiveAmount: subtotal,
    taxAmount: vatAmount,
    payableAmount: totalAmount,
    currency: 'SAR',
  };
}
