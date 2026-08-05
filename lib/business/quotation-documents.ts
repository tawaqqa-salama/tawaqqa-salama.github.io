import {
  EMPTY_QUOTATION_DOCUMENTS,
  type QuotationDocumentFile,
  type QuotationDocumentsState,
} from '@/lib/types/quotation-documents';

function isDocumentFile(value: unknown): value is QuotationDocumentFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as QuotationDocumentFile;
  return Boolean(file.id && file.fileName && file.kind);
}

/** تطبيع حالة مستندات عرض السعر من التخزين / قاعدة البيانات */
export function normalizeQuotationDocuments(value: unknown): QuotationDocumentsState {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_QUOTATION_DOCUMENTS };
  }
  const raw = value as Partial<QuotationDocumentsState>;
  return {
    building_permit: isDocumentFile(raw.building_permit) ? raw.building_permit : null,
    owner_id: isDocumentFile(raw.owner_id) ? raw.owner_id : null,
    commercial_register: isDocumentFile(raw.commercial_register) ? raw.commercial_register : null,
  };
}

export function hasBuildingPermitAttached(docs: QuotationDocumentsState | null | undefined): boolean {
  return Boolean(docs?.building_permit?.fileName);
}

/**
 * التحقق قبل إصدار / طباعة عرض السعر.
 * رخصة البناء إلزامية؛ هوية المالك والسجل التجاري اختياريان.
 */
export function validateQuotationDocumentsForIssue(
  docs: QuotationDocumentsState | null | undefined
): string | null {
  if (!hasBuildingPermitAttached(docs)) {
    return 'إرفاق رخصة البناء إلزامي قبل إصدار عرض السعر.';
  }
  return null;
}
