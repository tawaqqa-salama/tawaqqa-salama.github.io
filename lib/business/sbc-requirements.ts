import { ACTIVITY_RULES } from '@/lib/constants/activity-rules';
import type { FloorLevel } from '@/lib/types/client';
import {
  RISK_LABEL_AR,
  SBC_OCCUPANCIES,
  SBC_STRUCTURE_RULES,
  type SbcOccupancyDef,
} from '@/lib/constants/sbc801';

export type RequirementSeverity = 'info' | 'required' | 'warning';

export type DerivedRequirement = {
  id: string;
  severity: RequirementSeverity;
  title: string;
  detail: string;
  refs: string[];
};

export type ActivityRequirementsResult = {
  activityKey: string;
  activityLabel: string;
  occupancy: SbcOccupancyDef;
  riskLabel: string;
  minLandArea: number;
  maxFloors: number;
  floorsCount: number;
  buildingArea: number;
  landArea: number;
  electricalRoomsCount: number;
  floorLevels: FloorLevel[];
  requirements: DerivedRequirement[];
};

export function deriveActivityRequirements(input: {
  activity_type?: string | null;
  floors_count?: number | null;
  building_area?: number | null;
  land_area?: number | null;
  electrical_rooms_count?: number | null;
  floor_levels?: FloorLevel[] | null;
}): ActivityRequirementsResult | null {
  const key = input.activity_type || '';
  const rule = ACTIVITY_RULES[key];
  if (!rule) return null;

  const occupancy = SBC_OCCUPANCIES[rule.occupancy];
  const floorsCount = Math.max(0, Math.floor(Number(input.floors_count) || 0));
  const buildingArea = Math.max(0, Number(input.building_area) || 0);
  const landArea = Math.max(0, Number(input.land_area) || 0);
  const electricalRoomsCount = Math.max(0, Math.floor(Number(input.electrical_rooms_count) || 0));
  const floorLevels = Array.isArray(input.floor_levels) ? input.floor_levels : [];
  const requirements: DerivedRequirement[] = [];

  requirements.push({
    id: 'occupancy',
    severity: 'info',
    title: `تصنيف الإشغال: ${occupancy.label_ar}`,
    detail: `أمثلة: ${occupancy.examples.slice(0, 4).join('، ')}. مستوى الخطر: ${RISK_LABEL_AR[occupancy.risk]}.`,
    refs: occupancy.sbc_refs,
  });

  requirements.push({
    id: 'land-floors',
    severity: landArea > 0 && landArea < rule.minLandArea ? 'warning' : 'info',
    title: 'حدود البلدية/المنصة للنشاط',
    detail: `أدنى مساحة أرض ${rule.minLandArea.toLocaleString('ar-SA')} م² — أقصى أدوار ${rule.maxFloors}.`,
    refs: ['PLATFORM-ACTIVITY-RULES'],
  });

  // Sprinklers
  if (occupancy.sprinkler_always) {
    requirements.push({
      id: 'sprinkler-always',
      severity: 'required',
      title: 'مرشات إطفاء تلقائية إلزامية',
      detail: 'حسب تصنيف الإشغال في SBC 801 يجب تجهيز المبنى/الإشغال بنظام مرشات تلقائية.',
      refs: ['SBC-801-SPR', ...occupancy.sbc_refs],
    });
  } else if (
    occupancy.sprinkler_fire_area_m2 != null &&
    buildingArea >= occupancy.sprinkler_fire_area_m2
  ) {
    requirements.push({
      id: 'sprinkler-area',
      severity: 'required',
      title: 'مرشات تلقائية — عتبة المساحة',
      detail: `مساحة المبنى (${buildingArea.toLocaleString('ar-SA')} م²) بلغت/تجاوزت عتبة قسم الحريق ${occupancy.sprinkler_fire_area_m2.toLocaleString('ar-SA')} م².`,
      refs: ['SBC-801-SPR'],
    });
  } else if (occupancy.sprinkler_fire_area_m2 != null) {
    requirements.push({
      id: 'sprinkler-watch',
      severity: 'info',
      title: 'مراجعة مرشات عند تجاوز المساحة',
      detail: `تُراجع إلزامية المرشات عند تجاوز ${occupancy.sprinkler_fire_area_m2.toLocaleString('ar-SA')} م² لقسم الحريق` +
        (occupancy.sprinkler_total_area_m2
          ? ` أو ${occupancy.sprinkler_total_area_m2.toLocaleString('ar-SA')} م² لمجموع الأقسام.`
          : '.'),
      refs: ['SBC-801-SPR'],
    });
  }

  if (occupancy.code === 'assembly') {
    requirements.push({
      id: 'assembly-300',
      severity: 'warning',
      title: 'تجمعات — عتبة 300 شاغل',
      detail: 'إذا تجاوز عدد الشاغلين 300 تُلزم المرشات لطابق التجمع والطوابق حتى منفذ الخروج العام.',
      refs: ['SBC-801-SPR', 'SBC-801-OCC-ASM'],
    });
  }

  // Alarm / detection
  if (occupancy.alarm_always || occupancy.detection_required) {
    requirements.push({
      id: 'alarm-always',
      severity: 'required',
      title: occupancy.detection_required ? 'نظام إنذار وكشف إلزامي' : 'نظام إنذار إلزامي',
      detail: 'مطلوب وفق تصنيف الإشغال في SBC 801.',
      refs: ['SBC-801-ALM', ...occupancy.sbc_refs],
    });
  } else if (occupancy.alarm_occupants_building || occupancy.alarm_occupants_floor) {
    const parts: string[] = [];
    if (occupancy.alarm_occupants_building) {
      parts.push(`أكثر من ${occupancy.alarm_occupants_building} شاغل في المبنى`);
    }
    if (occupancy.alarm_occupants_floor) {
      parts.push(`أو أكثر من ${occupancy.alarm_occupants_floor} في أي طابق غير الأرضي`);
    }
    requirements.push({
      id: 'alarm-threshold',
      severity: floorsCount >= 2 ? 'warning' : 'info',
      title: 'عتبات نظام الإنذار',
      detail: `يلزم الإنذار عند: ${parts.join(' ')}.`,
      refs: ['SBC-801-ALM'],
    });
  }

  if (occupancy.code === 'industrial_moderate' && floorsCount >= 2) {
    requirements.push({
      id: 'ind-alarm-floors',
      severity: 'required',
      title: 'إنذار للصناعي متعدد الأدوار',
      detail: 'الإشغالات الصناعية تتطلب نظام إنذار في المباني المؤلفة من دورين أو أكثر.',
      refs: ['SBC-801-ALM', 'SBC-801-OCC-IND-M'],
    });
  }

  // Stairs / standpipe / high-rise by floors
  if (floorsCount > SBC_STRUCTURE_RULES.stair_2h_above_floors) {
    requirements.push({
      id: 'stair-2h',
      severity: 'required',
      title: 'حماية الأدراج (ساعتان)',
      detail: `عدد الأدوار (${floorsCount}) يتجاوز 3 — جدران الأدراج مقاومة للحريق ساعتين وأبواب ساعة ونصف.`,
      refs: ['SBC-801-STAIR'],
    });
  } else if (floorsCount >= 2) {
    requirements.push({
      id: 'stair-1h',
      severity: 'info',
      title: 'حماية الأدراج (ساعة)',
      detail: 'للأدراج حتى 3 طوابق: مقاومة ساعة وأبواب ساعة.',
      refs: ['SBC-801-STAIR'],
    });
  }

  if (floorsCount > SBC_STRUCTURE_RULES.type_ib_above_floors) {
    requirements.push({
      id: 'structure-type-ib',
      severity: 'warning',
      title: 'تصنيف هيكلي Type I B (مراجعة)',
      detail: 'المباني التي تتعدى 3 أدوار تُراجع عادة كـ Type I B وفق الموجز.',
      refs: ['SBC-801-STRUCT', 'SBC-201-602'],
    });
  } else if (floorsCount >= 2) {
    requirements.push({
      id: 'structure-type-ia',
      severity: 'info',
      title: 'تصنيف هيكلي Type I A (مراجعة)',
      detail: 'الأبنية من 2 إلى 3 أدوار تُراجع عادة كـ Type I A وفق الموجز.',
      refs: ['SBC-801-STRUCT', 'SBC-201-602'],
    });
  }

  // Approximate standpipe: >3 floors often exceeds 9m floor height
  if (floorsCount >= 4) {
    requirements.push({
      id: 'standpipe',
      severity: 'required',
      title: 'نظام مواسير رأسية',
      detail: 'عند تجاوز ارتفاع أعلى طابق مشغول حوالي 9 م يلزم نظام مواسير (فئة 3، أو فئة 1 مع مرشات).',
      refs: ['SBC-801-Sec905', 'SBC-201-905'],
    });
  }

  if (occupancy.code === 'parking') {
    requirements.push({
      id: 'parking-vent',
      severity: 'required',
      title: 'تهوية مواقف مقفلة',
      detail: 'تغيير هواء 10 مرات في الساعة للمواقف المقفلة، مع فصل عن باقي المبنى بجدران ساعتين.',
      refs: ['SBC-801-OCC-PKG', 'SBC-201-406'],
    });
  }

  for (const note of occupancy.notes || []) {
    requirements.push({
      id: `note-${note.slice(0, 12)}`,
      severity: 'info',
      title: 'ملاحظة من الكود',
      detail: note,
      refs: occupancy.sbc_refs,
    });
  }

  if (floorsCount > rule.maxFloors) {
    requirements.push({
      id: 'max-floors-breach',
      severity: 'warning',
      title: 'تجاوز الحد الأقصى للأدوار',
      detail: `عدد الأدوار الحالي ${floorsCount} أعلى من الحد المعتمد لهذا النشاط (${rule.maxFloors}).`,
      refs: ['PLATFORM-ACTIVITY-RULES'],
    });
  }

  return {
    activityKey: key,
    activityLabel: rule.label,
    occupancy,
    riskLabel: RISK_LABEL_AR[occupancy.risk],
    minLandArea: rule.minLandArea,
    maxFloors: rule.maxFloors,
    floorsCount,
    buildingArea,
    landArea,
    electricalRoomsCount,
    floorLevels,
    requirements,
  };
}
