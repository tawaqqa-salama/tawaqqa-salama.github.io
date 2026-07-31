import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { normalizeQuotationServices } from '@/lib/constants/quotation-services';
import { calculateTotalAmount, calculateVatAmount } from '@/lib/business/client-workflow';
import type { ClientRecord, FinancialDocument, FinancialDocumentType } from '@/lib/types/client';

export function getClientBuildingProfile(client: Partial<ClientRecord>) {
  return {
    clientCode: client.client_code ?? null,
    ownerName: client.owner_name ?? null,
    phone: client.phone ?? null,
    businessName: client.business_name ?? null,
    city: client.city ?? null,
    region: client.region ?? null,
    district: client.district ?? null,
    street: client.street ?? null,
    activityType: client.activity_type ?? null,
    activityTypeLabel:
      ACTIVITY_RULES[client.activity_type || '']?.label || client.activity_type || null,
    landArea: client.land_area ?? null,
    buildingArea: client.building_area ?? null,
    floorsCount: client.floors_count ?? null,
  };
}

export function clientToFinancialDocument(
  client: ClientRecord,
  options?: {
    documentType?: FinancialDocumentType;
    documentNumber?: string;
    services?: string[] | null;
    visitsCount?: number | null;
    pricePerM2?: number | null;
    createdAt?: string;
  }
): FinancialDocument {
  const subtotal = Number(client.quotation_amount || 0);
  const services = normalizeQuotationServices(options?.services ?? client.quotation_services);

  return {
    id: client.id,
    documentType: options?.documentType || 'quotation',
    documentNumber:
      options?.documentNumber ||
      client.quotation_number ||
      (options?.documentType === 'invoice' ? 'فاتورة-مسودة' : 'عرض-مسودة'),
    clientId: client.id,
    clientName: client.name,
    ...getClientBuildingProfile(client),
    subtotal,
    vatAmount: Number(client.vat_amount || calculateVatAmount(subtotal)),
    totalAmount: Number(client.total_amount || calculateTotalAmount(subtotal)),
    status: client.quotation_status || 'مسودة',
    paidAmount: Number(client.paid_amount || 0),
    createdAt: options?.createdAt || client.created_at || new Date().toISOString(),
    quotationServices: services,
    quotationVisitsCount:
      options?.visitsCount != null
        ? options.visitsCount
        : Number(client.quotation_visits_count || 1),
    pricePerM2: options?.pricePerM2 ?? null,
  };
}
