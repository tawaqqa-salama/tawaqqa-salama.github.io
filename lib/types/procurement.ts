export type VendorType = 'supplier' | 'subcontractor';
export type VendorStatus = 'active' | 'pending' | 'suspended';
export type PurchaseOrderStatus = 'draft' | 'submitted' | 'approved' | 'ordered' | 'received' | 'cancelled';
export type RfqStatus = 'draft' | 'sent' | 'quoted' | 'awarded' | 'cancelled';
export type PurchaseCategory =
  | 'equipment'
  | 'tools'
  | 'testing'
  | 'software'
  | 'services'
  | 'other';

export type ProcurementLineItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type ProcurementVendor = {
  id: string;
  name: string;
  vendor_type: VendorType;
  specialty: string | null;
  commercial_register: string | null;
  tax_number: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  certification_notes: string | null;
  status: VendorStatus;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PurchaseOrder = {
  id: string;
  po_number: string;
  vendor_id: string | null;
  client_id: string | null;
  title: string;
  category: PurchaseCategory;
  status: PurchaseOrderStatus;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  line_items: ProcurementLineItem[];
  notes: string | null;
  requested_at: string | null;
  needed_by: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProcurementRfq = {
  id: string;
  rfq_number: string;
  client_id: string | null;
  vendor_id: string | null;
  source_boq: boolean;
  title: string;
  status: RfqStatus;
  line_items: ProcurementLineItem[];
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  supplier: 'مورد معتمد',
  subcontractor: 'مقاول / استشاري خارجي',
};

export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'مسودة',
  submitted: 'مقدّم',
  approved: 'معتمد',
  ordered: 'تم الطلب',
  received: 'مستلم',
  cancelled: 'ملغي',
};

export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  draft: 'مسودة',
  sent: 'مُرسل',
  quoted: 'ورد عرض',
  awarded: 'مُرسى',
  cancelled: 'ملغي',
};

export const PURCHASE_CATEGORY_LABELS: Record<PurchaseCategory, string> = {
  equipment: 'معدات سلامة / إطفاء / إنذار',
  tools: 'أدوات هندسية ميدانية',
  testing: 'أجهزة اختبار وقياس',
  software: 'تراخيص برمجيات',
  services: 'خدمات استشارية / اختبار طرف ثالث',
  other: 'أخرى',
};
