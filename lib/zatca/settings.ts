import { loadSession } from '@/lib/auth/session';
import { supabase, isDemoMode } from '@/lib/supabase';
import { DEFAULT_ZATCA_SETTINGS, ZATCA_LOCAL_SETTINGS_KEY } from '@/lib/zatca/constants';
import type { ZatcaSettings } from '@/lib/zatca/types';

async function resolveZatcaCompanyRow(
  preferredCompanyId?: string | null
): Promise<Record<string, unknown> | null> {
  // Prefer explicit server session company — never invent cross-tenant settings from client
  const companyId = preferredCompanyId || loadSession()?.companyId;
  if (companyId) {
    const { data } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
    if (data) return data as Record<string, unknown>;
  }
  const { data } = await supabase.from('companies').select('*').eq('code', 'TWAQQA').maybeSingle();
  return (data as Record<string, unknown>) || null;
}

export function loadLocalZatcaSettings(): ZatcaSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_ZATCA_SETTINGS };
  try {
    const raw = localStorage.getItem(ZATCA_LOCAL_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_ZATCA_SETTINGS };
    return { ...DEFAULT_ZATCA_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_ZATCA_SETTINGS };
  }
}

export function saveLocalZatcaSettings(settings: ZatcaSettings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ZATCA_LOCAL_SETTINGS_KEY, JSON.stringify(settings));
}

function pick(row: Record<string, unknown>, key: string, fallback: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : fallback;
}

export async function loadZatcaSettings(companyId?: string | null): Promise<ZatcaSettings> {
  const local = loadLocalZatcaSettings();
  if (isDemoMode) return local;

  const row = await resolveZatcaCompanyRow(companyId);
  if (!row) return local;

  return {
    ...local,
    enabled: Boolean(row.zatca_enabled ?? local.enabled),
    environment: (pick(row, 'zatca_environment', local.environment) as ZatcaSettings['environment']) || local.environment,
    invoice_kind: (pick(row, 'zatca_invoice_kind', local.invoice_kind) as ZatcaSettings['invoice_kind']) || local.invoice_kind,
    otp: pick(row, 'zatca_otp', local.otp),
    csid: pick(row, 'zatca_csid', local.csid),
    secret: pick(row, 'zatca_secret', local.secret),
    compliance_request_id: pick(row, 'zatca_compliance_request_id', local.compliance_request_id),
    private_key_pem: pick(row, 'zatca_private_key_pem', local.private_key_pem),
    csr_pem: pick(row, 'zatca_csr_pem', local.csr_pem),
    certificate_pem: pick(row, 'zatca_certificate_pem', local.certificate_pem),
    egss_serial: pick(row, 'zatca_egss_serial', local.egss_serial),
    solution_name: pick(row, 'zatca_solution_name', local.solution_name),
  };
}

export async function saveZatcaSettings(
  settings: ZatcaSettings
): Promise<{ error: string | null; warning?: string | null }> {
  saveLocalZatcaSettings(settings);
  if (isDemoMode) return { error: null };

  const row = await resolveZatcaCompanyRow();
  if (!row?.id) {
    return {
      error: null,
      warning: 'حُفظت إعدادات ZATCA محلياً. لم يُعثر على سجل الشركة في قاعدة البيانات.',
    };
  }

  const payload = {
    zatca_enabled: settings.enabled,
    zatca_environment: settings.environment,
    zatca_invoice_kind: settings.invoice_kind,
    zatca_otp: settings.otp || null,
    zatca_csid: settings.csid || null,
    zatca_secret: settings.secret || null,
    zatca_compliance_request_id: settings.compliance_request_id || null,
    zatca_private_key_pem: settings.private_key_pem || null,
    zatca_csr_pem: settings.csr_pem || null,
    zatca_certificate_pem: settings.certificate_pem || null,
    zatca_egss_serial: settings.egss_serial || null,
    zatca_solution_name: settings.solution_name || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('companies').update(payload).eq('id', String(row.id));
  if (error) {
    return {
      error: null,
      warning: `حُفظت إعدادات ZATCA محلياً. قاعدة البيانات: ${error.message}. نفّذ SQL: 018_zatca_einvoicing.sql`,
    };
  }
  return { error: null };
}
