import { NextResponse } from 'next/server';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/phone';
import { memoryStore } from '@/lib/whatsapp/store/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    customerId?: string;
    userId?: string;
    owner_name?: string;
    phone?: string;
    email?: string;
    business_name?: string;
    activity_type?: string;
    city?: string;
    district?: string;
    street?: string;
    region?: string;
    building_area?: number | null;
    floors_count?: number | null;
    lead_notes?: string;
    project_type?: string;
    project_stage?: string;
  };
  if (!body.customerId) {
    return NextResponse.json({ ok: false, error: 'customerId_required' }, { status: 400 });
  }

  const notesExtra = [
    body.project_type ? `نوع المشروع: ${body.project_type}` : null,
    body.project_stage ? `مرحلة المشروع: ${body.project_stage}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const client = memoryStore.updateClient(
    body.customerId,
    {
      ...(body.owner_name !== undefined ? { owner_name: body.owner_name, name: body.owner_name } : {}),
      ...(body.phone !== undefined
        ? { phone: normalizeWhatsAppPhone(body.phone) || body.phone }
        : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.business_name !== undefined ? { business_name: body.business_name } : {}),
      ...(body.activity_type !== undefined ? { activity_type: body.activity_type } : {}),
      ...(body.city !== undefined ? { city: body.city } : {}),
      ...(body.district !== undefined ? { district: body.district } : {}),
      ...(body.street !== undefined ? { street: body.street } : {}),
      ...(body.region !== undefined ? { region: body.region } : {}),
      ...(body.building_area !== undefined ? { building_area: body.building_area } : {}),
      ...(body.floors_count !== undefined ? { floors_count: body.floors_count } : {}),
      ...(body.lead_notes !== undefined || notesExtra
        ? {
            lead_notes: [body.lead_notes, notesExtra].filter(Boolean).join('\n') || null,
          }
        : {}),
    },
    body.userId
  );

  if (!client) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  if (body.phone) {
    memoryStore.upsertContact({
      customer_id: client.id,
      phone_number: client.phone || body.phone,
      profile_name: client.whatsapp_profile_name,
    });
  }

  return NextResponse.json({ ok: true, customer: client });
}
