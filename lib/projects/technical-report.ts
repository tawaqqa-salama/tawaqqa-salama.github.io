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
  type TechnicalReportComponentRow,
  type TechnicalReportSectionItem,
} from '@/lib/types/project-reports';
import { ensureFloorLevels, labelForFloorKind } from '@/lib/business/floors';

function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

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

function componentsFromClient(client: ClientRecord, existing: TechnicalReportComponentRow[]): TechnicalReportComponentRow[] {
  if (existing.length > 0) return existing;
  const floors = ensureFloorLevels(client.floor_levels, client.floors_count, client.building_area);
  if (floors.length === 0) {
    return [
      {
        id: newId('comp'),
        part_name: 'الأرضي',
        structure: 'خرسانة + بلوك',
        classification: 'TYPE I A',
        area_m2: client.building_area ? String(client.building_area) : '',
      },
    ];
  }
  return floors.map((floor) => ({
    id: floor.id || newId('comp'),
    part_name: floor.label || labelForFloorKind(floor.kind),
    structure: 'خرسانة + بلوك',
    classification: 'TYPE I A',
    area_m2: floor.area_m2 ? String(floor.area_m2) : '',
  }));
}

function locationSummary(client: ClientRecord): string {
  return [client.district, client.city, client.region, client.street, client.national_address]
    .filter(Boolean)
    .join(' — ');
}

function defaultOverview(client: ClientRecord): string {
  const activity = ACTIVITY_RULES[client.activity_type || '']?.label || client.activity_type || 'المنشأة';
  const owner = client.owner_name || client.name || 'المالك';
  const place = [client.district, client.city].filter(Boolean).join('، ') || 'الموقع المحدد';
  return `يتناول هذا التقرير أنظمة السلامة والوقاية من الحريق لمشروع (${client.business_name || client.name || 'المنشأة'}) بنشاط ${activity}، العائد لـ ${owner}، والواقع في ${place}. ويهدف إلى بيان الاشتراطات والتوصيات وفق كود البناء السعودي والأنظمة ذات العلاقة.`;
}

/** يدمج التقرير المحفوظ مع القيم الافتراضية وبيانات التسويق/المبيعات */
export function seedTechnicalReportFromClient(
  client: ClientRecord,
  existing?: TechnicalReport | null
): TechnicalReport {
  const base = { ...EMPTY_TECHNICAL_REPORT, ...existing };
  return {
    ...base,
    report_date: base.report_date || new Date().toISOString().slice(0, 10),
    overview_text: base.overview_text || defaultOverview(client),
    location_description: base.location_description || locationSummary(client),
    floors_description:
      base.floors_description ||
      ensureFloorLevels(client.floor_levels, client.floors_count, client.building_area)
        .map((f) => f.label || labelForFloorKind(f.kind))
        .join(' + '),
    building_status: base.building_status || client.project_status || 'تحت الإنشاء',
    components: componentsFromClient(client, base.components || []),
    firefighting_items: buildItemsForChapter('firefighting', base.firefighting_items || []),
    ventilation_items: buildItemsForChapter('ventilation', base.ventilation_items || []),
    alarm_items: buildItemsForChapter('alarm', base.alarm_items || []),
    exits_items: buildItemsForChapter('exits', base.exits_items || []),
    general_recommendations:
      base.general_recommendations?.length > 0
        ? base.general_recommendations
        : TECH_REPORT_GENERAL_RECOMMENDATIONS.map((item) => ({ id: item.id, checked: false })),
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
  };
}
