import { ACTIVITY_RULES } from '@/lib/constants/clients';
import type { ClientFormData, FloorLevel } from '@/lib/types/client';
import { calcBuildingArea, calcFloorsCount, normalizeFloorLevels } from '@/lib/business/floors';
import {
  parseLocalizedInteger,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  sanitizeTextOnly,
} from '@/lib/validation/numeric-input';

export {
  normalizeToAsciiDigits,
  parseLocalizedInteger,
  parseLocalizedNumber,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
  sanitizeTextOnly,
} from '@/lib/validation/numeric-input';

/** @deprecated Use sanitizeIntegerInput */
export const sanitizeNumbersOnly = sanitizeIntegerInput;

/** @deprecated Use sanitizeDecimalInput */
export const sanitizeDecimal = sanitizeDecimalInput;

export function validateFloorLevels(levels: FloorLevel[]): string | null {
  const normalized = normalizeFloorLevels(levels);
  if (normalized.length === 0) {
    return 'أضف تفصيل الأدوار (مساحة كل دور وعدد التكرار للمتكرر).';
  }

  for (const level of normalized) {
    if (!level.label.trim()) {
      return 'كل مستوى دور يحتاج اسماً/تسمية.';
    }
    if (!(level.area_m2 > 0)) {
      return `مساحة الدور «${level.label}» يجب أن تكون أكبر من صفر.`;
    }
    if (!(level.repeat_count >= 1)) {
      return `عدد التكرار لـ «${level.label}» يجب ألا يقل عن 1.`;
    }
  }

  return null;
}

export function validateActivityConstraints(input: {
  activity_type?: string | null;
  land_area: number;
  floors_count: number;
}): string | null {
  const activity = input.activity_type || '';
  if (!activity || !ACTIVITY_RULES[activity]) return null;
  const rule = ACTIVITY_RULES[activity];

  if (input.land_area < rule.minLandArea) {
    return `حسب الاشتراطات البلدية: مساحة الأرض لنشاط (${rule.label}) لا يمكن أن تقل عن ${rule.minLandArea} متر مربع.`;
  }

  if (input.floors_count > rule.maxFloors) {
    return `حسب الاشتراطات البلدية: عدد الأدوار المسموح لنشاط (${rule.label}) لا يتجاوز ${rule.maxFloors} أدوار.`;
  }

  return null;
}

export function validateClientForm(formData: ClientFormData): string | null {
  const phone = sanitizeIntegerInput(formData.phone);

  if (!/^05\d{8}$/.test(phone)) {
    return 'رقم الجوال غير صحيح. يجب أن يبدأ بـ 05 ويتكون من 10 أرقام.';
  }

  const landArea = parseLocalizedInteger(formData.land_area);
  const levels = normalizeFloorLevels(formData.floor_levels);
  const floorsFromLevels = levels.length > 0 ? calcFloorsCount(levels) : parseLocalizedInteger(formData.floors_count);
  const buildingFromLevels = levels.length > 0 ? calcBuildingArea(levels) : parseLocalizedInteger(formData.building_area);

  if (levels.length > 0) {
    const floorsError = validateFloorLevels(levels);
    if (floorsError) return floorsError;
  }

  if (buildingFromLevels <= 0 && parseLocalizedInteger(formData.building_area) <= 0) {
    return 'أدخل مساحة المبنى أو مساحات الأدوار.';
  }

  return validateActivityConstraints({
    activity_type: formData.activity_type,
    land_area: landArea,
    floors_count: floorsFromLevels,
  });
}
