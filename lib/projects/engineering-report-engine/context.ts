import { ACTIVITY_RULES } from '@/lib/constants/clients';
import { TECH_REPORT_ITEMS } from '@/lib/constants/technical-report';
import { EKB_TOPICS } from '@/lib/compliance/ekb-catalog';
import {
  assertEngineeringDecision,
  decideEngineeringForm,
} from '@/lib/design-intelligence/decision-engine';
import type { EngineeringFormState, EngineeringSelection } from '@/lib/design-intelligence/rules-types';
import { getTechnicalReportFacilitySnapshot } from '@/lib/projects/technical-report';
import { buildOccupantEgressRows, buildZoneSystemNeeds } from '@/lib/projects/sbc-classification';
import type { ClientRecord } from '@/lib/types/client';
import type {
  BuildingPlanReport,
  ProjectEngineeringData,
  TechnicalReport,
  TechnicalReportPhoto,
  TechnicalReportSectionItem,
} from '@/lib/types/project-reports';
import type {
  EngineeringStudyImage,
  EngineeringStudySectionId,
  ReportLocale,
} from '@/lib/projects/engineering-report-engine/types';

export type ReportSystemsSnapshot = {
  sprinkler: boolean;
  alarm: boolean;
  pumps: boolean;
  water: boolean;
  hose: boolean;
  extinguishers: boolean;
  ventilation: boolean;
  exits: boolean;
  emergencyPower: boolean;
  grounding: boolean;
  lightning: boolean;
};

export type EngineeringReportContext = {
  locale: ReportLocale;
  client: ClientRecord;
  report: TechnicalReport;
  buildingPlan: BuildingPlanReport | null;
  facility: ReturnType<typeof getTechnicalReportFacilitySnapshot>;
  selection: EngineeringSelection;
  rulesForm: EngineeringFormState;
  rulesGateOk: boolean;
  rulesSummaryAr: string;
  rulesSummaryEn: string;
  areaM2: number | null;
  floors: number | null;
  heightM: number | null;
  occupancyLabel: string;
  hazardLabel: string;
  buildingClassification: string;
  activityLabel: string;
  applicableCodes: string[];
  systems: ReportSystemsSnapshot;
  egressRows: ReturnType<typeof buildOccupantEgressRows>;
  zoneNeeds: ReturnType<typeof buildZoneSystemNeeds>;
  egressTotal: number;
  missingInputs: string[];
  /** Only citations that exist in EKB / rules code_refs */
  allowedCitations: Set<string>;
};

function allSectionItems(report: TechnicalReport): TechnicalReportSectionItem[] {
  return [
    ...(report.firefighting_items || []),
    ...(report.ventilation_items || []),
    ...(report.alarm_items || []),
    ...(report.exits_items || []),
  ];
}

function itemEnabled(report: TechnicalReport, id: string): boolean {
  const row = allSectionItems(report).find((i) => i.id === id);
  return !!row?.enabled;
}

function itemNotes(report: TechnicalReport, id: string): string {
  const row = allSectionItems(report).find((i) => i.id === id);
  if (!row) return '';
  return [row.selectedOptions?.join('؛ '), row.notes].filter(Boolean).join(' — ');
}

function itemTitle(itemId: string): string {
  return TECH_REPORT_ITEMS.find((i) => i.id === itemId)?.title || itemId;
}

/** Convert stored report photos to print-ready study images (data URLs only). */
export function photosToStudyImages(
  photos: TechnicalReportPhoto[] | null | undefined,
  fallbackCaptionAr: string,
  fallbackCaptionEn?: string,
  opts?: { sectionId?: EngineeringStudySectionId; imageType?: EngineeringStudyImage['image_type'] }
): EngineeringStudyImage[] {
  if (!photos?.length) return [];
  const out: EngineeringStudyImage[] = [];
  let order = 0;
  for (const photo of photos) {
    const src = String(photo?.dataUrl || '').trim();
    if (!src) continue;
    order += 1;
    const caption = String(photo.caption || '').trim();
    const looksLikeFile = /\.(jpe?g|png|webp|gif|heic)$/i.test(caption) || /^IMG_/i.test(caption);
    const caption_ar = !caption || looksLikeFile ? fallbackCaptionAr : caption;
    const caption_en =
      !caption || looksLikeFile ? fallbackCaptionEn || fallbackCaptionAr : caption;
    out.push({
      src,
      caption_ar,
      caption_en,
      image_id: photo.id || `${opts?.sectionId || 'img'}-${order}`,
      section_id: opts?.sectionId,
      image_order: order,
      image_type: opts?.imageType,
    });
  }
  return out;
}

/** Photos attached to a technical-report system / subsection item. */
export function getItemPhotos(
  report: TechnicalReport,
  itemId: string
): EngineeringStudyImage[] {
  const row = allSectionItems(report).find((i) => i.id === itemId);
  const title = itemTitle(itemId);
  return photosToStudyImages(row?.photos, title, title, {
    imageType: 'system',
  }).map((img, idx) => ({
    ...img,
    subsection_ar: title,
    subsection_en: title,
    image_order: idx + 1,
    caption_ar: img.caption_ar === title || /^صورة/.test(img.caption_ar) ? title : img.caption_ar,
    caption_en: img.caption_en === title || /^Photo/.test(img.caption_en) ? title : img.caption_en,
  }));
}

/** Code-snippet proof photos keyed in the report (occ-class, risk-class, spr-*, …). */
export function getProofPhotos(
  report: TechnicalReport,
  key: string,
  captionAr: string,
  captionEn?: string
): EngineeringStudyImage[] {
  const photos = report.code_proofs_by_key?.[key] || [];
  return photosToStudyImages(photos, captionAr, captionEn);
}

/** Zone-level code proof photos from floor_uses. */
export function getZoneProofPhotos(report: TechnicalReport): EngineeringStudyImage[] {
  const out: EngineeringStudyImage[] = [];
  for (const floor of report.floor_uses || []) {
    for (const zone of floor.zones || []) {
      const src = String(zone.code_proof_photo?.dataUrl || '').trim();
      if (!src) continue;
      const label = zone.label || zone.use_code || 'منطقة';
      const caption =
        zone.code_proof_photo?.caption ||
        `${floor.floor_name || 'دور'} — ${label}`;
      out.push({
        src,
        caption_ar: caption,
        caption_en: caption,
      });
    }
  }
  return out;
}

/**
 * Map study sections → technical-report item IDs / proof keys whose photos
 * should appear in print/preview.
 */
export const SECTION_PHOTO_SOURCES: Partial<
  Record<
    EngineeringStudySectionId,
    { items?: string[]; proofKeys?: Array<{ key: string; caption_ar: string; caption_en: string }>; includeZoneProofs?: boolean }
  >
> = {
  occupancy_classification: {
    proofKeys: [
      {
        key: 'occ-class',
        caption_ar: 'إثبات تصنيف الإشغال',
        caption_en: 'Occupancy classification proof',
      },
    ],
  },
  hazard_classification: {
    proofKeys: [
      {
        key: 'risk-class',
        caption_ar: 'إثبات تصنيف الخطورة',
        caption_en: 'Hazard classification proof',
      },
    ],
  },
  means_of_egress: { items: ['ex_routes'] },
  fire_truck_access: { items: ['ff_cd_parking'] },
  fire_water_supply: { items: ['ff_water'] },
  fire_pump_analysis: { items: ['ff_pumps'] },
  water_tank_analysis: { items: ['ff_water'] },
  sprinkler_system: {
    items: ['ff_piping'],
    includeZoneProofs: true,
  },
  hose_reel_study: { items: ['ff_cabinets'] },
  portable_extinguishers: { items: ['ff_extinguishers'] },
  fire_alarm_study: {
    items: ['al_panel', 'al_detectors', 'al_breakglass', 'al_bells'],
  },
  emergency_lighting: { items: ['al_emergency_lights'] },
  exit_signs: { items: ['al_signs'] },
  mechanical_ventilation: { items: ['vent_main'] },
  electrical_safety: { items: ['ff_special'] },
  civil_defense_requirements: { items: ['ff_cd_connections', 'ff_cd_parking'] },
};

/** Collect all photos that belong to a study section (items + proofs + zones). */
export function collectSectionPhotos(
  report: TechnicalReport,
  sectionId: EngineeringStudySectionId
): EngineeringStudyImage[] {
  const cfg = SECTION_PHOTO_SOURCES[sectionId];
  if (!cfg) return [];
  const images: EngineeringStudyImage[] = [];
  const seen = new Set<string>();
  const push = (list: EngineeringStudyImage[]) => {
    for (const img of list) {
      if (!img.src || seen.has(img.src)) continue;
      seen.add(img.src);
      images.push(img);
    }
  };
  for (const itemId of cfg.items || []) {
    push(
      getItemPhotos(report, itemId).map((img, idx) => ({
        ...img,
        section_id: sectionId,
        image_type: img.image_type || 'system',
        image_order: img.image_order ?? idx + 1,
      }))
    );
  }
  for (const proof of cfg.proofKeys || []) {
    push(
      getProofPhotos(report, proof.key, proof.caption_ar, proof.caption_en).map((img, idx) => ({
        ...img,
        section_id: sectionId,
        image_type: 'code_proof' as const,
        layout_type: 'full_width' as const,
        image_order: img.image_order ?? idx + 1,
      }))
    );
  }
  if (cfg.includeZoneProofs) {
    push(
      getZoneProofPhotos(report).map((img, idx) => ({
        ...img,
        section_id: sectionId,
        image_type: 'code_proof' as const,
        layout_type: 'full_width' as const,
        image_order: img.image_order ?? idx + 1,
      }))
    );
  }
  // Also attach spr-* / sup-* proof cards when present on sprinkler / special sections
  if (sectionId === 'sprinkler_system' || sectionId === 'electrical_safety') {
    for (const [key, photos] of Object.entries(report.code_proofs_by_key || {})) {
      if (sectionId === 'sprinkler_system' && !/^spr-/i.test(key)) continue;
      if (sectionId === 'electrical_safety' && !/^sup-/i.test(key)) continue;
      push(
        photosToStudyImages(
          photos,
          sectionId === 'sprinkler_system'
            ? 'إثبات تغطية الرش'
            : 'إثبات نظام إطفاء خاص',
          sectionId === 'sprinkler_system'
            ? 'Sprinkler coverage proof'
            : 'Special suppression proof'
        )
      );
    }
  }
  return images;
}

function yes(v: string | undefined | null): boolean {
  return v === 'نعم' || v === 'yes' || v === 'Yes';
}

function inferBuildingType(client: ClientRecord, plan: BuildingPlanReport | null): string | null {
  const fromPlan = plan?.building_type_code?.trim();
  if (fromPlan) {
    const lower = fromPlan.toLowerCase();
    if (/high.?rise|مرتفع/.test(lower)) return 'high_rise';
    if (/indust|مصنع|صناع/.test(lower)) return 'industrial';
    if (/ware|مستودع|تخزين/.test(lower)) return 'warehouse';
    if (/hotel|فندق|ضياف/.test(lower)) return 'hospitality';
    if (/health|صح|مستشفى|عياد/.test(lower)) return 'healthcare';
    if (/educ|تعليم|مدرس/.test(lower)) return 'educational';
    if (/resid|سكن/.test(lower)) return 'residential';
    if (/comm|تجار/.test(lower)) return 'commercial';
  }
  const act = `${client.activity_type || ''} ${ACTIVITY_RULES[client.activity_type || '']?.label || ''}`;
  if (/مصنع|صناع|industrial|factory/i.test(act)) return 'industrial';
  if (/مستودع|warehouse|تخزين/i.test(act)) return 'warehouse';
  if (/فندق|hotel/i.test(act)) return 'hospitality';
  if (/مستشفى|عياد|health/i.test(act)) return 'healthcare';
  if (/مدرس|تعليم|school|university/i.test(act)) return 'educational';
  if (/سكن|شقق|residential/i.test(act)) return 'residential';
  if (/قاعة|مول|مكتب|تجار|مطعم|cafe|office|mall|hall|assembly/i.test(act)) return 'commercial';
  return null;
}

function collectAllowedCitations(form: EngineeringFormState): Set<string> {
  const set = new Set<string>();
  for (const topic of EKB_TOPICS) {
    set.add(topic.standard);
    if (topic.standard === 'BOTH') {
      set.add('SBC');
      set.add('NFPA');
    }
    for (const tag of topic.tags || []) set.add(tag);
  }
  // Common Saudi references present in rules seed / EKB
  for (const ref of [
    'SBC',
    'SBC 801',
    'SBC 201',
    'SBC Occupancy',
    'Saudi Fire Code',
    'NFPA',
    'NFPA 13',
    'NFPA 14',
    'NFPA 20',
    'NFPA 22',
    'NFPA 72',
    'NFPA 101',
    'Civil Defense',
    'الدفاع المدني',
    'Company Standards',
  ]) {
    set.add(ref);
  }
  for (const f of form.fields) {
    for (const c of f.code_refs || []) set.add(c);
  }
  return set;
}

export function buildEngineeringReportContext(params: {
  client: ClientRecord;
  report: TechnicalReport;
  engineeringData?: ProjectEngineeringData | null;
  locale?: ReportLocale;
}): EngineeringReportContext {
  const locale = params.locale || 'ar';
  const client = params.client;
  const report = params.report;
  const buildingPlan = params.engineeringData?.building_plan || null;
  const facility = getTechnicalReportFacilitySnapshot(client);

  const rulesSelection =
    (params.engineeringData as ProjectEngineeringData & {
      building_info?: { rules_selection?: EngineeringSelection };
    })?.building_info?.rules_selection ||
    (
      buildingPlan as (BuildingPlanReport & { rules_selection?: EngineeringSelection }) | null
    )?.rules_selection ||
    undefined;

  const building_type = inferBuildingType(client, buildingPlan);
  const selection: EngineeringSelection = {
    ...(rulesSelection || {}),
    building_type: rulesSelection?.building_type || building_type,
    occupancy: rulesSelection?.occupancy || null,
    risk_classification: rulesSelection?.risk_classification || null,
    applicable_codes: rulesSelection?.applicable_codes || null,
  };

  const rulesForm = decideEngineeringForm(selection);
  const assertion = assertEngineeringDecision(rulesForm);

  const areaM2 =
    client.building_area != null
      ? Number(client.building_area)
      : buildingPlan?.total_site_area_m2
        ? Number(buildingPlan.total_site_area_m2)
        : null;
  const floors =
    client.floors_count != null
      ? Number(client.floors_count)
      : buildingPlan?.basement_floors_count
        ? Number(buildingPlan.basement_floors_count)
        : null;
  const heightM = buildingPlan?.building_height_m ? Number(buildingPlan.building_height_m) : null;

  const occupancyLabel =
    report.building_classification ||
    buildingPlan?.occupancy_classification ||
    facility.activity_label ||
    '';
  const hazardLabel = report.risk_class || '';
  const activityLabel = facility.activity_label || facility.activity_type || '';

  const codesFromRules = rulesForm.fields.find((f) => f.field_key === 'applicable_codes');
  const applicableCodes: string[] = [];
  if (Array.isArray(codesFromRules?.value)) {
    applicableCodes.push(...codesFromRules!.value.map(String));
  } else if (codesFromRules?.value) {
    applicableCodes.push(String(codesFromRules.value));
  }
  if (!applicableCodes.length) {
    // Only add codes that appear in allowed set later — seed defaults from EKB
    applicableCodes.push('SBC 801', 'Saudi Fire Code', 'NFPA 13', 'NFPA 72', 'Civil Defense');
  }

  const systems: ReportSystemsSnapshot = {
    sprinkler:
      yes(buildingPlan?.sprinkler_system) ||
      itemEnabled(report, 'ff_piping') ||
      !!rulesForm.selection.sprinkler_type,
    alarm:
      yes(buildingPlan?.fire_alarm_system) ||
      itemEnabled(report, 'al_panel') ||
      itemEnabled(report, 'al_detectors') ||
      !!rulesForm.selection.alarm_category,
    pumps: itemEnabled(report, 'ff_pumps') || !!rulesForm.selection.pump_requirement,
    water: itemEnabled(report, 'ff_water') || !!rulesForm.selection.tank_size,
    hose: itemEnabled(report, 'ff_cabinets'),
    extinguishers: itemEnabled(report, 'ff_extinguishers'),
    ventilation: itemEnabled(report, 'vent_main'),
    exits: itemEnabled(report, 'ex_routes') || !!buildingPlan?.exits_count,
    emergencyPower: yes(buildingPlan?.backup_generator),
    grounding: yes(buildingPlan?.electrical_grounding),
    lightning: yes(buildingPlan?.lightning_protection),
  };

  const egressRows = buildOccupantEgressRows(report.floor_uses || []);
  const zoneNeeds = buildZoneSystemNeeds(report.floor_uses || []);
  const egressTotal = egressRows.reduce((s, r) => s + (r.occupants || 0), 0);

  const missingInputs: string[] = [];
  if (!facility.business_name) missingInputs.push(locale === 'ar' ? 'اسم المنشأة' : 'Facility name');
  if (!building_type && !selection.building_type)
    missingInputs.push(locale === 'ar' ? 'نوع المبنى' : 'Building type');
  if (!areaM2) missingInputs.push(locale === 'ar' ? 'مساحة المبنى' : 'Building area');
  if (!floors) missingInputs.push(locale === 'ar' ? 'عدد الأدوار' : 'Number of floors');
  if (!occupancyLabel && !selection.occupancy)
    missingInputs.push(locale === 'ar' ? 'تصنيف الإشغال' : 'Occupancy classification');
  if (!hazardLabel && !selection.risk_classification)
    missingInputs.push(locale === 'ar' ? 'تصنيف الخطورة' : 'Hazard classification');
  if (heightM == null && yes(buildingPlan?.high_rise_building))
    missingInputs.push(locale === 'ar' ? 'ارتفاع المبنى' : 'Building height');

  return {
    locale,
    client,
    report,
    buildingPlan,
    facility,
    selection: rulesForm.selection,
    rulesForm,
    rulesGateOk: assertion.ok,
    rulesSummaryAr: assertion.summary_ar,
    rulesSummaryEn: assertion.summary_en,
    areaM2: Number.isFinite(areaM2 as number) ? (areaM2 as number) : null,
    floors: Number.isFinite(floors as number) ? (floors as number) : null,
    heightM: Number.isFinite(heightM as number) ? (heightM as number) : null,
    occupancyLabel,
    hazardLabel,
    buildingClassification: report.building_classification || occupancyLabel,
    activityLabel,
    applicableCodes,
    systems,
    egressRows,
    zoneNeeds,
    egressTotal,
    missingInputs,
    allowedCitations: collectAllowedCitations(rulesForm),
  };
}

export function getItemNarrative(ctx: EngineeringReportContext, itemId: string): string {
  return itemNotes(ctx.report, itemId);
}

export function lockedRuleValue(
  ctx: EngineeringReportContext,
  fieldKey: string
): string | string[] | null {
  const field = ctx.rulesForm.fields.find((f) => f.field_key === fieldKey);
  if (!field) return null;
  if (field.locked || field.auto_selected) return field.value;
  return field.value;
}

export function ruleReason(ctx: EngineeringReportContext, fieldKey: string): string {
  const field = ctx.rulesForm.fields.find((f) => f.field_key === fieldKey);
  if (!field) return '';
  return ctx.locale === 'ar'
    ? field.decision_reason_ar || field.explanation_ar || field.explanation
    : field.decision_reason_en || field.explanation;
}
