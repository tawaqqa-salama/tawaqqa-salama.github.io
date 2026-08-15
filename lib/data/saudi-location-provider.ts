import { REGION_DATA } from '@/lib/constants/clients';

export type SaudiLocationData = Record<string, Record<string, string[]>>;

/**
 * Central location provider. The repository currently has trusted region/city/district
 * coverage only for the entries in REGION_DATA; streets intentionally remain empty
 * until a verified source is connected.
 */
export const SAUDI_LOCATION_DATA: SaudiLocationData = REGION_DATA;

export function getRegions(): string[] {
  return Object.keys(SAUDI_LOCATION_DATA);
}

export function getCities(region: string): string[] {
  return region && SAUDI_LOCATION_DATA[region] ? Object.keys(SAUDI_LOCATION_DATA[region]) : [];
}

export function getDistricts(region: string, city: string): string[] {
  return region && city && SAUDI_LOCATION_DATA[region]?.[city]
    ? SAUDI_LOCATION_DATA[region][city]
    : [];
}

export function getStreets(_region: string, _city: string, _district: string): string[] {
  // No verified street dataset is currently bundled. Do not fabricate names.
  return [];
}

export function isValidLocation(region: string, city: string, district: string): boolean {
  if (!region || !city || !district) return false;
  const cities = getCities(region);
  if (cities.length > 0 && !cities.includes(city)) return false;
  const districts = getDistricts(region, city);
  return districts.length === 0 || districts.includes(district);
}
