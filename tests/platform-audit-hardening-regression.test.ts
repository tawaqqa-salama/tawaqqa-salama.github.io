import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const login = read('app/login/page.tsx');
const auth = read('lib/auth/service.ts');
const runtimeMode = read('lib/runtime/mode.ts');
const supabase = read('lib/supabase.ts');
const sales = read('lib/data/fetchers.ts');
const basicPage = read('app/sales/client-basic-data/page.tsx');
const quotationPage = read('app/sales/client-quotation/page.tsx');
const modal = read('components/clients/ClientDetailModal.tsx');
const tenantMode = read('lib/tenant/mode.ts');
const nextConfig = read('next.config.ts');

describe('platform audit hardening regressions', () => {
  it('does not ship prefilled demo credentials or login hints in the production login page', () => {
    expect(login).toContain("useState('')");
    expect(login).not.toContain('admin@tawaqqa.sa');
    expect(login).not.toContain('Admin@123');
    expect(login).not.toContain('DEMO_LOGIN_HINTS');
    expect(auth).not.toContain('export const DEMO_LOGIN_HINTS');
  });

  it('allows demo data only outside production and fails closed when production Supabase configuration is absent', () => {
    expect(runtimeMode).toContain("return process.env.NODE_ENV !== 'production';");
    expect(runtimeMode).not.toContain('if (isStaticPagesBuild()) return true;');
    expect(supabase).toContain("export const isDemoMode = process.env.NODE_ENV !== 'production' && !isSupabaseConfigured;");
    expect(supabase).toContain('export const isSupabaseUnavailable = !isSupabaseConfigured && !isDemoMode;');
    expect(supabase).toContain('createUnavailableSupabaseClient()');
    expect(tenantMode).toContain("if (process.env.NODE_ENV === 'production') return false;");
    expect(tenantMode).not.toContain('!isSupabaseConfigured || isDemoMode');
    expect(nextConfig).toContain('"@/lib/demo/memory-client": "@/lib/demo/production-disabled"');
    expect(nextConfig).toContain('"@/lib/tenant/memory": "@/lib/tenant/production-disabled"');
  });

  it('uses only Supabase Auth for production email and phone failures', () => {
    const productionEmail = auth.slice(
      auth.indexOf('if (!isDemoMode) {', auth.indexOf('export async function signInWithEmailPassword')),
      auth.indexOf('// Local development only:', auth.indexOf('export async function signInWithEmailPassword'))
    );
    const productionPhone = auth.slice(
      auth.indexOf('if (!isDemoMode) {', auth.indexOf('export async function verifyPhoneOtp')),
      auth.indexOf('const customOk = await verifyStoredOtp', auth.indexOf('export async function verifyPhoneOtp'))
    );
    expect(productionEmail).not.toContain('tryLegacyPasswordLoginSafe');
    expect(productionEmail).toContain(".eq('auth_user_id', authData.user.id)");
    expect(productionPhone).not.toContain('verifyStoredOtp');
    expect(auth).not.toContain('NEXT_PUBLIC_WHATSAPP_WEBHOOK_URL');
  });

  it('keeps sales list lightweight and client pages static with direct detail loading', () => {
    const listSection = sales.slice(sales.indexOf('export async function fetchClientsList'), sales.indexOf('export async function fetchClientById'));
    expect(listSection).not.toContain("select('*')");
    expect(listSection).toContain('applyCompanyFilter(query, companyId)');
    expect(sales).toContain(".eq('company_id', companyId)");
    expect(listSection).toContain('.range(');
    expect(basicPage).toContain("useSearchParams");
    expect(quotationPage).toContain("useSearchParams");
    expect(basicPage).not.toContain('/sales/clients/[clientId]');
    expect(quotationPage).not.toContain('/sales/clients/[clientId]');
  });

  it('retains one non-sticky basic save action and a contract-only quotation lock', () => {
    expect(modal).toContain('حفظ البيانات الأساسية');
    expect(modal).toContain('حفظ ومتابعة');
    expect(modal).not.toContain('sticky bottom-');
    expect(modal).toContain('const quotationLocked = contractLinked || contractCheckLoading;');
    expect(modal).toContain("'العرض صادر ويمكن تعديله قبل إنشاء العقد.'");
  });
});
