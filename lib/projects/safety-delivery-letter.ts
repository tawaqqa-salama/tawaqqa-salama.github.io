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
  new_design: 'تصميم جديد',
  modify_existing: 'تعديل على نظام موجود',
  approve_existing: 'اعتماد نظام موجود',
  not_required: 'لا يتطلب',
};

export const DEFAULT_SAFETY_SCOPE: SafetyScopeRow[] = [
  { id: 'firefighting', label: 'نظام الإطفاء', option: 'new_design', applicable: 'نعم' },
  { id: 'alarm', label: 'نظام الإنذار', option: 'new_design', applicable: 'نعم' },
  { id: 'smoke_control', label: 'نظام سحب والتحكم بالدخان', option: 'new_design', applicable: 'نعم' },
  { id: 'emergency_exits', label: 'مخارج الطوارئ', option: 'new_design', applicable: 'نعم' },
  { id: 'supervision_contract', label: 'عقد الإشراف', option: 'new_design', applicable: 'نعم' },
];

export function formatHijriDate(isoDate?: string | null): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return '—';
  }
}

export function formatGregorianDate(isoDate?: string | null): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return isoDate;
  }
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
  const hasExits = (tech.exits_items || []).some((i) => i.enabled);

  return DEFAULT_SAFETY_SCOPE.map((row) => {
    if (row.id === 'firefighting') {
      return { ...row, option: hasSprinkler ? 'new_design' : 'not_required', applicable: hasSprinkler ? 'نعم' : 'لا' };
    }
    if (row.id === 'alarm') {
      return { ...row, option: hasAlarm ? 'new_design' : 'not_required', applicable: hasAlarm ? 'نعم' : 'لا' };
    }
    if (row.id === 'smoke_control') {
      return { ...row, option: hasSmoke ? 'new_design' : 'not_required', applicable: hasSmoke ? 'نعم' : 'لا' };
    }
    if (row.id === 'emergency_exits') {
      return { ...row, option: hasExits ? 'new_design' : 'new_design', applicable: 'نعم' };
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
  if (!existing || !(key in existing) || existing[key] == null) return fallback;
  return String(existing[key] ?? '');
}

/** يجهّز حقول خطاب التسليم من بيانات المشروع والشركة */
export function seedEngineeringDelivery(
  client: ClientRecord,
  data: ProjectEngineeringData,
  existing?: EngineeringDeliveryReport | null
): EngineeringDeliveryReport {
  const city = client.city || 'الرياض';
  const inferred = inferScopeFromPlan(data);
  const today = new Date().toISOString().slice(0, 10);
  const deliveryDate = pickText(existing, 'delivery_date', today);

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
    copy_to: pickText(existing, 'copy_to', 'مركز السلامة الميداني — المالك / المستثمر'),
    civil_defense_city: pickText(existing, 'civil_defense_city', city),
    outgoing_number: pickText(
      existing,
      'outgoing_number',
      data.technical_report.outgoing_number || ''
    ),
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
    hijri_date: pickText(existing, 'hijri_date', formatHijriDate(deliveryDate)),
  };
}

export function getFacilitySnapshotForLetter(client: ClientRecord, data: ProjectEngineeringData) {
  const activity = ACTIVITY_RULES[client.activity_type || ''];
  const occupancy = activity ? SBC_OCCUPANCIES[activity.occupancy] : null;
  const tech = data.technical_report;
  const plan = data.building_plan;

  return {
    facilityName: client.business_name || client.name || '—',
    ownerName: client.owner_name || '—',
    activityLabel: activity?.label || client.activity_type || '—',
    occupancyLabel:
      tech.building_classification ||
      (occupancy
        ? `GROUP ${occupancy.group_letter} — ${occupancy.label_ar}`
        : '—'),
    landArea: String(client.land_area ?? plan.total_site_area_m2 ?? '—'),
    buildingArea: String(client.building_area ?? '—'),
    floorsCount: String(client.floors_count ?? '—'),
    buildingStatus: tech.building_status || client.project_status || 'تحت الإنشاء',
    permitNumber: tech.building_permit_number || plan.building_permit_number || '—',
    permitDate: tech.building_permit_date || '—',
    phone: client.phone || '—',
    city: client.city || '—',
    location: [client.district, client.street, client.national_address].filter(Boolean).join(' — ') || '—',
  };
}
