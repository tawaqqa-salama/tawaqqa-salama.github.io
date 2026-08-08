import type { PermissionCode } from '@/lib/auth/types';
import { hasPermission } from '@/lib/auth/permissions';
import type { WhatsAppPermission } from '@/lib/whatsapp/types';

export const WHATSAPP_PERMISSIONS: {
  code: WhatsAppPermission;
  label_ar: string;
}[] = [
  { code: 'whatsapp.view', label_ar: 'عرض محادثات واتساب' },
  { code: 'whatsapp.send', label_ar: 'إرسال رسائل واتساب' },
  { code: 'whatsapp.manage', label_ar: 'إدارة محادثات واتساب' },
  { code: 'whatsapp.campaigns', label_ar: 'حملات واتساب' },
  { code: 'whatsapp.settings', label_ar: 'إعدادات واتساب' },
  { code: 'whatsapp.assign', label_ar: 'تعيين محادثات واتساب' },
];

/** Extend PermissionCode union usage — codes stored as strings on roles. */
export function hasWhatsAppPermission(
  permissions: PermissionCode[] | string[] | undefined,
  needed: WhatsAppPermission
): boolean {
  if (!permissions?.length) return false;
  if (permissions.includes('*' as PermissionCode)) return true;
  if (permissions.includes('dept.marketing' as PermissionCode) && needed === 'whatsapp.view') {
    return true;
  }
  // marketing dept gets view+send by default; settings/campaigns need explicit or admin
  if (permissions.includes('dept.marketing' as PermissionCode)) {
    if (needed === 'whatsapp.send' || needed === 'whatsapp.manage' || needed === 'whatsapp.assign') {
      return true;
    }
  }
  if (permissions.includes('dept.settings' as PermissionCode) && needed === 'whatsapp.settings') {
    return true;
  }
  return hasPermission(permissions as PermissionCode[], needed as PermissionCode);
}
