/**
 * EXISTING final technical report — presentation-only formatters.
 * Source data in project_engineering_live is unchanged; these helpers shape
 * table display values and renderer hints only.
 */

import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export const EXISTING_REPORT_MAPS_LINK_LABEL = 'رابط الموقع على Google Maps';
export const EXISTING_REPORT_MAPS_UNREGISTERED = 'غير مسجل';

export const EXISTING_REPORT_MAPS_ROW_LABELS = new Set([
  'رابط Google Maps',
  'رابط الخريطة',
  'رابط الموقع على Google Maps',
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
