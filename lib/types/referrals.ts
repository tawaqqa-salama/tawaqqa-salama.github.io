export const REFERRAL_CATEGORIES = ['مهندس', 'شركة مقاولات', 'مسوق'] as const;
export type ReferralCategory = (typeof REFERRAL_CATEGORIES)[number];

export const REFERRAL_CLASSIFICATIONS = ['داخلي', 'خارجي'] as const;
export type ReferralClassification = (typeof REFERRAL_CLASSIFICATIONS)[number];

export const COMMISSION_TYPES = ['percent', 'fixed'] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export const REFERRAL_STATUSES = ['active', 'inactive'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const COMMISSION_ENTRY_STATUSES = ['accrued', 'partially_paid', 'paid', 'cancelled'] as const;
export type CommissionEntryStatus = (typeof COMMISSION_ENTRY_STATUSES)[number];

export type ReferralRecord = {
  id: string;
  name: string;
  phone: string;
  category: ReferralCategory;
  classification: ReferralClassification;
  commission_type: CommissionType;
  commission_value: number;
  notes?: string | null;
  status: ReferralStatus;
  created_at?: string;
  updated_at?: string;
};

export type OwnerAccount = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  national_id?: string | null;
  commercial_register?: string | null;
  tax_number?: string | null;
  client_kind?: 'business' | 'consumer' | null;
  city?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CommissionEntry = {
  id: string;
  referral_id: string;
  client_id?: string | null;
  project_label?: string | null;
  basis_amount: number;
  commission_type: CommissionType;
  commission_rate: number;
  earned_amount: number;
  paid_amount: number;
  status: CommissionEntryStatus;
  notes?: string | null;
  accrued_at?: string;
  paid_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ReferralStats = {
  referral: ReferralRecord;
  projects_count: number;
  earned_total: number;
  paid_total: number;
  balance: number;
};

export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  percent: 'نسبة %',
  fixed: 'مبلغ ثابت (ر.س)',
};

export const COMMISSION_STATUS_LABELS: Record<CommissionEntryStatus, string> = {
  accrued: 'مستحقة',
  partially_paid: 'مدفوعة جزئياً',
  paid: 'مدفوعة',
  cancelled: 'ملغاة',
};
