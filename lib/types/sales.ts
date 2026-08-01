export type SalesDocumentType = 'quotation' | 'invoice';
export type SalesPaymentType = 'نقدي' | 'آجل';
export type ContractStatus = 'مسودة' | 'معتمد' | 'منتهي' | 'ملغي';
export type ReturnStatus = 'مسودة' | 'معتمد' | 'ملغي';

export interface ClientFollowUp {
  id: string;
  client_id: string;
  follow_up_date: string;
  contact_method: string | null;
  notes: string | null;
  status: string;
  created_at?: string;
}

export interface SalesDocument {
  id: string;
  client_id: string;
  doc_type: SalesDocumentType;
  doc_number: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: string;
  archived: boolean;
  notes: string | null;
  created_at?: string;
}

export interface SalesContract {
  id: string;
  client_id: string;
  contract_number: string;
  quotation_number: string | null;
  contract_date: string;
  service_scope: string | null;
  terms: string | null;
  amount: number;
  vat_amount: number;
  total_amount: number;
  status: ContractStatus;
  created_at?: string;
  auto_generated?: boolean | null;
  amount_words?: string | null;
  duration_days?: number | null;
  duration_text?: string | null;
  preamble?: string | null;
  party1_name?: string | null;
  party1_cr?: string | null;
  party1_tax?: string | null;
  party1_phone?: string | null;
  party1_address?: string | null;
  party1_license?: string | null;
  party2_name?: string | null;
  party2_cr?: string | null;
  party2_address?: string | null;
  party2_phone?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  iban?: string | null;
  payment_first?: string | null;
  payment_second?: string | null;
  payment_final?: string | null;
  payment_terms?: string | null;
  sales_payment_type?: SalesPaymentType | null;
  quotation_services?: string[] | null;
}

export interface SalesReturn {
  id: string;
  client_id: string;
  return_number: string;
  linked_doc_number: string | null;
  amount: number;
  reason: string | null;
  status: ReturnStatus;
  created_at?: string;
}
