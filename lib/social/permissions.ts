import type { PermissionCode } from '@/lib/auth/types';
import { hasPermission } from '@/lib/auth/permissions';
import type { SocialPermission, WebsitePermission } from '@/lib/social/types';

export function hasSocialPermission(
  permissions: PermissionCode[] | string[] | undefined,
  needed: SocialPermission
): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes('*')) return true;
  if (permissions.includes('dept.marketing')) {
    if (
      needed === 'social.view' ||
      needed === 'social.inbox' ||
      needed === 'social.analytics' ||
      needed === 'social.campaigns'
    ) {
      return true;
    }
  }
  return hasPermission(permissions as PermissionCode[], needed as PermissionCode);
}

export function hasWebsitePermission(
  permissions: PermissionCode[] | string[] | undefined,
  needed: WebsitePermission
): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes('*')) return true;
  if (permissions.includes('dept.marketing')) {
    if (needed === 'website.view' || needed === 'website.forms') return true;
  }
  return hasPermission(permissions as PermissionCode[], needed as PermissionCode);
}
