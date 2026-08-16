import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calcBuildingArea, calcFloorsCount } from '@/lib/business/floors';
import { getCities, getDistricts, getRegions, getStreets, isValidLocation } from '@/lib/data/saudi-location-provider';
import { mergeBuildingPlanDefaults } from '@/lib/projects/building-plan';
import { formatHijriParts, hijriToGregorian, parseHijriParts } from '@/lib/date/hijri';
import { deriveActivityRequirements } from '@/lib/business/sbc-requirements';

const root = resolve(__dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

describe('manual building permit form', () => {
  it('exposes all 13 Saudi regions and filters known cities and districts', () => {
    expect(getRegions()).toHaveLength(13);
    expect(getRegions()).toContain('مكة المكرمة');
    expect(getRegions()).toContain('الحدود الشمالية');
    expect(getCities('مكة المكرمة')).toContain('جدة');
    expect(getCities('الرياض')).not.toContain('جدة');
    expect(getDistricts('مكة المكرمة', 'جدة')).toContain('الصفا');
    expect(getDistricts('الرياض', 'الرياض')).not.toContain('الصفا');
  });

  it('rejects known invalid combinations and does not invent streets', () => {
    expect(isValidLocation('مكة المكرمة', 'الرياض', 'الصفا')).toBe(false);
    expect(isValidLocation('مكة المكرمة', 'جدة', 'العليا')).toBe(false);
    expect(getStreets('مكة المكرمة', 'جدة', 'الصفا')).toEqual([]);
  });

  it('models unsupported region and city availability without fabricated options', () => {
    expect(getCities('المدينة المنورة')).toEqual([]);
    expect(getDistricts('المدينة المنورة', 'مدينة غير مربوطة')).toEqual([]);
    expect(getCities('المدينة المنورة')).not.toContain('جدة');
    expect(getDistricts('المدينة المنورة', 'مدينة غير مربوطة')).not.toContain('الصفا');
  });

  it('keeps street unavailable without making it part of save validation', () => {
    expect(getStreets('الرياض', 'مدينة غير مربوطة', 'حي غير مربوط')).toEqual([]);
    expect(isValidLocation('المدينة المنورة', 'مدينة قديمة', 'حي قديم')).toBe(true);
  });

  it('renders explicit unsupported-location UX and preserves legacy display values', () => {
    const modal = read('components/clients/ClientDetailModal.tsx');
    expect(modal).toContain('بيانات المدن لهذه المنطقة لم تُربط بعد بمصدر موثوق.');
    expect(modal).toContain('بيانات الأحياء لهذه المدينة لم تُربط بعد بمصدر موثوق.');
    expect(modal).toContain('بيانات الشوارع غير متاحة حاليًا من مصدر موثوق.');
    expect(modal).toContain('option value="أخرى">أخرى</option>');
    expect(modal).toContain('placeholder="اسم المدينة"');
    expect(modal).toContain('placeholder="اسم الحي"');
    expect(modal).toContain('placeholder="أدخل اسم الشارع"');
    expect(modal).toContain('street: street.trim() || null');
    expect(modal).toContain('setManualCity(\'\');');
    expect(modal).toContain('setManualDistrict(\'\');');
  });

  it('converts known Hijri dates and rejects invalid dates without inventing Gregorian values', () => {
    expect(parseHijriParts('1/1/1445')).toEqual({ day: 1, month: 1, year: 1445 });
    expect(formatHijriParts({ day: 1, month: 1, year: 1445 })).toBe('1/1/1445');
    expect(hijriToGregorian({ day: 1, month: 1, year: 1445 })).toBe('2023-07-19');
    expect(hijriToGregorian({ day: 31, month: 1, year: 1445 })).toBeNull();
  });

  it('passes electrical rooms count through the existing Rule Engine context', () => {
    const result = deriveActivityRequirements({ activity_type: 'restaurant', electrical_rooms_count: 3 });
    expect(result?.electricalRoomsCount).toBe(3);
    expect(result?.requirements.some((item) => item.id === 'electrical-rooms')).toBe(false);
  });

  it('keeps coordinates and permit fields in the existing building plan model', () => {
    const plan = mergeBuildingPlanDefaults({
      northing: '2391979.9527',
      easting: '513415.8874',
      licensed_floor_count: 2,
      plan_number: '491/3',
      municipality: 'بلدية الاختبار',
      electrical_rooms_count: 2,
      manual_city: 'مدينة يدوية',
      manual_district: 'حي يدوي',
    });
    expect(plan.northing).toBe('2391979.9527');
    expect(plan.easting).toBe('513415.8874');
    expect(plan.licensed_floor_count).toBe(2);
    expect(plan.plan_number).toBe('491/3');
    expect(plan.municipality).toBe('بلدية الاختبار');
    expect(plan.electrical_rooms_count).toBe(2);
    expect(plan.manual_city).toBe('مدينة يدوية');
    expect(plan.manual_district).toBe('حي يدوي');
  });

  it('calculates total building area while keeping licensed floor count independent', () => {
    const levels = [
      { id: 'basement', kind: 'basement' as const, label: 'بدروم', area_m2: 100, repeat_count: 1 },
      { id: 'ground', kind: 'ground' as const, label: 'أرضي', area_m2: 200, repeat_count: 1 },
      { id: 'typical', kind: 'typical' as const, label: 'متكرر', area_m2: 150, repeat_count: 2 },
    ];
    expect(calcBuildingArea(levels)).toBe(600);
    expect(calcFloorsCount(levels)).toBe(4);
    const licensedFloorCount = 2;
    expect(licensedFloorCount).not.toBe(calcFloorsCount(levels));
  });

  it('keeps the requested page order and manual-only attachment flow', () => {
    const modal = read('components/clients/ClientDetailModal.tsx');
    const upload = read('components/sales/QuotationDocumentsUpload.tsx');
    const floorEditor = read('components/clients/FloorLevelsEditor.tsx');
    const attachments = modal.indexOf('المرفقات والمستندات');
    const location = modal.indexOf('بيانات الموقع والعنوان');
    const activity = modal.indexOf('بيانات النشاط والمبنى');
    const floors = modal.indexOf('<FloorLevelsEditor');
    const requirements = modal.indexOf('اشتراطات مرتبطة بالخيارات');

    expect(attachments).toBeGreaterThan(-1);
    expect(location).toBeGreaterThan(attachments);
    expect(activity).toBeGreaterThan(location);
    expect(floors).toBeGreaterThan(activity);
    expect(requirements).toBeGreaterThan(floors);
    expect(upload).not.toContain('extractBuildingPermitFromFile');
    expect(upload).not.toContain('building-permit-ocr');
    expect(floorEditor).toContain('activity_type');
    expect(floorEditor).toContain('floor_use');
    const rules = read('components/clients/ActivityRequirementsPanel.tsx');
    expect(rules).toContain('electricalRoomsCount');
    expect(rules).toContain('electrical_rooms_count');
  });
});
