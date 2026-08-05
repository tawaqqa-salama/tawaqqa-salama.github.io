/**
 * مرفقات شهادة إنهاء الأعمال — تظهر حسب النشاط وتُشترط قبل الإصدار/الطباعة.
 */

export type CompletionAttachmentKind =
  | 'electrical_safety_certificate'
  | 'gas_safety_certificate'
  | 'chimney_installation_certificate'
  | 'fire_alarm_installation_contract'
  | 'fire_alarm_maintenance_contract'
  | 'elevator_maintenance_contract'
  | 'other';

export type CompletionAttachmentFile = {
  id: string;
  fileName: string;
  format: string;
  sizeBytes: number;
  mimeType?: string | null;
  dataUrl?: string | null;
  storagePath?: string | null;
  storageBucket?: string | null;
  uploadedAt: string;
  kind: CompletionAttachmentKind;
};

export type CompletionAttachmentsState = {
  electrical_safety_certificate: CompletionAttachmentFile | null;
  gas_safety_certificate: CompletionAttachmentFile | null;
  chimney_installation_certificate: CompletionAttachmentFile | null;
  fire_alarm_installation_contract: CompletionAttachmentFile | null;
  fire_alarm_maintenance_contract: CompletionAttachmentFile | null;
  elevator_maintenance_contract: CompletionAttachmentFile | null;
  /** شهادات/عقود إضافية اختيارية */
  other: CompletionAttachmentFile[];
};

export const EMPTY_COMPLETION_ATTACHMENTS: CompletionAttachmentsState = {
  electrical_safety_certificate: null,
  gas_safety_certificate: null,
  chimney_installation_certificate: null,
  fire_alarm_installation_contract: null,
  fire_alarm_maintenance_contract: null,
  elevator_maintenance_contract: null,
  other: [],
};

export const COMPLETION_ATTACHMENT_LABELS: Record<CompletionAttachmentKind, string> = {
  electrical_safety_certificate: 'شهادة سلامة تمديدات الكهرباء',
  gas_safety_certificate: 'شهادة سلامة تمديدات الغاز',
  chimney_installation_certificate: 'شهادة تركيبات المداخن',
  fire_alarm_installation_contract: 'عقد تركيبات أجهزة الإطفاء والإنذار',
  fire_alarm_maintenance_contract: 'عقد صيانة أنظمة الإطفاء والإنذار',
  elevator_maintenance_contract: 'عقد صيانة المصاعد',
  other: 'شهادات / مستندات أخرى',
};

export type CompletionAttachmentSlot = {
  kind: CompletionAttachmentKind;
  key: Exclude<keyof CompletionAttachmentsState, 'other'> | 'other';
  label: string;
  required: boolean;
  visible: boolean;
  multi?: boolean;
  hint: string;
};

/** أنشطة/كلمات تدل على مطبخ — تظهر شهادات الغاز والمداخن */
export function isKitchenActivity(params: {
  activityType?: string | null;
  activityLabel?: string | null;
}): boolean {
  const type = String(params.activityType || '').toLowerCase();
  const label = String(params.activityLabel || '');
  if (type === 'restaurant' || type === 'hotel') return true;
  return /مطبخ|مطعم|مقهى|كافيه|مأكولات|تموين|kitchen|restaurant|cafe|catering|hotel|فندق/i.test(
    `${type} ${label}`
  );
}

/** وجود مصعد من مخطط المبنى أو إقرار الشهادة */
export function hasElevatorPresent(params: {
  elevatorsCount?: string | number | null;
  hasElevator?: 'نعم' | 'لا' | '' | null;
}): boolean {
  if (params.hasElevator === 'نعم') return true;
  if (params.hasElevator === 'لا') return false;
  const raw = params.elevatorsCount;
  if (raw == null || raw === '') return false;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  if (Number.isFinite(n) && n > 0) return true;
  return /نعم|يوجد|مصعد/i.test(String(raw)) && !/^0+$/.test(String(raw).trim());
}

export function resolveCompletionAttachmentSlots(params: {
  activityType?: string | null;
  activityLabel?: string | null;
  elevatorsCount?: string | number | null;
  hasElevator?: 'نعم' | 'لا' | '' | null;
}): CompletionAttachmentSlot[] {
  const kitchen = isKitchenActivity(params);
  const elevator = hasElevatorPresent(params);

  const slots: CompletionAttachmentSlot[] = [
    {
      kind: 'electrical_safety_certificate',
      key: 'electrical_safety_certificate',
      label: COMPLETION_ATTACHMENT_LABELS.electrical_safety_certificate,
      required: true,
      visible: true,
      hint: 'إلزامي لجميع الأنشطة',
    },
    {
      kind: 'gas_safety_certificate',
      key: 'gas_safety_certificate',
      label: COMPLETION_ATTACHMENT_LABELS.gas_safety_certificate,
      required: true,
      visible: kitchen,
      hint: 'إلزامي لأنشطة المطابخ / المطاعم',
    },
    {
      kind: 'chimney_installation_certificate',
      key: 'chimney_installation_certificate',
      label: COMPLETION_ATTACHMENT_LABELS.chimney_installation_certificate,
      required: true,
      visible: kitchen,
      hint: 'إلزامي لأنشطة المطابخ / المطاعم',
    },
    {
      kind: 'fire_alarm_installation_contract',
      key: 'fire_alarm_installation_contract',
      label: COMPLETION_ATTACHMENT_LABELS.fire_alarm_installation_contract,
      required: true,
      visible: true,
      hint: 'إلزامي لجميع الأنشطة',
    },
    {
      kind: 'fire_alarm_maintenance_contract',
      key: 'fire_alarm_maintenance_contract',
      label: COMPLETION_ATTACHMENT_LABELS.fire_alarm_maintenance_contract,
      required: true,
      visible: true,
      hint: 'إلزامي لجميع الأنشطة',
    },
    {
      kind: 'elevator_maintenance_contract',
      key: 'elevator_maintenance_contract',
      label: COMPLETION_ATTACHMENT_LABELS.elevator_maintenance_contract,
      required: true,
      visible: elevator,
      hint: 'إلزامي عند وجود مصعد',
    },
    {
      kind: 'other',
      key: 'other',
      label: COMPLETION_ATTACHMENT_LABELS.other,
      required: false,
      visible: true,
      multi: true,
      hint: 'اختياري — يمكن إرفاق أكثر من ملف',
    },
  ];

  return slots.filter((s) => s.visible);
}

function isFile(value: unknown): value is CompletionAttachmentFile {
  if (!value || typeof value !== 'object') return false;
  const f = value as CompletionAttachmentFile;
  return Boolean(f.id && f.fileName && f.kind);
}

export function normalizeCompletionAttachments(value: unknown): CompletionAttachmentsState {
  if (!value || typeof value !== 'object') return { ...EMPTY_COMPLETION_ATTACHMENTS, other: [] };
  const raw = value as Partial<CompletionAttachmentsState>;
  return {
    electrical_safety_certificate: isFile(raw.electrical_safety_certificate)
      ? raw.electrical_safety_certificate
      : null,
    gas_safety_certificate: isFile(raw.gas_safety_certificate) ? raw.gas_safety_certificate : null,
    chimney_installation_certificate: isFile(raw.chimney_installation_certificate)
      ? raw.chimney_installation_certificate
      : null,
    fire_alarm_installation_contract: isFile(raw.fire_alarm_installation_contract)
      ? raw.fire_alarm_installation_contract
      : null,
    fire_alarm_maintenance_contract: isFile(raw.fire_alarm_maintenance_contract)
      ? raw.fire_alarm_maintenance_contract
      : null,
    elevator_maintenance_contract: isFile(raw.elevator_maintenance_contract)
      ? raw.elevator_maintenance_contract
      : null,
    other: Array.isArray(raw.other) ? raw.other.filter(isFile) : [],
  };
}

/** أسماء المرفقات الإلزامية الناقصة — فارغ = جاهز للإصدار */
export function missingRequiredCompletionAttachments(
  attachments: CompletionAttachmentsState | null | undefined,
  slots: CompletionAttachmentSlot[]
): string[] {
  const state = normalizeCompletionAttachments(attachments);
  const missing: string[] = [];
  for (const slot of slots) {
    if (!slot.required || slot.kind === 'other') continue;
    const file = state[slot.key as Exclude<keyof CompletionAttachmentsState, 'other'>];
    if (!file?.fileName) missing.push(slot.label);
  }
  return missing;
}

export function validateCompletionAttachmentsForIssue(
  attachments: CompletionAttachmentsState | null | undefined,
  context: {
    activityType?: string | null;
    activityLabel?: string | null;
    elevatorsCount?: string | number | null;
    hasElevator?: 'نعم' | 'لا' | '' | null;
  }
): string | null {
  const slots = resolveCompletionAttachmentSlots(context);
  const missing = missingRequiredCompletionAttachments(attachments, slots);
  if (!missing.length) return null;
  return `لا يمكن إصدار شهادة إنهاء الأعمال قبل إرفاق: ${missing.join(' · ')}`;
}
