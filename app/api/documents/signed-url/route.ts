import { NextResponse } from 'next/server';
import { withTenantApi } from '@/lib/tenant/api-guard';
import { createTenantScopedSignedUrl } from '@/lib/storage/tenant-signed-url';
import { asTrimmedString } from '@/lib/validation/input';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticated document download URL minting.
 * Path: session → tenant → client/document ownership → signed URL.
 * Never: document id / path alone → signed URL.
 */
export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'documents' });
  if ('response' in gated) return gated.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // Ignore client-supplied company_id
  delete body.company_id;
  delete body.companyId;

  const storagePath = asTrimmedString(body.storagePath || body.path, 512);
  if (!storagePath) {
    return NextResponse.json({ ok: false, error: 'storagePath_required' }, { status: 400 });
  }

  const bucket = asTrimmedString(body.bucket, 64) || undefined;
  const expiresIn = Math.min(Math.max(Number(body.expiresIn) || 3600, 60), 86_400);

  const result = await createTenantScopedSignedUrl({
    ctx: gated.ctx,
    storagePath,
    bucket,
    expiresIn,
  });

  if (!result.ok) return result.response;

  return NextResponse.json({
    ok: true,
    signedUrl: result.signedUrl,
    expiresIn: result.expiresIn,
  });
}
