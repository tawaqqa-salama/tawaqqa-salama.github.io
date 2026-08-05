import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { SBC_OCCUPANCIES } from '@/lib/constants/sbc801';
import type { CompanyProfile } from '@/lib/company-profile';
import type { ClientRecord } from '@/lib/types/client';
import type {
  CompletionCertificateReport,
  ProjectEngineeringData,
} from '@/lib/types/project-reports';
import {
  formatGregorianDate,
  formatHijriDate,
  resolveOfficeCivilDefenseLicense,
} from '@/lib/projects/safety-delivery-letter';
import {
  EMPTY_COMPLETION_ATTACHMENTS,
  hasElevatorPresent,
  normalizeCompletionAttachments,
} from '@/lib/projects/completion-certificate-attachments';
import { getClientIdentitySnapshot } from '@/lib/projects/client-identity';

function pick(existing: string | undefined | null, fallback: string): string {
  const text = String(existing ?? '').trim();
  return text || fallback;
}

export function seedCompletionCertificate(
  client: ClientRecord,
  data: ProjectEngineeringData,
  company: CompanyProfile | null | undefined,
  existing?: CompletionCertificateReport | null
): CompletionCertificateReport {
  const activity = ACTIVITY_RULES[client.activity_type || ''];
  const occupancy = activity ? SBC_OCCUPANCIES[activity.occupancy] : null;
  const tech = data.technical_report;
  const plan = data.building_plan;
  const today = new Date().toISOString().slice(0, 10);
  const floors =
    tech.floors_description ||
    (client.floors_count != null ? `${client.floors_count} أدوار` : '') ||
    (client.floor_levels || [])
      .map((f) => `${f.label}${f.repeat_count > 1 ? ` ×${f.repeat_count}` : ''}`)
      .join('، ');

  const elevatorFromPlan = hasElevatorPresent({ elevatorsCount: plan?.elevators_count });
  const hasElevator =
    existing?.has_elevator === 'نعم' || existing?.has_elevator === 'لا'
      ? existing.has_elevator
      : elevatorFromPlan
        ? 'نعم'
        : '';

  // Identity always from Sales/client — never keep a stale retyped copy
  const identity = getClientIdentitySnapshot(client);

  return {
    status: existing?.status || 'مسودة',
    certificate_number: existing?.certificate_number || '',
    issue_date: pick(existing?.issue_date, today),
    completion_date: pick(existing?.completion_date, today),
    project_name: identity.facility_name,
    owner_name: identity.owner_name,
    scope_of_work: pick(
      existing?.scope_of_work,
      'تنفيذ وتطبيق جميع أنظمة الوقاية والحماية من الحريق وفق كود البناء السعودي واشتراطات الدفاع المدني'
    ),
    engineer_name: pick(
      existing?.engineer_name,
      tech.safety_engineer_name || client.assigned_engineer || ''
    ),
    notes: existing?.notes || '',

    study_office_name: pick(
      existing?.study_office_name,
      company?.legal_name || company?.name || ''
    ),
    study_report_number: pick(
      existing?.study_report_number,
      tech.outgoing_number || data.engineering_delivery?.outgoing_number || ''
    ),
    study_date: pick(
      existing?.study_date,
      tech.report_date || data.engineering_delivery?.delivery_date || today
    ),

    facility_name: identity.facility_name,
    activity_label: identity.activity_label,
    activity_classification: pick(
      existing?.activity_classification,
      tech.building_classification ||
        (occupancy ? `GROUP ${occupancy.group_letter} — ${occupancy.label_ar}` : '')
    ),
    district: identity.district,
    street: identity.street,
    land_area: identity.land_area,
    building_components: pick(
      existing?.building_components,
      floors || (identity.building_area ? `مساحة بناء ${identity.building_area} م²` : '')
    ),
    building_structural_class: pick(
      existing?.building_structural_class,
      tech.building_status || client.project_status || ''
    ),
    owner_contact: identity.phone,

    contractor_name: existing?.contractor_name || '',
    contractor_license: existing?.contractor_license || '',
    contractor_license_expiry: existing?.contractor_license_expiry || '',

    office_license_number: pick(
      existing?.office_license_number,
      resolveOfficeCivilDefenseLicense(company)
    ),
    office_license_expiry: existing?.office_license_expiry || '',
    office_owner_name: pick(
      existing?.office_owner_name,
      tech.executive_director_name || company?.legal_name || company?.name || ''
    ),
    chamber_footer_note: pick(
      existing?.chamber_footer_note,
      'تم إصدار هذا الختم بناء على طلب المشترك والتحقق من بيانات العضوية عبر الغرفة التجارية / الخدمات الإلكترونية المعتمدة.'
    ),
    has_elevator: hasElevator,
    attachments: normalizeCompletionAttachments(
      existing?.attachments || EMPTY_COMPLETION_ATTACHMENTS
    ),
    updated_at: existing?.updated_at || null,
  };
}

export function completionCertificateDates(isoDate?: string | null) {
  const day = isoDate || new Date().toISOString().slice(0, 10);
  return {
    gregorian: formatGregorianDate(day),
    hijri: formatHijriDate(day),
  };
}
