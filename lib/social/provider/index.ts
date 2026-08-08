import { DemoSocialProvider } from '@/lib/social/provider/base';
import { GoogleBusinessProvider } from '@/lib/social/provider/google-business';
import { LinkedInProvider } from '@/lib/social/provider/linkedin';
import { createMetaProvider } from '@/lib/social/provider/meta';
import { TikTokProvider } from '@/lib/social/provider/tiktok';
import type { SocialMediaProvider } from '@/lib/social/provider/types';
import { WhatsAppSocialProvider } from '@/lib/social/provider/whatsapp';
import { XProvider } from '@/lib/social/provider/x';
import { YouTubeProvider } from '@/lib/social/provider/youtube';
import type { SocialPlatform } from '@/lib/social/types';
import { isDemoMode } from '@/lib/supabase';

function preferDemo(): boolean {
  // Explicit live mode always uses official adapters (may return unsupported).
  if (process.env.SOCIAL_PROVIDER_MODE === 'live') return false;
  if (process.env.SOCIAL_PROVIDER_MODE === 'demo') return true;
  if (process.env.SOCIAL_FORCE_MEMORY === 'true') return true;
  if (isDemoMode) return true;
  return false;
}

export function getSocialProvider(platform: SocialPlatform): SocialMediaProvider {
  if (preferDemo() && platform !== 'whatsapp') {
    return new DemoSocialProvider(platform);
  }
  switch (platform) {
    case 'instagram':
    case 'facebook':
      return createMetaProvider(platform);
    case 'linkedin':
      return new LinkedInProvider();
    case 'x':
      return new XProvider();
    case 'tiktok':
      return new TikTokProvider();
    case 'youtube':
      return new YouTubeProvider();
    case 'whatsapp':
      return new WhatsAppSocialProvider();
    case 'google_business':
      return new GoogleBusinessProvider();
    default:
      return new DemoSocialProvider(platform);
  }
}

export function listProviderCapabilities() {
  const platforms: SocialPlatform[] = [
    'instagram',
    'facebook',
    'linkedin',
    'x',
    'tiktok',
    'youtube',
    'whatsapp',
    'google_business',
  ];
  return platforms.map((p) => {
    const provider = getSocialProvider(p);
    return {
      platform: p,
      providerId: provider.id,
      capabilities: provider.capabilities(),
      demoMode: preferDemo() && p !== 'whatsapp',
    };
  });
}
