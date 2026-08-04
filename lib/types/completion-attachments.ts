import type { CompletionAttachmentsState, PlanAttachmentFile } from '@/lib/types/project-reports';
import { EMPTY_COMPLETION_ATTACHMENTS } from '@/lib/types/project-reports';

export type { CompletionAttachmentsState, PlanAttachmentFile };
export { EMPTY_COMPLETION_ATTACHMENTS };

/** مفاتيح عقود الصيانة والشهادات الفنية قبل شهادة إنهاء الأعمال */
export type CompletionAttachmentKind =
  | 'fire_alarm_install_contract'
  | 'fire_alarm_maintenance_contract'
  | 'electrical_safety_certificate'
  | 'elevator_maintenance_contract'
  | 'gas_chimney_certificate';

export const COMPLETION_ATTACHMENT_LABELS: Record<CompletionAttachmentKind, string> = {
  fire_alarm_install_contract: 'عقد اتفاق تركيب أنظمة الإطفاء والإنذار (شركة معتمدة)',
  fire_alarm_maintenance_contract: 'عقد صيانة أنظمة الإنذار والإطفاء (شركة معتمدة)',
  electrical_safety_certificate: 'شهادة سلامة التمديدات الكهربائية',
  elevator_maintenance_contract: 'عقد صيانة المصاعد (شركة مصاعد معتمدة)',
  gas_chimney_certificate: 'شهادة تمديدات الغاز والمداخن',
};

export type CompletionAttachmentSlotStatus = 'uploaded' | 'required' | 'not_applicable';
