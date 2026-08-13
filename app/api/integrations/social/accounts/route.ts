import { NextResponse } from 'next/server';
import { listProviderCapabilities } from '@/lib/social/provider';
import { disconnectAccount, listSocialAccounts, startOAuth } from '@/lib/social/service';
import type { SocialPlatform } from '@/lib/social/types';
import { SOCIAL_PLATFORMS } from '@/lib/social/types';
import { withTenantApi } from '@/lib/tenant/api-guard';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const accounts = await listSocialAccounts(gated.ctx.tenantId);
  return NextResponse.json({
    ok: true,
    accounts,
    platforms: SOCIAL_PLATFORMS,
    providers: listProviderCapabilities(),
  });
}

export async function POST(request: Request) {
  const gated = await withTenantApi(request, { module: 'social_media' });
  if ('response' in gated) return gated.response;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    platform?: SocialPlatform;
    accountId?: string;
  };

  if (body.action === 'disconnect' && body.accountId) {
    const result = await disconnectAccount(body.accountId, gated.ctx.tenantId);
    return NextResponse.json({ ok: result.ok, account: result.account });
  }

  if (body.action === 'connect' && body.platform) {
    const origin = new URL(request.url).origin;
    const result = await startOAuth(body.platform, origin);
    if (!result.ok) {
      return NextResponse.json(result, { status: result.supported === false ? 422 : 400 });
    }
    return NextResponse.json({
      ok: true,
      authorizeUrl: result.data.authorizeUrl,
      state: result.data.state,
      platform: body.platform,
    });
  }

  return NextResponse.json({ ok: false, error: 'action غير معروف' }, { status: 400 });
}
