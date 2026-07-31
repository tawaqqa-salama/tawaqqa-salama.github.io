import { ACTIVITY_RULES } from '@/lib/constants/clients';
import {
  TECH_REPORT_GENERAL_RECOMMENDATIONS,
  TECH_REPORT_ITEMS,
  type TechReportItemCatalog,
} from '@/lib/constants/technical-report';
import type { ClientRecord } from '@/lib/types/client';
import {
  EMPTY_TECHNICAL_REPORT,
  type TechnicalReport,
  type TechnicalReportSectionItem,
} from '@/lib/types/project-reports';
import { ensureFloorLevels, labelForFloorKind } from '@/lib/business/floors';
import {
  applyAutoClassification,
  floorsFromClient,
} from '@/lib/projects/sbc-classification';

function buildItemsForChapter(
  chapter: TechReportItemCatalog['chapter'],
  existing: TechnicalReportSectionItem[]
): TechnicalReportSectionItem[] {
  return TECH_REPORT_ITEMS.filter((item) => item.chapter === chapter).map((item) => {
    const found = existing.find((row) => row.id === item.id);
    return (
      found || {
        id: item.id,
        enabled: true,
        notes: item.defaultNotes || '',
        selectedOptions: [],
        photos: [],
      }
    );
  });
}

function locationSummary(client: ClientRecord): string {
  return [client.district, client.city, client.region, client.street, client.national_address]
    .filter(Boolean)
    .join(' — ');
}

function defaultOverview(client: ClientRecord): string {
  const activity = ACTIVITY_RULES[client.activity_type || '']?.label || client.activity_type || 'المنشأة';
  return `تقرير فني لأنظمة السلامة والوقاية من الحريق — ${client.business_name || client.name || 'المنشأة'} (${activity}).`;
}

/** يدمج التقرير المحفوظ مع القيم الافتراضية وبيانات التسويق/المبيعات */
export function seedTechnicalReportFromClient(
  client: ClientRecord,
  existing?: TechnicalReport | null
): TechnicalReport {
  const base = { ...EMPTY_TECHNICAL_REPORT, ...existing };
  const floor_uses = floorsFromClient(client, base.floor_uses);
  const withFloors: TechnicalReport = {
    ...base,
    report_date: base.report_date || new Date().toISOString().slice(0, 10),
    overview_text: base.overview_text || defaultOverview(client),
    location_description: base.location_description || locationSummary(client),
    floors_description:
      base.floors_description ||
      floor_uses.map((f) => f.floor_name).join(' + ') ||
      ensureFloorLevels(client.floor_levels, client.floors_count, client.building_area)
        .map((f) => f.label || labelForFloorKind(f.kind))
        .join(' + '),
    building_status: base.building_status || client.project_status || 'تحت الإنشاء',
    floor_uses,
    code_proof_photos: base.code_proof_photos || [],
    code_proofs_by_key: base.code_proofs_by_key || {},
    firefighting_items: buildItemsForChapter('firefighting', base.firefighting_items || []),
    ventilation_items: buildItemsForChapter('ventilation', base.ventilation_items || []),
    alarm_items: buildItemsForChapter('alarm', base.alarm_items || []),
    exits_items: buildItemsForChapter('exits', base.exits_items || []),
    general_recommendations:
      base.general_recommendations?.length > 0
        ? base.general_recommendations
        : TECH_REPORT_GENERAL_RECOMMENDATIONS.map((item) => ({ id: item.id, checked: false })),
  };

  const classified = applyAutoClassification(withFloors, client);
  return {
    ...classified,
    // لا تكتب فوق تصنيف محفوظ يدوياً إن وُجد وكان مختلفاً عن الفراغ — نعيد الحساب دائماً من المناطق
    building_classification: classified.building_classification,
    risk_class: classified.risk_class,
  };
}

export function getTechnicalReportFacilitySnapshot(client: ClientRecord) {
  return {
    business_name: client.business_name || client.name || '',
    activity_label: ACTIVITY_RULES[client.activity_type || '']?.label || client.activity_type || '',
    owner_name: client.owner_name || '',
    city: client.city || '',
    region: client.region || '',
    district: client.district || '',
    street: client.street || '',
    plot_number: client.plot_number || '',
    land_area: client.land_area != null ? String(client.land_area) : '',
    building_area: client.building_area != null ? String(client.building_area) : '',
    floors_count: client.floors_count != null ? String(client.floors_count) : '',
    national_address: client.national_address || '',
    location_summary: locationSummary(client),
    activity_type: client.activity_type || '',
  };
}
