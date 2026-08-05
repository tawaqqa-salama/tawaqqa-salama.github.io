/** مرفق مستند مطلوب/اختياري قبل إصدار عرض السعر */
export type QuotationDocumentKind =
  | 'building_permit'
  | 'owner_id'
  | 'commercial_register';

export type QuotationDocumentFile = {
  id: string;
  fileName: string;
  format: string;
  sizeBytes: number;
  mimeType?: string | null;
  /** معاينة مضمّنة أو رابط عام */
  dataUrl?: string | null;
  storagePath?: string | null;
  storageBucket?: string | null;
  uploadedAt: string;
  kind: QuotationDocumentKind;
};

/**
 * مستندات عرض السعر:
 * - رخصة البناء: إلزامية قبل الإصدار
 * - هوية المالك / السجل التجاري: اختياريان
 */
export type QuotationDocumentsState = {
  building_permit: QuotationDocumentFile | null;
  owner_id: QuotationDocumentFile | null;
  commercial_register: QuotationDocumentFile | null;
};

export const EMPTY_QUOTATION_DOCUMENTS: QuotationDocumentsState = {
  building_permit: null,
  owner_id: null,
  commercial_register: null,
};

export const QUOTATION_DOCUMENT_LABELS: Record<QuotationDocumentKind, string> = {
  building_permit: 'رخصة البناء',
  owner_id: 'هوية المالك',
  commercial_register: 'السجل التجاري',
};
