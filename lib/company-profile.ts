import { PLATFORM_NAME, PLATFORM_SHORT_NAME } from '@/lib/constants/branding';
import { supabase, isDemoMode } from '@/lib/supabase';

export type CompanyProfile = {
  name: string;
  legal_name: string;
  tagline: string;
  logo_url: string;
  address: string;
  city: string;
  commercial_register: string;
  membership_id: string;
  tax_number: string;
  phone: string;
  fax: string;
  email: string;
  email_alt: string;
  stamp_text: string;
  stamp_url: string;
  /** سعر المتر المربع لحساب عرض السعر تلقائياً */
  price_per_m2: number;
  bank_name: string;
  bank_account: string;
  iban: string;
  payment_first: string;
  payment_second: string;
  payment_final: string;
  payment_terms: string;
  /** صلاحية عرض السعر بالأيام */
  quotation_validity_days: number;
};

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: PLATFORM_SHORT_NAME,
  legal_name: PLATFORM_NAME,
  tagline: 'تصميم - إشراف - إدارة مشاريع / Design - supervision - project management',
  logo_url: '',
  address: 'المركز الرئيسي',
  city: 'الرياض',
  commercial_register: '',
  membership_id: '',
  tax_number: '',
  phone: '',
  fax: '',
  email: '',
  email_alt: '',
  stamp_text: PLATFORM_SHORT_NAME,
  stamp_url: '',
  price_per_m2: 0,
  bank_name: '',
  bank_account: '',
  iban: '',
  payment_first: 'الدفعة الأولى: 50% عند اعتماد عرض السعر',
  payment_second: 'الدفعة الثانية: 30% عند تسليم الدراسة/المخططات',
  payment_final: 'الدفعة الأخيرة: 20% عند الاعتماد النهائي',
  payment_terms: 'يُسدد المستحق عبر التحويل البنكي حسب الآيبان أدناه خلال مدة صلاحية العرض.',
  quotation_validity_days: 14,
};

const LOCAL_KEY = 'tawaqqa_company_profile_v1';

export function loadLocalCompanyProfile(): CompanyProfile {
  if (typeof window === 'undefined') return DEFAULT_COMPANY_PROFILE;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_COMPANY_PROFILE;
    return { ...DEFAULT_COMPANY_PROFILE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_COMPANY_PROFILE;
  }
}

export function saveLocalCompanyProfile(profile: CompanyProfile) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(profile));
}

function extractMissingColumn(message: string): string | null {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column ["']([^"']+)["'] of relation/i,
    /column ([a-zA-Z_][a-zA-Z0-9_]*) does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function upsertCompanyPayload(
  payload: Record<string, unknown>,
  existingId?: string
): Promise<{ error: string | null; skippedColumns: string[] }> {
  const current: Record<string, unknown> = { ...payload };
  const skippedColumns: string[] = [];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = existingId
      ? await supabase.from('companies').update(current).eq('id', existingId)
      : await supabase.from('companies').insert({
          code: 'TWAQQA',
          ...current,
          is_active: true,
          created_at: new Date().toISOString(),
        });

    if (!result.error) {
      return { error: null, skippedColumns };
    }

    const missing = extractMissingColumn(result.error.message);
    if (!missing || !(missing in current)) {
      return { error: result.error.message, skippedColumns };
    }

    delete current[missing];
    skippedColumns.push(missing);
  }

  return { error: 'تعذر حفظ بيانات الشركة في قاعدة البيانات', skippedColumns };
}

function pickText(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/** أول قيمة نصية صالحة من أعمدة بديلة في صف الشركة */
function pickTextAny(
  data: Record<string, unknown>,
  keys: string[],
  fallback: string
): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

/** يحمّل من جدول companies إن وجد، مع دمج التخزين المحلي للشعار والحقول الإضافية */
export async function loadCompanyProfile(): Promise<CompanyProfile> {
  const local = loadLocalCompanyProfile();
  if (isDemoMode) return local;

  const { data } = await supabase.from('companies').select('*').eq('code', 'TWAQQA').maybeSingle();
  if (!data) return local;

  const row = data as Record<string, unknown>;
  return {
    ...local,
    name: pickText(row, 'name', local.name),
    legal_name: pickTextAny(row, ['legal_name', 'name'], local.legal_name),
    city: pickText(row, 'city', local.city),
    commercial_register: pickTextAny(
      row,
      ['commercial_register', 'cr_number', 'commercial_registration', 'cr'],
      local.commercial_register
    ),
    membership_id: pickTextAny(
      row,
      ['membership_id', 'civil_defense_license', 'license_number', 'license_no'],
      local.membership_id
    ),
    tax_number: pickTextAny(row, ['tax_number', 'vat_number', 'tin', 'vat'], local.tax_number),
    phone: pickTextAny(row, ['phone', 'mobile', 'telephone'], local.phone),
    email: pickText(row, 'email', local.email),
    email_alt: pickTextAny(row, ['email_alt', 'email2'], local.email_alt),
    address: pickTextAny(row, ['address', 'national_address', 'hq_address'], local.address),
    logo_url: pickText(row, 'logo_url', local.logo_url),
    stamp_url: pickText(row, 'stamp_url', local.stamp_url),
    stamp_text: pickText(row, 'stamp_text', local.stamp_text),
    bank_name: pickTextAny(row, ['bank_name', 'bank'], local.bank_name),
    bank_account: pickTextAny(row, ['bank_account', 'account_number', 'account_no'], local.bank_account),
    iban: pickTextAny(row, ['iban', 'bank_iban'], local.iban),
    payment_first: pickText(row, 'payment_first', local.payment_first),
    payment_second: pickText(row, 'payment_second', local.payment_second),
    payment_final: pickText(row, 'payment_final', local.payment_final),
    payment_terms: pickText(row, 'payment_terms', local.payment_terms),
    tagline: pickText(row, 'tagline', local.tagline),
    price_per_m2:
      row.price_per_m2 != null && row.price_per_m2 !== ''
        ? Number(row.price_per_m2) || local.price_per_m2
        : local.price_per_m2,
    quotation_validity_days:
      row.quotation_validity_days != null && row.quotation_validity_days !== ''
        ? Math.max(1, Number(row.quotation_validity_days) || local.quotation_validity_days)
        : local.quotation_validity_days,
  };
}

export async function saveCompanyProfile(
  profile: CompanyProfile
): Promise<{ error: string | null; warning?: string | null }> {
  saveLocalCompanyProfile(profile);
  if (isDemoMode) return { error: null };

  const { data: existing } = await supabase.from('companies').select('id').eq('code', 'TWAQQA').maybeSingle();
  const payload: Record<string, unknown> = {
    name: profile.name,
    legal_name: profile.legal_name,
    city: profile.city,
    commercial_register: profile.commercial_register || null,
    membership_id: profile.membership_id || null,
    tax_number: profile.tax_number || null,
    phone: profile.phone || null,
    email: profile.email || null,
    email_alt: profile.email_alt || null,
    address: profile.address || null,
    tagline: profile.tagline || null,
    logo_url: profile.logo_url || null,
    stamp_url: profile.stamp_url || null,
    stamp_text: profile.stamp_text || null,
    bank_name: profile.bank_name || null,
    bank_account: profile.bank_account || null,
    iban: profile.iban || null,
    payment_first: profile.payment_first || null,
    payment_second: profile.payment_second || null,
    payment_final: profile.payment_final || null,
    payment_terms: profile.payment_terms || null,
    price_per_m2: Number(profile.price_per_m2) || 0,
    quotation_validity_days: Math.max(1, Number(profile.quotation_validity_days) || 14),
    updated_at: new Date().toISOString(),
  };

  const result = await upsertCompanyPayload(payload, existing?.id);
  if (result.error) {
    return {
      error: null,
      warning:
        `حُفظت معلومات الشركة محلياً على هذا الجهاز. قاعدة البيانات رفضت بعض الحقول (${result.error}). نفّذ SQL الحقول الإضافية لمزامنة كل الأجهزة.`,
    };
  }

  if (result.skippedColumns.length > 0) {
    const skipped = result.skippedColumns.join(', ');
    return {
      error: null,
      warning: `تم الحفظ. بعض أعمدة قاعدة البيانات غير موجودة بعد (${skipped}) وبقيت محلياً — نفّذ SQL الحقول الإضافية للمزامنة الكاملة.`,
    };
  }

  return { error: null };
}
