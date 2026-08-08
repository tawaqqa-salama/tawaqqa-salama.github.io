export type SocialPlatform =
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'x'
  | 'tiktok'
  | 'youtube'
  | 'google_business';

export type SocialPermission =
  | 'social.view'
  | 'social.manage'
  | 'social.publish'
  | 'social.accounts'
  | 'social.inbox'
  | 'social.campaigns'
  | 'social.analytics';

export type WebsitePermission =
  | 'website.view'
  | 'website.manage'
  | 'website.publish'
  | 'website.forms'
  | 'website.settings';

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export type ProviderCapability =
  | 'oauth'
  | 'messages'
  | 'comments'
  | 'publish'
  | 'analytics'
  | 'media';

export type ProviderResult<T = unknown> =
  | { ok: true; supported: true; data: T }
  | { ok: false; supported: true; error: string }
  | { ok: false; supported: false; reason: string };

export const SOCIAL_PLATFORMS: {
  id: SocialPlatform;
  label: string;
  label_ar: string;
}[] = [
  { id: 'instagram', label: 'Instagram', label_ar: 'إنستغرام' },
  { id: 'facebook', label: 'Facebook', label_ar: 'فيسبوك' },
  { id: 'linkedin', label: 'LinkedIn', label_ar: 'لينكدإن' },
  { id: 'x', label: 'X', label_ar: 'إكس' },
  { id: 'tiktok', label: 'TikTok', label_ar: 'تيك توك' },
  { id: 'youtube', label: 'YouTube', label_ar: 'يوتيوب' },
  { id: 'whatsapp', label: 'WhatsApp', label_ar: 'واتساب' },
  { id: 'google_business', label: 'Google Business', label_ar: 'نشاطي على Google' },
];

export type DashboardRange = 'today' | '7d' | '30d' | '90d' | 'custom';
