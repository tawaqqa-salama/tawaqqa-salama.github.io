import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import type { QuotationDocumentsState } from '@/lib/types/quotation-documents';
import type { SalesPaymentType } from '@/lib/types/sales';

export interface InspectionChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export type PipelineStage = 'marketing' | 'sales' | 'finance' | 'projects' | 'completed';

export type DepartmentMode = 'marketing' | 'sales' | 'finance' | 'hr' | 'projects' | 'full';

export type FloorLevelKind =
  | 'ground'
  | 'typical'
  | 'basement'
  | 'mezzanine'
  | 'first'
  | 'second'
  | 'service'
  | 'parking'
  | 'roof'
  | 'upper_annex'
  | 'custom';

/** سطر مساحة/نشاط داخل الدور؛ التسمية وصفية ولا تُعامل وحدها كتصنيف كودي. */
export interface FloorUsage {
  id: string;
  area_m2: number;
  /** مفتاح النشاط/التصنيف الموجود في النظام، أو other عند عدم وجود تصنيف مناسب. */
  activity_type?: string | null;
  /** تسمية وصفية مستقلة مثل معرض تجاري أو مكاتب إدارية. */
  label?: string | null;
}

/** مستوى دور: المتكرر يُمثَّل كصف واحد مع repeat_count. */
export interface FloorLevel {
  id: string;
  label: string;
  kind: FloorLevelKind;
  /** الحقل legacy؛ يُشتق من usage rows عند القراءة ولا يُدخل إجماليًا يدويًا. */
  area_m2: number;
  repeat_count: number;
  /** التصنيف legacy للدور القديم. */
  activity_type?: string | null;
  /** الاستخدام legacy؛ يُحفظ للقراءة القديمة ولا يظهر في الواجهة الجديدة. */
  floor_use?: string | null;
  /** البنية الجديدة: أكثر من مساحة/نشاط داخل الدور الواحد. */
  usages?: FloorUsage[];
}

export interface ClientRecord {
  id: string;
  created_at?: string;
  client_code: string;
  name: string;
  owner_name?: string | null;
  phone?: string | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  plot_number?: string | null;
  /** السجل التجاري للعميل / المنشأة (الطرف الثاني في العقود) */
  commercial_register?: string | null;
  /** الرقم الضريبي للعميل (B2B — فاتورة ضريبية قياسية) */
  tax_number?: string | null;
  /** business = منشأة/حكومة، consumer = فرد */
  client_kind?: 'business' | 'consumer' | null;
  business_name?: string | null;
  activity_type?: string | null;
  land_area?: number | null;
  building_area?: number | null;
  floors_count?: number | null;
  floor_levels?: FloorLevel[] | null;
  project_status?: string | null;
  pipeline_stage?: PipelineStage | null;
  lead_status?: string | null;
  lead_notes?: string | null;
  /** مصدر العميل: WhatsApp | Website | Phone | Referral | Campaign | Other */
  lead_source?: string | null;
  /** قناة التواصل الأولى مثل whatsapp */
  source_channel?: string | null;
  first_contact_at?: string | null;
  whatsapp_profile_name?: string | null;
  email?: string | null;
  first_touch_source?: string | null;
  first_touch_medium?: string | null;
  first_touch_campaign?: string | null;
  first_touch_content?: string | null;
  last_touch_source?: string | null;
  last_touch_medium?: string | null;
  last_touch_campaign?: string | null;
  last_touch_content?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  attribution?: Record<string, unknown> | null;
  next_follow_up_date?: string | null;
  last_contact_date?: string | null;
  quotation_number?: string | null;
  quotation_amount?: number | null;
  vat_amount?: number | null;
  total_amount?: number | null;
  quotation_status?: string | null;
  quotation_visits_count?: number | null;
  /** معرفات الخدمات ضمن نطاق عرض السعر */
  quotation_services?: string[] | null;
  /**
   * مستندات قبل إصدار العرض:
   * رخصة البناء إلزامية؛ هوية المالك والسجل التجاري اختياريان
   */
  quotation_documents?: QuotationDocumentsState | null;
  financial_status?: string | null;
  payment_reference?: string | null;
  paid_amount?: number | null;
  sales_payment_type?: SalesPaymentType | null;
  credit_balance?: number | null;
  /** اسم عرض متوافق مع التقارير القديمة */
  assigned_engineer?: string | null;
  /** معرف المستخدم الحقيقي من جدول users في Supabase */
  assigned_engineer_id?: string | null;
  engineering_status?: string | null;
  engineering_notes?: string | null;
  visit_date?: string | null;
  visit_status?: string | null;
  inspection_checklist?: InspectionChecklistItem[] | null;
  project_engineering_data?: ProjectEngineeringData | null;
  final_report_status?: string | null;
  license_number?: string | null;
  license_expiry_date?: string | null;
  receipt_voucher_id?: string | null;
  accounting_journal_id?: string | null;
  national_address?: string | null;
}

export interface ClientFormData {
  owner_name: string;
  phone: string;
  region: string;
  city: string;
  district: string;
  street: string;
  plot_number: string;
  national_address: string;
  business_name: string;
  activity_type: string;
  land_area: string;
  building_area: string;
  floors_count: string;
  project_status: string;
  floor_levels?: FloorLevel[];
}

export type FinancialDocumentType = 'quotation' | 'invoice';

export interface FinancialDocument {
  id: string;
  documentType: FinancialDocumentType;
  documentNumber: string;
  clientId: string;
  clientName: string;
  clientCode?: string | null;
  ownerName?: string | null;
  phone?: string | null;
  businessName?: string | null;
  city?: string | null;
  region?: string | null;
  district?: string | null;
  street?: string | null;
  activityType?: string | null;
  activityTypeLabel?: string | null;
  landArea?: number | null;
  buildingArea?: number | null;
  floorsCount?: number | null;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  status: string;
  paidAmount: number;
  createdAt: string;
  quotationServices?: string[] | null;
  quotationVisitsCount?: number | null;
  pricePerM2?: number | null;
  projectName?: string | null;
  saleType?: string | null;
  quotationValidityDays?: number | null;
  generalTerms?: string[];
}
