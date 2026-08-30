/**
 * EXISTING final technical report — presentation-only formatters.
 * Source data in project_engineering_live is unchanged; these helpers shape
 * table display values and renderer hints only.
 */

import {
  EXISTING_ASSESSMENT_STATUS_LABELS,
  type ExistingAssessmentComplianceStatus,
} from '@/lib/projects/existing-project-assessment';
import {
  alarmSummaryTable,
  pumpSummaryTable,
  sprinklerSummaryTable,
} from '@/lib/projects/existing-report-engineering-tables';
import type {
  ExistingTechnicalReportCivilDefenseAccess,
  ExistingTechnicalReportComponentRow,
  ExistingTechnicalReportSiteProfile,
} from '@/lib/projects/existing-technical-report-profile';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export const EXISTING_REPORT_MAPS_LINK_LABEL = 'رابط الموقع على Google Maps';
export const EXISTING_REPORT_SITE_MAPS_LINK_LABEL = 'عرض الموقع على Google Maps';
export const EXISTING_REPORT_MAPS_UNREGISTERED = 'غير مسجل';

export const EXISTING_REPORT_MAPS_ROW_LABELS = new Set([
  'رابط Google Maps',
  'رابط الخريطة',
  'رابط الموقع على Google Maps',
  'عرض الموقع على Google Maps',
]);

function cleanText(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result || null;
}

function parseCoordinateNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isGeographicLatLng(lat: string, lng: string): boolean {
  const latN = parseCoordinateNumber(lat);
  const lngN = parseCoordinateNumber(lng);
  if (latN == null || lngN == null) return false;
  return Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;
}

export function isExistingReportExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function isExistingReportMapsTableLabel(label: string): boolean {
  return EXISTING_REPORT_MAPS_ROW_LABELS.has(label.trim());
}

export function formatExistingReportMapsTableRow(url: string | null | undefined): { label: string; value: string } {
  const href = cleanText(url);
  return {
    label: EXISTING_REPORT_MAPS_LINK_LABEL,
    value: href || EXISTING_REPORT_MAPS_UNREGISTERED,
  };
}

export type ExistingReportCoordinatePresentationRow = { label: string; value: string };

function compactCoordinateRows(rows: ExistingReportCoordinatePresentationRow[]): ExistingReportCoordinatePresentationRow[] {
  if (rows.length <= 1) return rows;
  const lat = rows.find((row) => row.label === 'Latitude');
  const lng = rows.find((row) => row.label === 'Longitude');
  if (lat && lng) {
    return [{ label: 'الإحداثيات الجغرافية', value: `Latitude: ${lat.value}\nLongitude: ${lng.value}` }];
  }
  const easting = rows.find((row) => row.label === 'Easting');
  const northing = rows.find((row) => row.label === 'Northing');
  const zone = rows.find((row) => row.label === 'UTM Zone');
  if (easting && northing) {
    return [{
      label: zone ? 'إحداثيات UTM' : 'الإحداثيات المسجلة',
      value: [zone ? `UTM Zone: ${zone.value}` : null, `Easting: ${easting.value}`, `Northing: ${northing.value}`].filter(Boolean).join('\n'),
    }];
  }
  return rows;
}

export function buildExistingReportCoordinatePresentationRows(
  data: Pick<ProjectEngineeringData, 'technical_report' | 'building_plan'>,
  options: { compact?: boolean } = {}
): ExistingReportCoordinatePresentationRow[] {
  const technical = data.technical_report;
  const plan = data.building_plan;
  const lat = cleanText(technical.gps_lat);
  const lng = cleanText(technical.gps_lng);
  const northing = cleanText(plan.northing);
  const easting = cleanText(plan.easting);
  const system = cleanText((technical as { coordinate_system?: string }).coordinate_system)
    || cleanText((plan as { coordinate_system?: string }).coordinate_system);
  const utmZone = cleanText((technical as { utm_zone?: string }).utm_zone)
    || cleanText((plan as { utm_zone?: string }).utm_zone);

  if (system) {
    const rows: ExistingReportCoordinatePresentationRow[] = [{ label: 'نظام الإحداثيات', value: system }];
    if (utmZone) rows.push({ label: 'UTM Zone', value: utmZone });
    if (easting) rows.push({ label: 'Easting', value: easting });
    if (northing) rows.push({ label: 'Northing', value: northing });
    if (lat) rows.push({ label: 'Latitude', value: lat });
    if (lng) rows.push({ label: 'Longitude', value: lng });
    if (rows.length > 1) return options.compact ? compactCoordinateRows(rows) : rows;
  }

  if (lat && lng && isGeographicLatLng(lat, lng)) {
    const rows = [
      { label: 'Latitude', value: lat },
      { label: 'Longitude', value: lng },
    ];
    return options.compact ? compactCoordinateRows(rows) : rows;
  }

  if (northing && easting) {
    const rows: ExistingReportCoordinatePresentationRow[] = [
      { label: 'Easting', value: easting },
      { label: 'Northing', value: northing },
    ];
    if (utmZone) rows.push({ label: 'UTM Zone', value: utmZone });
    return options.compact ? compactCoordinateRows(rows) : rows;
  }

  const registered = lat && lng ? `${lat} ، ${lng}` : [lat, lng].filter(Boolean).join(' ، ');
  if (!registered) return [];
  return [{ label: 'الإحداثيات المسجلة', value: registered }];
}

export function foldArabicPdfText(value: string): string {
  return value
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[\s\u00A0،,:.;]+/g, '')
    .replace(/[يى]/g, 'ي');
}

export type ExistingReportPresentationStatus =
  | ExistingAssessmentComplianceStatus
  | 'INCOMPLETE';

export type ExistingReportAssessmentInput = {
  system_label: string;
  existing_condition: string | null;
  notes: string | null;
  required_condition: string | null;
  gap: string | null;
  required_action: string | null;
  requirement_reference: string | null;
  evidence: Array<{ id: string }>;
  compliance_status: ExistingReportPresentationStatus;
};

export type ExistingReportPresentationBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'subsection'; title: string }
  | { type: 'maps_link'; href: string | null; label: string }
  | { type: 'coordinates'; text: string }
  | { type: 'narrative_field'; label: string; text: string }
  | { type: 'status_badge'; status: ExistingReportPresentationStatus; label: string }
  | { type: 'numbered_list'; items: string[] }
  | { type: 'reference_list'; items: string[] }
  | {
      type: 'engineering_narrative_item';
      title: string;
      status?: ExistingReportPresentationStatus;
      paragraphs: string[];
    }
  | { type: 'table'; caption: string; headers: string[]; rows: string[][] };

const INCOMPLETE_STATUS_LABEL = 'لم يكتمل تقييم هذا البند.';

function displayOrEmpty(value: string | null | undefined, fallback: string): string {
  return cleanText(value) || fallback;
}

function joinArabicList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} و${items[1]}`;
  return `${items.slice(0, -1).join('، ')}، و${items[items.length - 1]}`;
}

export function buildSiteIntroNarrative(
  site: Pick<ExistingTechnicalReportSiteProfile, 'location_text' | 'district' | 'city' | 'street' | 'registered_address'>,
  location: string | null
): string {
  if (cleanText(site.location_text)) return site.location_text!.trim();
  const district = cleanText(site.district);
  const city = cleanText(site.city);
  const street = cleanText(site.street);
  const address = cleanText(location) || cleanText(site.registered_address);
  const localityParts = [district ? `حي ${district}` : null, city ? `مدينة ${city}` : null].filter((item): item is string => Boolean(item));
  if (localityParts.length && street) {
    return `يقع المشروع في ${joinArabicList(localityParts)} على ${street}.`;
  }
  if (localityParts.length) {
    return `يقع المشروع في ${joinArabicList(localityParts)}.`;
  }
  if (street) return `يقع المشروع على ${street}.`;
  if (address) return `يقع المشروع في ${address}.`;
  return 'يُعرض في هذه الصفحة العنوان المسجل وبيانات الموقع كما وردت في ملف المشروع دون استنتاج موقع جديد.';
}

export function buildSiteBoundariesNarrative(
  site: Pick<ExistingTechnicalReportSiteProfile, 'surroundings' | 'surrounding_roads'>
): string | null {
  const surroundings = site.surroundings;
  const boundaryParts = [
    cleanText(surroundings?.north) ? `من جهة الشمال ${surroundings!.north!.trim()}` : null,
    cleanText(surroundings?.south) ? `من جهة الجنوب ${surroundings!.south!.trim()}` : null,
    cleanText(surroundings?.east) ? `من جهة الشرق ${surroundings!.east!.trim()}` : null,
    cleanText(surroundings?.west) ? `من جهة الغرب ${surroundings!.west!.trim()}` : null,
  ].filter((item): item is string => Boolean(item));
  if (boundaryParts.length) {
    return `يحد الموقع ${joinArabicList(boundaryParts)}.`;
  }
  const roads = cleanText(site.surrounding_roads);
  if (roads) return roads.endsWith('.') ? roads : `${roads}.`;
  return null;
}

export function buildSiteCoordinatesLine(
  coordinateRows: ExistingReportCoordinatePresentationRow[]
): string | null {
  if (!coordinateRows.length) return null;
  const compact = coordinateRows.length === 1 ? coordinateRows[0] : null;
  if (compact?.label === 'الإحداثيات المسجلة' || compact?.label === 'إحداثيات UTM') {
    return compact.label === 'إحداثيات UTM'
      ? compact.value.replace(/\n/g, ' | ')
      : `الإحداثيات المسجلة: ${compact.value}`;
  }
  const easting = coordinateRows.find((row) => row.label === 'Easting');
  const northing = coordinateRows.find((row) => row.label === 'Northing');
  const zone = coordinateRows.find((row) => row.label === 'UTM Zone');
  const lat = coordinateRows.find((row) => row.label === 'Latitude');
  const lng = coordinateRows.find((row) => row.label === 'Longitude');
  if (easting && northing) {
    const parts = [
      zone ? `UTM Zone: ${zone.value}` : null,
      `Easting: ${easting.value}`,
      `Northing: ${northing.value}`,
    ].filter(Boolean);
    return `الإحداثيات المسجلة: ${parts.join(' | ')}`;
  }
  if (lat && lng) {
    return `الإحداثيات المسجلة: Latitude: ${lat.value} | Longitude: ${lng.value}`;
  }
  if (compact) return `${compact.label}: ${compact.value}`;
  return null;
}

export function buildSitePresentationBlocks(
  site: ExistingTechnicalReportSiteProfile,
  location: string | null
): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [
    { type: 'paragraph', text: buildSiteIntroNarrative(site, location) },
  ];
  const boundaries = buildSiteBoundariesNarrative(site);
  if (boundaries) {
    blocks.push({ type: 'subsection', title: 'حدود الموقع' });
    blocks.push({ type: 'paragraph', text: boundaries });
  }
  const coordinatesLine = buildSiteCoordinatesLine(site.coordinate_rows);
  if (coordinatesLine) blocks.push({ type: 'coordinates', text: coordinatesLine });
  blocks.push({
    type: 'maps_link',
    href: cleanText(site.maps_url),
    label: EXISTING_REPORT_SITE_MAPS_LINK_LABEL,
  });
  return blocks;
}

export function buildCivilDefenseAccessNarrative(
  cd: ExistingTechnicalReportCivilDefenseAccess
): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [];
  const distance = cleanText(cd.distance);
  const travelTime = cleanText(cd.travel_time);
  const center = cleanText(cd.center_name);
  const intro = 'تمت دراسة إمكانية وصول آليات الدفاع المدني إلى الموقع وفق البيانات المسجلة بالمشروع.';
  if (center || distance || travelTime) {
    const detailParts = [
      center ? `يقع أقرب مركز دفاع مدني${center.startsWith('مركز') ? '' : ''} ${center}` : null,
      distance ? `على مسافة تقريبية قدرها ${distance}` : null,
      travelTime ? `ويستغرق الوصول إلى الموقع حوالي ${travelTime} وفق مسار الوصول المرفق` : null,
    ].filter(Boolean);
    blocks.push({
      type: 'paragraph',
      text: `${intro} ${detailParts.join('، ')}.`,
    });
  } else {
    blocks.push({
      type: 'paragraph',
      text: 'تُعرض بيانات الوصول كما سجلها المهندس أو كما وردت في الأدلة المرفقة. لا يحسب التقرير مسافة أو زمن وصول تلقائيًا.',
    });
  }
  const route = cleanText(cd.route_description);
  if (route) {
    blocks.push({ type: 'subsection', title: 'مسار الوصول' });
    blocks.push({ type: 'paragraph', text: route });
  }
  const source = cleanText(cd.source_label);
  const verified = cleanText(cd.verified_at);
  const meta = [source ? `مصدر البيانات: ${source}` : null, verified ? `تاريخ التحقق: ${verified}` : null]
    .filter(Boolean)
    .join(' — ');
  if (meta) blocks.push({ type: 'paragraph', text: meta });
  return blocks;
}

export function buildProjectComponentsNarrative(
  components: ExistingTechnicalReportComponentRow[]
): string | null {
  if (!components.length) return null;
  const parts = components.map((item) => {
    const use = cleanText(item.use);
    return use ? `${item.name} يستخدم ك${use}` : item.name;
  });
  return `يتكون المشروع من ${joinArabicList(parts)}، وذلك وفق بيانات المشروع المسجلة أعلاه.`;
}


type EngineeringRow = { label: string; value: string };

export function buildEngineeringReferencePresentationBlocks(
  sections: Array<{ label: string; rows: EngineeringRow[] }>,
  excludeCaptions: ReadonlySet<string> = new Set()
): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [];
  for (const section of sections) {
    if (section.label.includes('مضخات')) {
      if (excludeCaptions.has('مضخات الحريق')) continue;
      const summary = pumpSummaryTable(section.rows);
      if (summary) {
        blocks.push(summary);
        continue;
      }
    }
    if (section.label.includes('الرش')) {
      if (excludeCaptions.has('نظام الرش الآلي')) continue;
      const summary = sprinklerSummaryTable(section.rows);
      if (summary) {
        blocks.push(summary);
        continue;
      }
    }
    if (section.label.includes('إنذار')) {
      if (excludeCaptions.has('ملخص نظام الإنذار')) {
        const remainder = section.rows.filter((row) => !['عدد لوحات الإنذار', 'كواشف الدخان', 'كواشف الحرارة', 'أجهزة التنبيه'].includes(row.label));
        if (remainder.length) {
          blocks.push({
            type: 'table',
            caption: section.label,
            headers: ['البند', 'البيان'],
            rows: remainder.map((row) => [row.label, row.value]),
          });
        }
        continue;
      }
      const summary = alarmSummaryTable(section.rows);
      if (summary) {
        blocks.push(summary);
        const remainder = section.rows.filter((row) => !['عدد لوحات الإنذار', 'كواشف الدخان', 'كواشف الحرارة', 'أجهزة التنبيه'].includes(row.label));
        if (remainder.length) {
          blocks.push({
            type: 'table',
            caption: section.label,
            headers: ['البند', 'البيان'],
            rows: remainder.map((row) => [row.label, row.value]),
          });
        }
        continue;
      }
    }
    if (section.label.includes('إخلاء') && excludeCaptions.has('مقاييس الإخلاء')) continue;
    if (section.label.includes('خزان') && excludeCaptions.has('إمداد مياه الإطفاء والخزان')) continue;
    blocks.push({
      type: 'table',
      caption: section.label,
      headers: ['البند', 'البيان'],
      rows: section.rows.map((row) => [row.label, row.value]),
    });
  }
  if (!blocks.length) {
    return [{
      type: 'paragraph',
      text: 'تم عرض القيم الهندسية المرجعية المتاحة ضمن أقسام الأنظمة ذات الصلة أعلاه، ولا توجد بيانات إضافية غير مكررة لعرضها هنا.',
    }];
  }
  return blocks;
}

export function buildEngineeringPresentationBlocks(
  sections: Array<{ label: string; rows: EngineeringRow[] }>
): ExistingReportPresentationBlock[] {
  return buildEngineeringReferencePresentationBlocks(sections);
}

export function existingReportStatusBadgeClass(status: ExistingReportPresentationStatus): string {
  return {
    COMPLIANT: 'existing-report-status-badge--compliant',
    NON_COMPLIANT: 'existing-report-status-badge--non-compliant',
    NEEDS_COMPLETION: 'existing-report-status-badge--needs-completion',
    NOT_APPLICABLE: 'existing-report-status-badge--not-applicable',
    INCOMPLETE: 'existing-report-status-badge--incomplete',
  }[status];
}

export function existingReportStatusBadgeLabel(status: ExistingReportPresentationStatus): string {
  if (status === 'INCOMPLETE') return 'غير مقيم';
  return EXISTING_ASSESSMENT_STATUS_LABELS[status];
}
