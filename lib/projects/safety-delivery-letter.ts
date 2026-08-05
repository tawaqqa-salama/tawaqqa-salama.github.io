import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { SBC_OCCUPANCIES } from '@/lib/constants/sbc801';
import type { ClientRecord } from '@/lib/types/client';
import type {
  EngineeringDeliveryReport,
  ProjectEngineeringData,
  SafetyScopeOption,
  SafetyScopeRow,
} from '@/lib/types/project-reports';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';

export const SAFETY_SCOPE_OPTION_LABELS: Record<Exclude<SafetyScopeOption, ''>, string> = {
  new_design: 'تم تصميم النظام من جديد',
  modify_existing: 'تم التعديل على النظام الموجود',
  approve_existing: 'تم اعتماد النظام الموجود',
  not_required: 'لا يتطلب وجود النظام',
};

export const DEFAULT_SAFETY_SCOPE: SafetyScopeRow[] = [
  { id: 'firefighting', label: 'نظام الإطفاء', option: 'new_design', applicable: 'نعم' },
  { id: 'alarm', label: 'نظام الإنذار', option: 'new_design', applicable: 'نعم' },
  { id: 'smoke_control', label: 'نظام سحب والتحكم بالدخان', option: 'new_design', applicable: 'نعم' },
  { id: 'emergency_exits', label: 'مخارج الطوارئ', option: 'new_design', applicable: 'نعم' },
  { id: 'supervision_contract', label: 'عقد الإشراف', option: 'new_design', applicable: 'نعم' },
];

/** يفسّر YYYY-MM-DD كتاريخ محلي لتجنب انزياح UTC */
export function parseIsoDateLocal(isoDate?: string | null): Date | null {
  if (!isoDate) return null;
  const trimmed = String(isoDate).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pad2(value: string | number): string {
  return String(value).padStart(2, '0');
}

/**
 * تاريخ هجري نصي فقط — مثال: ٢٠ صفر، ١٤٤٨ هـ
 * لا يُستخدم أبداً لحقل الميلادي.
 */
export function formatHijriDate(isoDate?: string | null): string {
  const d = parseIsoDateLocal(isoDate);
  if (!d) return '—';
  try {
    const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const parts = fmt.formatToParts(d);
    const day = parts.find((p) => p.type === 'day')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const year = parts.find((p) => p.type === 'year')?.value;
    if (day && month && year) {
      // مثال مطلوب: ٢٠ صفر، ١٤٤٨ هـ
      return `${day} ${month}، ${year} هـ`;
    }
    const text = fmt.format(d).replace(/\s*هـ?\.?\s*$/u, '').trim();
    return `${text} هـ`;
  } catch {
    return '—';
  }
}

/**
 * تاريخ ميلادي صريح بأرقام لاتينية — مثال: 2026/08/02 م
 * لا يمر عبر ar-SA بدون تقويم (قد يُرجع هجرياً).
 */
export function formatGregorianDate(isoDate?: string | null): string {
  const d = parseIsoDateLocal(isoDate);
  if (!d) return '—';
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} م`;
}

export function extractCityFromAddressee(text?: string | null): string | null {
  if (!text) return null;
  const match = String(text).match(/محافظة\s+([^\s،,]+)/);
  return match?.[1]?.trim() || null;
}

export function formatCopyToLines(ownerName: string, custom?: string | null): string[] {
  const owner = ownerName?.trim() || '—';
  if (custom?.trim()) {
    const text = custom.trim();
    if (!/مركز السلامة/.test(text) && !/المالك/.test(text)) {
      return [text, `صورة للمالك / المستثمر: ${owner}`];
    }
    // إن كان النص متعدد الأسطر احتفظ به
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) return lines;
  }
  return ['صورة لمركز السلامة الميدانية', `صورة للمالك / المستثمر: ${owner}`];
}

export function displayOrPending(value?: string | null, pending = 'تحت الإجراء'): string {
  const text = String(value ?? '').trim();
  if (!text || text === '—' || text === '-' || text.toUpperCase() === 'N/A') return pending;
  return text;
}

export function resolveOfficeCivilDefenseLicense(
  company: {
    membership_id?: string | null;
    civil_defense_license?: string | null;
    license_number?: string | null;
  } | null | undefined
): string {
  if (!company) return 'تحت الإجراء';
  const raw =
    company.membership_id || company.civil_defense_license || company.license_number || '';
  const license = String(raw || '').trim();
  return license || 'تحت الإجراء';
}

/** Alias used by the delivery form UI */
export const getOfficeCivilDefenseLicense = resolveOfficeCivilDefenseLicense;

/** صف مصفوفة الأعمال بأربعة أعمدة نعم/لا */
export type SafetySystemMatrixRow = {
  name: string;
  newDesign: boolean;
  modified: boolean;
  approved: boolean;
  notRequired: boolean;
};

export function toSafetySystemMatrix(rows?: SafetyScopeRow[] | null): SafetySystemMatrixRow[] {
  const scope = mergeSafetyScope(rows, DEFAULT_SAFETY_SCOPE);
  return scope.map((row) => {
    let option = (row.option || '') as SafetyScopeOption;
    if (!option && row.applicable === 'لا') option = 'not_required';
    return {
      name: row.label,
      newDesign: option === 'new_design',
      modified: option === 'modify_existing',
      approved: option === 'approve_existing',
      notRequired: option === 'not_required',
    };
  });
}

function inferScopeFromPlan(data: ProjectEngineeringData): SafetyScopeRow[] {
  const plan = data.building_plan;
  const tech = data.technical_report;

  const hasSprinkler =
    plan.sprinkler_system === 'نعم' ||
    (tech.firefighting_items || []).some((i) => i.enabled);
  const hasAlarm =
    plan.fire_alarm_system === 'نعم' || (tech.alarm_items || []).some((i) => i.enabled);
  const hasSmoke = (tech.ventilation_items || []).some((i) => i.enabled);

  return DEFAULT_SAFETY_SCOPE.map((row) => {
    if (row.id === 'firefighting') {
      return {
        ...row,
        option: hasSprinkler ? 'new_design' : 'not_required',
        applicable: hasSprinkler ? 'نعم' : 'لا',
      };
    }
    if (row.id === 'alarm') {
      return {
        ...row,
        option: hasAlarm ? 'new_design' : 'not_required',
        applicable: hasAlarm ? 'نعم' : 'لا',
      };
    }
    if (row.id === 'smoke_control') {
      return {
        ...row,
        option: hasSmoke ? 'new_design' : 'not_required',
        applicable: hasSmoke ? 'نعم' : 'لا',
      };
    }
    if (row.id === 'emergency_exits') {
      return { ...row, option: 'new_design', applicable: 'نعم' };
    }
    return { ...row };
  });
}

export function mergeSafetyScope(
  existing?: SafetyScopeRow[] | null,
  fallback?: SafetyScopeRow[]
): SafetyScopeRow[] {
  const base = fallback || DEFAULT_SAFETY_SCOPE;
  if (!existing?.length) return base.map((row) => ({ ...row }));
  return base.map((row) => {
    const found = existing.find((item) => item.id === row.id);
    return found ? { ...row, ...found, label: row.label } : { ...row };
  });
}

function pickText(
  existing: EngineeringDeliveryReport | null | undefined,
  key: keyof EngineeringDeliveryReport,
  fallback: string
): string {
  if (!existing || !(key in existing) || existing[key] == null || existing[key] === '') {
    return fallback;
  }
  return String(existing[key] ?? '');
}

export function seedEngineeringDelivery(
  client: ClientRecord,
  data: ProjectEngineeringData,
  existing?: EngineeringDeliveryReport | null
): EngineeringDeliveryReport {
  const city = client.city || 'الرياض';
  const inferred = inferScopeFromPlan(data);
  const today = new Date().toISOString().slice(0, 10);
  const deliveryDate = pickText(existing, 'delivery_date', today);
  const owner = client.owner_name || client.name || '—';

  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA.engineering_delivery,
    ...existing,
    status: existing?.status || 'مسودة',
    delivery_date: deliveryDate,
    delivered_to: pickText(
      existing,
      'delivered_to',
      `سعادة مدير الإدارة العامة للدفاع المدني بمحافظة ${city}`
    ),
    copy_to: pickText(
      existing,
      'copy_to',
      `صورة لمركز السلامة الميدانية\nصورة للمالك / المستثمر: ${owner}`
    ),
    civil_defense_city: client.city || extractCityFromAddressee(existing?.delivered_to) || city,
    outgoing_number: pickText(
      existing,
      'outgoing_number',
      data.technical_report.outgoing_number || ''
    ),
    building_permit_number:
      data.building_plan.building_permit_number ||
      data.technical_report.building_permit_number ||
      client.license_number ||
      existing?.building_permit_number ||
      '',
    attachments_count: existing?.attachments_count ?? 1,
    safety_engineer_name: pickText(
      existing,
      'safety_engineer_name',
      data.technical_report.safety_engineer_name || client.assigned_engineer || ''
    ),
    safety_engineer_title: pickText(existing, 'safety_engineer_title', 'مهندس سلامة معتمد'),
    safety_engineer_phone: pickText(existing, 'safety_engineer_phone', ''),
    manager_name: pickText(
      existing,
      'manager_name',
      data.technical_report.executive_director_name || ''
    ),
    manager_title: pickText(existing, 'manager_title', 'مدير المكتب'),
    manager_phone: pickText(existing, 'manager_phone', ''),
    notes: pickText(existing, 'notes', existing?.study_summary || ''),
    study_summary: pickText(existing, 'study_summary', existing?.notes || ''),
    safety_scope: mergeSafetyScope(existing?.safety_scope, inferred),
    hijri_date: formatHijriDate(deliveryDate),
  };
}

export function getFacilitySnapshotForLetter(client: ClientRecord, data: ProjectEngineeringData) {
  const activity = ACTIVITY_RULES[client.activity_type || ''];
  const occupancy = activity ? SBC_OCCUPANCIES[activity.occupancy] : null;
  const tech = data.technical_report;
  const plan = data.building_plan;

  return {
    facilityName: client.business_name || client.name || '—',
    ownerName: client.owner_name || client.name || '—',
    activityLabel: activity?.label || client.activity_type || '—',
    occupancyLabel:
      tech.building_classification ||
      (occupancy ? `GROUP ${occupancy.group_letter} — ${occupancy.label_ar}` : '—'),
    landArea: String(client.land_area ?? plan.total_site_area_m2 ?? '—'),
    buildingArea: String(client.building_area ?? '—'),
    floorsCount: String(client.floors_count ?? '—'),
    buildingStatus: tech.building_status || client.project_status || 'تحت الإنشاء',
    permitNumber: displayOrPending(
      data.engineering_delivery?.building_permit_number ||
        tech.building_permit_number ||
        plan.building_permit_number
    ),
    permitDate: displayOrPending(tech.building_permit_date),
    phone: client.phone || '—',
    city: client.city || '—',
    location:
      [client.district, client.street, client.national_address].filter(Boolean).join(' — ') || '—',
  };
}
