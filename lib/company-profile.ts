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
  /** سعر المتر المربع لحساب عرض السعر تلقائياً */
  price_per_m2: number;
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
  price_per_m2: 0,
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

/** يحاول الحفظ مع حذف الأعمدة غير الموجودة في schema تلقائياً */
async function upsertCompanyPayload(
  payload: Record<string, unknown>,
  existingId?: string
): Promise<{ error: string | null; skippedColumns: string[] }> {
  const current: Record<string, unknown> = { ...payload };
  const skippedColumns: string[] = [];

  for (let attempt = 0; attempt < 16; attempt += 1) {
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

/** يحمّل من جدول companies إن وجد، مع دمج التخزين المحلي للشعار والحقول الإضافية */
export async function loadCompanyProfile(): Promise<CompanyProfile> {
  const local = loadLocalCompanyProfile();
  if (isDemoMode) return local;

  const { data } = await supabase.from('companies').select('*').eq('code', 'TWAQQA').maybeSingle();
  if (!data) return local;

  return {
    ...local,
    name: data.name || local.name,
    legal_name: data.legal_name || local.legal_name,
    city: data.city || local.city,
    commercial_register: data.commercial_register || local.commercial_register,
    tax_number: data.tax_number || local.tax_number,
    phone: data.phone || local.phone,
    email: data.email || local.email,
    address: data.address || local.address,
    logo_url: data.logo_url || local.logo_url,
    price_per_m2:
      data.price_per_m2 != null && data.price_per_m2 !== ''
        ? Number(data.price_per_m2) || local.price_per_m2
        : local.price_per_m2,
  };
}

export async function saveCompanyProfile(
  profile: CompanyProfile
): Promise<{ error: string | null; warning?: string | null }> {
  // الحفظ المحلي أولاً — يضمن عمل سعر المتر حتى لو أعمدة قاعدة البيانات ناقصة
  saveLocalCompanyProfile(profile);
  if (isDemoMode) return { error: null };

  const { data: existing } = await supabase.from('companies').select('id').eq('code', 'TWAQQA').maybeSingle();
  const payload: Record<string, unknown> = {
    name: profile.name,
    legal_name: profile.legal_name,
    city: profile.city,
    commercial_register: profile.commercial_register || null,
    tax_number: profile.tax_number || null,
    phone: profile.phone || null,
    email: profile.email || null,
    address: profile.address || null,
    logo_url: profile.logo_url || null,
    price_per_m2: Number(profile.price_per_m2) || 0,
    updated_at: new Date().toISOString(),
  };

  const result = await upsertCompanyPayload(payload, existing?.id);
  if (result.error) {
    return {
      error: null,
      warning:
        `حُفظ سعر المتر وبيانات المكتب محلياً على هذا الجهاز. قاعدة البيانات رفضت بعض الحقول (${result.error}). نفّذ SQL الحقول الإضافية لمزامنة كل الأجهزة.`,
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
