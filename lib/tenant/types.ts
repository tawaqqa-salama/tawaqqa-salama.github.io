export type AppLocale = 'ar' | 'en' | 'id';

export type TenantStatus = 'active' | 'trial' | 'suspended' | 'cancelled' | 'pending';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'none';

export type PlatformModuleCode =
  | 'crm'
  | 'marketing'
  | 'whatsapp'
  | 'social_media'
  | 'website'
  | 'projects'
  | 'documents'
  | 'reports'
  | 'finance'
  | 'finance_zatca'
  | 'procurement'
  | 'hr'
  | 'design'
  | 'settings';

export type SaasRoleCode =
  | 'super_admin'
  | 'tenant_admin'
  | 'admin' // legacy alias → tenant_admin
  | 'manager'
  | 'engineer'
  | 'sales'
  | 'accountant'
  | 'employee'
  | 'staff'
  | 'viewer';

export type TenantRecord = {
  id: string;
  code: string;
  slug: string | null;
  name: string;
  legal_name: string | null;
  logo_url: string | null;
  favicon_url?: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  default_language: AppLocale;
  secondary_language: AppLocale | null;
  default_currency: string;
  timezone: string;
  date_format: string;
  number_format: string;
  industry: string;
  brand_primary?: string | null;
  brand_secondary?: string | null;
  tax_settings?: Record<string, unknown>;
  status: TenantStatus;
  subscription_plan: string | null;
  subscription_status: SubscriptionStatus;
  subscription_start: string | null;
  subscription_end: string | null;
  max_users: number;
  max_projects: number;
  max_storage_mb: number;
  max_documents: number;
  is_active: boolean;
};

export type TenantMembership = {
  id: string;
  user_id: string;
  company_id: string;
  role_code: string;
  status: string;
  is_default: boolean;
};

export type SaasPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billing_interval: 'monthly' | 'yearly';
  max_users: number;
  max_projects: number;
  max_storage_mb: number;
  max_documents: number;
  enabled_modules: string[];
  is_active: boolean;
};

/** Maps department sidebar ids → platform modules */
export const DEPARTMENT_TO_MODULE: Record<string, PlatformModuleCode> = {
  marketing: 'marketing',
  sales: 'crm',
  procurement: 'procurement',
  finance: 'finance',
  hr: 'hr',
  projects: 'projects',
  design: 'design',
  settings: 'settings',
};
