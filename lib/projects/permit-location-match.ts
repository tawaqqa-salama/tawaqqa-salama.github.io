import { REGION_DATA } from '@/lib/constants/clients';

export type MatchedLocation = {
  region?: string;
  city?: string;
  district?: string;
};

function normalizePlace(value: string): string {
  return String(value || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function fuzzyIncludes(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * Match OCR city/district against REGION_DATA so selects can hydrate.
 * Falls back to keeping the OCR district even if not in the catalog.
 */
export function matchPermitLocation(input: {
  city?: string | null;
  district?: string | null;
  municipality?: string | null;
  locationSummary?: string | null;
}): MatchedLocation {
  const cityHint = normalizePlace(
    [input.city, input.municipality, input.locationSummary].filter(Boolean).join(' ')
  );
  const districtHint = normalizePlace(input.district || '');

  let best: MatchedLocation = {};
  let bestScore = 0;

  for (const [region, cities] of Object.entries(REGION_DATA)) {
    for (const [city, districts] of Object.entries(cities)) {
      const cityNorm = normalizePlace(city);
      let score = 0;
      if (cityHint && fuzzyIncludes(cityHint, cityNorm)) score += 3;
      // Municipality hints: ابحر → جدة, أمانة جدة → جدة
      if (cityNorm === 'جده' && /جده|ابحر|ابحر/.test(cityHint)) score += 3;

      let matchedDistrict: string | undefined;
      for (const d of districts) {
        const dNorm = normalizePlace(d);
        if (districtHint && fuzzyIncludes(districtHint, dNorm)) {
          score += 4;
          matchedDistrict = d;
          break;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = {
          region,
          city,
          district: matchedDistrict || (input.district?.trim() || undefined),
        };
      }
    }
  }

  if (bestScore === 0) {
    return {
      city: input.city?.trim() || undefined,
      district: input.district?.trim() || undefined,
    };
  }

  // Keep OCR district text when catalog has no exact match
  if (!best.district && input.district?.trim()) {
    best.district = input.district.trim();
  }
  return best;
}
