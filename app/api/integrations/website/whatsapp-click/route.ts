import { NextResponse } from 'next/server';
import { trackWebsiteWhatsAppClick } from '@/lib/website/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await trackWebsiteWhatsAppClick({
    phone: body.phone,
    utm: body.utm,
    landing_page: body.landing_page,
    referrer: body.referrer,
  });
  return NextResponse.json(result);
}
