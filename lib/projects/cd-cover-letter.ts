/**
 * خطاب تسليم الدفاع المدني — توريد CD بالمخططات والتقرير الفني
 * يسحب البيانات من حالة المشروع الحالية (عميل + تقارير هندسية).
 */

import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { SBC_OCCUPANCIES } from '@/lib/constants/sbc801';
import type { ClientRecord } from '@/lib/types/client';
import type {
  CdCoverLetterReport,
  ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import {
  formatGregorianDate,
  formatHijriDate,
} from '@/lib/projects/safety-delivery-letter';

export const DEFAULT_CD_ADDRESSEE =
  'السادة / الإدارة العامة للدفاع المدني - إدارة السلامة';

export type CdCoverLetterSnapshot = {
  outgoingNumber: string;
  letterDateIso: string;
  gregorianDate: string;
  hijriDate: string;
  addressee: string;
  copyTo: string;
  projectName: string;
  location: string;
  ownerName: string;
  totalAreaM2: string;
  occupancyCode: string;
  buildingStatus: string;
  managerName: string;
  managerTitle: string;
  engineerName: string;
  engineerTitle: string;
};

function normalizeBuildingStatus(raw?: string | null): 'مبنى قائم' | 'تحت الإنشاء' {
  const text = String(raw || '').trim();
  if (!text) return 'تحت الإنشاء';
  if (/قائم|existing|مشغّل|مشغل|مكتمل البناء/i.test(text)) return 'مبنى قائم';
  if (/إنشاء|under.?construction|جديد|تصميم/i.test(text)) return 'تحت الإنشاء';
  if (text === 'مبنى قائم' || text === 'تحت الإنشاء') return text;
  return 'تحت الإنشاء';
}

/** تصنيف الإشغال بصيغة GROUP … المناسبة لخطابات الدفاع المدني */
export function resolveOccupancyCode(client: ClientRecord, data: ProjectEngineeringData): string {
  const tech = data.technical_report;
  const explicit =
    tech.building_classification?.trim() ||
    data.building_plan.occupancy_classification?.trim();
  if (explicit) {
    if (/^GROUP\s+/i.test(explicit)) return explicit.toUpperCase().replace(/^GROUP\s+/i, 'GROUP ');
    if (/^[A-Z]-\d$/i.test(explicit) || /^[A-Z]$/i.test(explicit)) {
      return `GROUP ${explicit.toUpperCase()}`;
    }
    return explicit;
  }
  const activity = ACTIVITY_RULES[client.activity_type || ''];
  const occupancy = activity ? SBC_OCCUPANCIES[activity.occupancy] : null;
  if (occupancy?.group_letter) {
    return `GROUP ${occupancy.group_letter}`;
  }
  return '—';
}

export function resolveFacilityLocation(client: ClientRecord): string {
  const district = (client.district || '').trim();
  const city = (client.city || '').trim();
  if (district && city) return `${district} - ${city}`;
  if (district) return district;
  if (city) return city;
  const fallback = [client.street, client.national_address].filter(Boolean).join(' — ');
  return fallback || '—';
}

export function resolveTotalAreaM2(client: ClientRecord, data: ProjectEngineeringData): string {
  const area =
    client.building_area ??
    client.land_area ??
    data.building_plan.total_site_area_m2 ??
    null;
  if (area == null || area === '') return '—';
  const n = Number(area);
  if (!Number.isFinite(n)) return String(area);
  return String(Math.round(n * 100) / 100);
}

export function seedCdCoverLetter(
  client: ClientRecord,
  data: ProjectEngineeringData,
  existing?: CdCoverLetterReport | null
): CdCoverLetterReport {
  const today = new Date().toISOString().slice(0, 10);
  const delivery = data.engineering_delivery;
  const tech = data.technical_report;
  const letterDate = existing?.letter_date || delivery.delivery_date || today;

  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA.cd_cover_letter,
    ...existing,
    status: existing?.status || 'مسودة',
    letter_date: letterDate,
    outgoing_number:
      existing?.outgoing_number?.trim() ||
      delivery.outgoing_number?.trim() ||
      tech.outgoing_number?.trim() ||
      '',
    addressee: existing?.addressee?.trim() || DEFAULT_CD_ADDRESSEE,
    copy_to:
      existing?.copy_to?.trim() ||
      (delivery.civil_defense_city
        ? `صورة لمركز السلامة الميدانية — ${delivery.civil_defense_city}`
        : ''),
    building_status: normalizeBuildingStatus(
      existing?.building_status || tech.building_status || client.project_status
    ),
    manager_name:
      existing?.manager_name?.trim() ||
      delivery.manager_name?.trim() ||
      tech.executive_director_name?.trim() ||
      '',
    manager_title: existing?.manager_title?.trim() || delivery.manager_title || 'مدير المكتب',
    safety_engineer_name:
      existing?.safety_engineer_name?.trim() ||
      delivery.safety_engineer_name?.trim() ||
      tech.safety_engineer_name?.trim() ||
      client.assigned_engineer ||
      '',
    safety_engineer_title:
      existing?.safety_engineer_title?.trim() ||
      delivery.safety_engineer_title ||
      'مهندس سلامة معتمد',
  };
}

export function buildCdCoverLetterSnapshot(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
  letter?: CdCoverLetterReport | null;
}): CdCoverLetterSnapshot {
  const { client, data } = params;
  const letter = seedCdCoverLetter(client, data, params.letter || data.cd_cover_letter);
  const letterDateIso = letter.letter_date || new Date().toISOString().slice(0, 10);

  return {
    outgoingNumber: letter.outgoing_number?.trim() || '—',
    letterDateIso,
    gregorianDate: formatGregorianDate(letterDateIso).replace(/\s*م\s*$/u, '').trim(),
    hijriDate: formatHijriDate(letterDateIso),
    addressee: letter.addressee || DEFAULT_CD_ADDRESSEE,
    copyTo: letter.copy_to || '',
    projectName: client.business_name || client.name || '—',
    location: resolveFacilityLocation(client),
    ownerName: client.owner_name || client.name || '—',
    totalAreaM2: resolveTotalAreaM2(client, data),
    occupancyCode: resolveOccupancyCode(client, data),
    buildingStatus: normalizeBuildingStatus(letter.building_status),
    managerName: letter.manager_name || '—',
    managerTitle: letter.manager_title || 'مدير المكتب',
    engineerName: letter.safety_engineer_name || '—',
    engineerTitle: letter.safety_engineer_title || 'مهندس سلامة معتمد',
  };
}
