import { ACTIVITY_RULES } from '@/lib/constants/clients';
import {
  COMPLETION_ATTACHMENT_LABELS,
  EMPTY_COMPLETION_ATTACHMENTS,
  type CompletionAttachmentKind,
  type CompletionAttachmentSlotStatus,
  type CompletionAttachmentsState,
} from '@/lib/types/completion-attachments';
import type { PlanAttachmentFile, ProjectEngineeringData } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';

const FNB_ACTIVITY_IDS = new Set(['restaurant']);

const FNB_PATTERN =
  /مطعم|مقهى|مطبخ|مطابخ|إعاشة|اعاشة|restaurant|cafe|café|kitchen|catering|food\s*&?\s*beverage|f\s*&\s*b/i;

function isAttachmentFile(value: unknown): value is PlanAttachmentFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as PlanAttachmentFile;
  return Boolean(file.id && file.fileName);
}

export function normalizeCompletionAttachments(value: unknown): CompletionAttachmentsState {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_COMPLETION_ATTACHMENTS };
  }
  const raw = value as Partial<CompletionAttachmentsState>;
  return {
    fire_alarm_install_contract: isAttachmentFile(raw.fire_alarm_install_contract)
      ? raw.fire_alarm_install_contract
      : null,
    fire_alarm_maintenance_contract: isAttachmentFile(raw.fire_alarm_maintenance_contract)
      ? raw.fire_alarm_maintenance_contract
      : null,
    electrical_safety_certificate: isAttachmentFile(raw.electrical_safety_certificate)
      ? raw.electrical_safety_certificate
      : null,
    elevator_maintenance_contract: isAttachmentFile(raw.elevator_maintenance_contract)
      ? raw.elevator_maintenance_contract
      : null,
    gas_chimney_certificate: isAttachmentFile(raw.gas_chimney_certificate)
      ? raw.gas_chimney_certificate
      : null,
  };
}

/** عدد المصاعد من مواصفات المخطط (مرحلة 2) */
export function getElevatorCount(data: ProjectEngineeringData): number {
  const raw = data.building_plan?.elevators_count;
  const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function projectHasElevators(data: ProjectEngineeringData): boolean {
  return getElevatorCount(data) > 0;
}

/** نشاط أغذية ومشروبات — من نوع النشاط أو تصنيف الأدوار */
export function isFoodAndBeverageProject(
  client: ClientRecord,
  data?: ProjectEngineeringData | null
): boolean {
  const activityId = String(client.activity_type || '').trim();
  if (FNB_ACTIVITY_IDS.has(activityId)) return true;

  const label = ACTIVITY_RULES[activityId]?.label || '';
  const blob = [activityId, label, client.business_name, client.activity_type]
    .filter(Boolean)
    .join(' ');
  if (FNB_PATTERN.test(blob)) return true;

  const floorUses = data?.technical_report?.floor_uses || [];
  for (const floor of floorUses) {
    for (const zone of floor.zones || []) {
      const zoneBlob = [zone.use_code, zone.subtype_code, zone.subtype_label, zone.label]
        .filter(Boolean)
        .join(' ');
      if (FNB_PATTERN.test(zoneBlob)) return true;
      if (zone.use_code === 'restaurant' || zone.use_code === 'kitchen') return true;
      if (zone.subtype_code === 'cafe' || zone.subtype_code === 'dining') return true;
    }
  }

  return false;
}

export function isCompletionAttachmentApplicable(
  kind: CompletionAttachmentKind,
  client: ClientRecord,
  data: ProjectEngineeringData
): boolean {
  if (kind === 'elevator_maintenance_contract') return projectHasElevators(data);
  if (kind === 'gas_chimney_certificate') return isFoodAndBeverageProject(client, data);
  return true;
}

export function getCompletionAttachmentStatus(
  kind: CompletionAttachmentKind,
  attachments: CompletionAttachmentsState,
  client: ClientRecord,
  data: ProjectEngineeringData
): CompletionAttachmentSlotStatus {
  if (!isCompletionAttachmentApplicable(kind, client, data)) return 'not_applicable';
  if (attachments[kind]?.fileName) return 'uploaded';
  return 'required';
}

export type CompletionAttachmentSlot = {
  kind: CompletionAttachmentKind;
  label: string;
  applicable: boolean;
  required: boolean;
  status: CompletionAttachmentSlotStatus;
  accept: string;
  hint: string;
};

export function listCompletionAttachmentSlots(
  client: ClientRecord,
  data: ProjectEngineeringData,
  attachments?: CompletionAttachmentsState | null
): CompletionAttachmentSlot[] {
  const docs = normalizeCompletionAttachments(attachments ?? data.completion_attachments);
  const defs: Array<{
    kind: CompletionAttachmentKind;
    accept: string;
    hint: string;
  }> = [
    {
      kind: 'fire_alarm_install_contract',
      accept: '.pdf,.png,.jpg,.jpeg,application/pdf,image/*',
      hint: 'إلزامي دائماً — عقد تركيب أنظمة الإطفاء والإنذار من شركة معتمدة',
    },
    {
      kind: 'fire_alarm_maintenance_contract',
      accept: '.pdf,.png,.jpg,.jpeg,application/pdf,image/*',
      hint: 'إلزامي دائماً — عقد صيانة أنظمة الإنذار والإطفاء من شركة معتمدة',
    },
    {
      kind: 'electrical_safety_certificate',
      accept: '.pdf,application/pdf',
      hint: 'إلزامي دائماً — شهادة/تقرير من مكتب هندسي معتمد (PDF فقط)',
    },
    {
      kind: 'elevator_maintenance_contract',
      accept: '.pdf,.png,.jpg,.jpeg,application/pdf,image/*',
      hint: 'يظهر عند وجود مصاعد في مواصفات المخطط (عدد المصاعد > 0)',
    },
    {
      kind: 'gas_chimney_certificate',
      accept: '.pdf,.png,.jpg,.jpeg,application/pdf,image/*',
      hint: 'يظهر لأنشطة الأغذية والمشروبات (مطعم / مقهى / مطبخ)',
    },
  ];

  return defs.map((def) => {
    const applicable = isCompletionAttachmentApplicable(def.kind, client, data);
    const status = getCompletionAttachmentStatus(def.kind, docs, client, data);
    return {
      kind: def.kind,
      label: COMPLETION_ATTACHMENT_LABELS[def.kind],
      applicable,
      required: applicable,
      status,
      accept: def.accept,
      hint: def.hint,
    };
  });
}

/** أسماء المستندات الإلزامية الناقصة */
export function missingCompletionAttachmentLabels(
  client: ClientRecord,
  data: ProjectEngineeringData
): string[] {
  const docs = normalizeCompletionAttachments(data.completion_attachments);
  return listCompletionAttachmentSlots(client, data, docs)
    .filter((slot) => slot.status === 'required')
    .map((slot) => slot.label);
}

/**
 * رسائل المنع قبل اعتماد/إصدار شهادة إنهاء الأعمال.
 * الصيغة: يرجى إرفاق [اسم المستند] أولاً...
 */
export function completionAttachmentBlockers(
  client: ClientRecord,
  data: ProjectEngineeringData
): string[] {
  return missingCompletionAttachmentLabels(client, data).map(
    (label) => `يرجى إرفاق ${label} أولاً لإكمال إصدار شهادة إنهاء الأعمال.`
  );
}

export function hasAllRequiredCompletionAttachments(
  client: ClientRecord,
  data: ProjectEngineeringData
): boolean {
  return missingCompletionAttachmentLabels(client, data).length === 0;
}
