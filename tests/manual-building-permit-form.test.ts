import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calcBuildingArea, calcFloorsCount } from '@/lib/business/floors';
import { getCities, getDistricts, getRegions, getStreets, isValidLocation } from '@/lib/data/saudi-location-provider';
import { mergeBuildingPlanDefaults } from '@/lib/projects/building-plan';

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
    expect(modal).toContain('القيمة القديمة:');
    expect(modal).toContain('disabled\n                    className="w-full p-2.5 border rounded-xl text-sm bg-gray-100 text-gray-500"');
    expect(modal).not.toContain('setStreet(\'\');\n                    }}\n                    className="w-full p-2.5 border rounded-xl text-sm"');
    expect(modal).toContain('street: street.trim() || null');
  });

  it('keeps coordinates and permit fields in the existing building plan model', () => {
    const plan = mergeBuildingPlanDefaults({
      northing: '2391979.9527',
      easting: '513415.8874',
      licensed_floor_count: 2,
      plan_number: '491/3',
      municipality: 'بلدية الاختبار',
    });
    expect(plan.northing).toBe('2391979.9527');
    expect(plan.easting).toBe('513415.8874');
    expect(plan.licensed_floor_count).toBe(2);
    expect(plan.plan_number).toBe('491/3');
    expect(plan.municipality).toBe('بلدية الاختبار');
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
  });
});
