import type { ZatcaInvoiceKind, ZatcaSubmissionStatus } from '@/lib/zatca/types';

/** نوع الفاتورة الضريبية المعروض للمستخدم */
export type TaxInvoiceType = 'STANDARD' | 'SIMPLIFIED';

/** حالة الفاتورة التشغيلية */
export type TaxInvoiceBusinessStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';

export type PaymentMilestoneStatus = 'pending' | 'ready' | 'completed' | 'invoiced' | 'cancelled';

export type InvoiceTriggerSource =
  | 'contract_upfront'
  | 'milestone'
  | 'manual'
  | 'quotation_approval';

export type TaxInvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  vatAmount: number;
  lineTotal: number;
};

export type PaymentMilestone = {
  id: string;
  client_id: string;
  contract_id?: string | null;
  title: string;
  percentage: number;
  amount: number;
  vat_amount: number;
  total_amount: number;
  sort_order: number;
  status: PaymentMilestoneStatus;
  is_invoiced: boolean;
  tax_invoice_id?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TaxInvoice = {
  id: string;
  client_id: string | null;
  sales_document_id?: string | null;
  invoice_number: string;
  uuid: string;
  invoice_hash: string;
  previous_invoice_hash: string;
  qr_base64: string | null;
  xml: string;
  status: ZatcaSubmissionStatus;
  environment: string;
  /** ZATCA kind */
  invoice_kind: ZatcaInvoiceKind;
  /** STANDARD | SIMPLIFIED */
  invoice_type?: TaxInvoiceType | null;
  business_status?: TaxInvoiceBusinessStatus | null;
  subtotal?: number | null;
  vat_amount?: number | null;
  total_amount?: number | null;
  issue_date?: string | null;
  milestone_id?: string | null;
  contract_id?: string | null;
  buyer_name?: string | null;
  buyer_cr?: string | null;
  buyer_vat?: string | null;
  line_items?: TaxInvoiceLineItem[] | null;
  notes?: string | null;
  trigger_source?: InvoiceTriggerSource | null;
  zatca_response?: unknown;
  created_at?: string;
  updated_at?: string;
};

export type GenerateTaxInvoiceRequest = {
  clientId: string;
  milestoneId?: string | null;
  contractId?: string | null;
  /** نسبة مئوية اختيارية عند الإصدار اليدوي */
  percentage?: number | null;
  title?: string | null;
  triggerSource?: InvoiceTriggerSource;
  submitToZatca?: boolean;
  forceSimplified?: boolean;
  forceStandard?: boolean;
};

export type GenerateTaxInvoiceResult = {
  ok: boolean;
  invoice: TaxInvoice | null;
  milestone: PaymentMilestone | null;
  messages: string[];
  error: string | null;
  promptPreview: boolean;
};
