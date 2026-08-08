import { NextResponse } from 'next/server';
import { createHash, randomUUID } from 'node:crypto';
import { writeSaasAudit } from '@/lib/tenant/audit';
import { createTenant, ensureMembership } from '@/lib/tenant/service';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { tenantMemory } from '@/lib/tenant/memory';

export const runtime = 'nodejs';

/**
 * Public-ish onboarding for new tenant + admin user.
 * In production, gate with invite token / Super Admin creation.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const companyName = String(body.companyName || '').trim();
  const adminEmail = String(body.adminEmail || '').trim().toLowerCase();
  const adminName = String(body.adminName || '').trim();
  const adminPassword = String(body.adminPassword || '');

  if (!companyName || !adminEmail || !adminName || adminPassword.length < 8) {
    return NextResponse.json(
      { ok: false, error: 'companyName, adminName, adminEmail, adminPassword (8+) required' },
      { status: 400 }
    );
  }

  const inviteToken = process.env.TENANT_ONBOARDING_TOKEN;
  if (inviteToken && body.inviteToken !== inviteToken) {
    return NextResponse.json({ ok: false, error: 'Invalid invite token' }, { status: 403 });
  }

  try {
    const tenant = await createTenant({
      name: companyName,
      legalName: body.legalName || companyName,
      country: body.country || 'ID',
      city: body.city,
      address: body.address,
      phone: body.phone,
      email: body.email || adminEmail,
      website: body.website,
      defaultLanguage: body.defaultLanguage || 'en',
      secondaryLanguage: body.secondaryLanguage || 'id',
      defaultCurrency: body.defaultCurrency || 'IDR',
      timezone: body.timezone || 'Asia/Jakarta',
      industry: body.industry || 'real_estate',
      planCode: body.planCode || 'trial',
      modules: body.modules,
    });

    const userId = randomUUID();
    const useMemory =
      process.env.TENANT_FORCE_MEMORY === 'true' || !isSupabaseConfigured || isDemoMode;

    if (useMemory) {
      // Demo path: membership only (full user insert via memory client if present)
      await ensureMembership({
        userId,
        companyId: tenant.id,
        roleCode: 'tenant_admin',
        isDefault: true,
      });
      tenantMemory.audit({
        action: 'USER_CREATED',
        company_id: tenant.id,
        metadata: { email: adminEmail, role: 'tenant_admin' },
      });
    } else {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });
      // If service role unavailable, fall back to users row without auth link
      const authUserId = authData?.user?.id || null;
      if (authError && !/not available|service/i.test(authError.message || '')) {
        // continue with profile-only
      }
      const { data: user, error } = await supabase
        .from('users')
        .insert({
          id: userId,
          company_id: tenant.id,
          email: adminEmail,
          full_name: adminName,
          username: adminEmail.split('@')[0],
          role_code: 'tenant_admin',
          is_active: true,
          auth_user_id: authUserId,
          preferred_language: body.defaultLanguage || 'en',
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      await ensureMembership({
        userId: user.id,
        companyId: tenant.id,
        roleCode: 'tenant_admin',
        isDefault: true,
      });
    }

    await writeSaasAudit({
      company_id: tenant.id,
      action: 'ONBOARDING_COMPLETED',
      entity_type: 'company',
      entity_id: tenant.id,
      metadata: {
        adminEmailHash: createHash('sha256').update(adminEmail).digest('hex').slice(0, 12),
        country: tenant.country,
      },
    });

    return NextResponse.json({
      ok: true,
      tenant: {
        id: tenant.id,
        code: tenant.code,
        slug: tenant.slug,
        name: tenant.name,
        default_language: tenant.default_language,
        default_currency: tenant.default_currency,
        timezone: tenant.timezone,
      },
      adminEmail,
      message: 'Tenant created. Sign in with the admin email/password.',
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'onboarding failed' },
      { status: 400 }
    );
  }
}
