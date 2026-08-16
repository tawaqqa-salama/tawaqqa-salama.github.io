import { normalizeQuotationServices } from '@/lib/constants/quotation-services';
import { clientToFinancialDocument } from '@/lib/invoices/document-mapper';
import type { ClientRecord } from '@/lib/types/client';

export function validateSavedQuotationForPrint(client: Partial<ClientRecord>): string | null {
  const missing: string[] = [];
  if (!client.quotation_number) missing.push('رقم عرض السعر');
  if (!(client.business_name || client.name)) missing.push('اسم العميل');
  if (Number(client.quotation_amount || 0) <= 0) missing.push('قيمة العرض');
  if (normalizeQuotationServices(client.quotation_services).length === 0) missing.push('الخدمات');
  return missing.length ? `لا يمكن إصدار عرض السعر قبل استكمال: ${missing.join('، ')}` : null;
}

export async function printSavedQuotation(client: ClientRecord): Promise<{ error: string | null }> {
  const validationError = validateSavedQuotationForPrint(client);
  if (validationError) return { error: validationError };
  const { printFinancialDocument } = await import('@/components/invoices/FinancialDocumentPrint');
  await printFinancialDocument(clientToFinancialDocument(client, { documentType: 'quotation' }));
  return { error: null };
}
