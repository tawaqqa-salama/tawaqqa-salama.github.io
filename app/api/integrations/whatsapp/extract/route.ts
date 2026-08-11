import { NextResponse } from 'next/server';
import { updateCrmClientFields } from '@/lib/whatsapp/crm-bridge';
import { waRepository } from '@/lib/whatsapp/store/repository';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'whatsapp' });
  if ('response' in gated) return gated.response;
  const body = (await request.json()) as {
    extractionId?: string;
    action?: 'confirm' | 'edit' | 'ignore';
    proposed?: Record<string, unknown>;
    userId?: string;
  };
  if (!body.extractionId || !body.action) {
    return NextResponse.json({ ok: false, error: 'extractionId_and_action_required' }, { status: 400 });
  }
  const status =
    body.action === 'confirm' ? 'confirmed' : body.action === 'edit' ? 'edited' : 'ignored';
  const row = await waRepository.reviewExtraction(
    body.extractionId,
    status,
    body.action === 'ignore' ? undefined : body.proposed,
    body.userId
  );
  if (!row) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  // Apply confirmed/edited fields onto existing clients CRM row
  if ((status === 'confirmed' || status === 'edited') && row.customer_id) {
    const p = (body.proposed || row.proposed || {}) as Record<string, unknown>;
    await updateCrmClientFields(row.customer_id, {
      ...(typeof p.activity === 'string' ? { activity_type: p.activity } : {}),
      ...(typeof p.city === 'string' ? { city: p.city } : {}),
      ...(typeof p.area === 'number' ? { building_area: p.area } : {}),
      ...(typeof p.area === 'string' && p.area
        ? { building_area: Number(p.area) || null }
        : {}),
      ...(typeof p.floors === 'number' ? { floors_count: p.floors } : {}),
      ...(typeof p.name === 'string' ? { owner_name: p.name, name: p.name } : {}),
      ...(typeof p.business_name === 'string' ? { business_name: p.business_name } : {}),
      ...(typeof p.email === 'string' ? { email: p.email } : {}),
      ...(typeof p.requested_service === 'string'
        ? { lead_notes: `خدمة مطلوبة: ${p.requested_service}` }
        : {}),
    });
  }

  return NextResponse.json({ ok: true, extraction: row });
}
