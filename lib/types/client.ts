import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import type { SalesPaymentType } from '@/lib/types/sales';

export interface InspectionChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export type PipelineStage = 'marketing' | 'sales' | 'finance' | 'projects' | 'completed';

export type DepartmentMode = 'marketing' | 'sales' | 'finance' | 'hr' | 'projects' | 'full';

export type FloorLevelKind = 'ground' | 'typical' | 'basement' | 'roof' | 'custom';

/** مستوى دور: المتكرر يُمثَّل كصف واحد مع repeat_count */
export interface FloorLevel {
  id: string;
  label: string;
  kind: FloorLevelKind;
  area_m2: number;
  repeat_count: number;
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
  next_follow_up_date?: string | null;
  last_contact_date?: string | null;
  quotation_number?: string | null;
  quotation_amount?: number | null;
  vat_amount?: number | null;
  total_amount?: number | null;
  quotation_status?: string | null;
  quotation_visits_count?: number | null;
  financial_status?: string | null;
  payment_reference?: string | null;
  paid_amount?: number | null;
  sales_payment_type?: SalesPaymentType | null;
  credit_balance?: number | null;
  assigned_engineer?: string | null;
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
}
