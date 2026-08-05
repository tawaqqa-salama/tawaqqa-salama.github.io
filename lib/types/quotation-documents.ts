/** مرفق مستند مطلوب/اختياري قبل إصدار عرض السعر / ملف العميل */
export type QuotationDocumentKind =
  | 'building_permit'
  | 'owner_id'
  | 'commercial_register'
  | 'lease_or_deed'
  | 'electrical_certificate'
  | 'maintenance_contract'
  | 'eia_report'
  | 'other';

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
 * مستندات العميل / عرض السعر:
 * - رخصة البناء: إلزامية قبل الإصدار
 * - الباقي اختياري (هوية، سجل، إيجار، تمديدات كهرباء، صيانة، EIA، أخرى)
 */
export type QuotationDocumentsState = {
  building_permit: QuotationDocumentFile | null;
  owner_id: QuotationDocumentFile | null;
  commercial_register: QuotationDocumentFile | null;
  lease_or_deed: QuotationDocumentFile | null;
  electrical_certificate: QuotationDocumentFile | null;
  maintenance_contract: QuotationDocumentFile | null;
  eia_report: QuotationDocumentFile | null;
  other: QuotationDocumentFile | null;
};

export const EMPTY_QUOTATION_DOCUMENTS: QuotationDocumentsState = {
  building_permit: null,
  owner_id: null,
  commercial_register: null,
  lease_or_deed: null,
  electrical_certificate: null,
  maintenance_contract: null,
  eia_report: null,
  other: null,
};

export const QUOTATION_DOCUMENT_LABELS: Record<QuotationDocumentKind, string> = {
  building_permit: 'رخصة البناء',
  owner_id: 'هوية المالك',
  commercial_register: 'السجل التجاري',
  lease_or_deed: 'عقد الإيجار / صك الملكية',
  electrical_certificate: 'شهادة تمديدات الكهرباء',
  maintenance_contract: 'عقد صيانة أنظمة السلامة',
  eia_report: 'تقرير الأثر البيئي (EIA)',
  other: 'مستند آخر',
};

/** ترتيب العرض في واجهة الرفع */
export const QUOTATION_DOCUMENT_SLOTS: {
  kind: QuotationDocumentKind;
  key: keyof QuotationDocumentsState;
  required: boolean;
  hint: string;
  group: 'core' | 'supporting';
}[] = [
  {
    kind: 'building_permit',
    key: 'building_permit',
    required: true,
    hint: 'إلزامي — يستخرج المالك والحي والشارع والعنوان ورقم الرخصة',
    group: 'core',
  },
  {
    kind: 'owner_id',
    key: 'owner_id',
    required: false,
    hint: 'اختياري — هوية المالك',
    group: 'core',
  },
  {
    kind: 'commercial_register',
    key: 'commercial_register',
    required: false,
    hint: 'اختياري — السجل التجاري للمنشأة',
    group: 'core',
  },
  {
    kind: 'lease_or_deed',
    key: 'lease_or_deed',
    required: false,
    hint: 'اختياري — عقد إيجار ساري أو صك ملكية',
    group: 'supporting',
  },
  {
    kind: 'electrical_certificate',
    key: 'electrical_certificate',
    required: false,
    hint: 'اختياري — شهادة سلامة التمديدات الكهربائية',
    group: 'supporting',
  },
  {
    kind: 'maintenance_contract',
    key: 'maintenance_contract',
    required: false,
    hint: 'اختياري — عقد صيانة أنظمة الوقاية من الحريق',
    group: 'supporting',
  },
  {
    kind: 'eia_report',
    key: 'eia_report',
    required: false,
    hint: 'اختياري — تقرير الأثر البيئي (EIA) عند الطلب',
    group: 'supporting',
  },
  {
    kind: 'other',
    key: 'other',
    required: false,
    hint: 'اختياري — أي مستند داعم إضافي',
    group: 'supporting',
  },
];
