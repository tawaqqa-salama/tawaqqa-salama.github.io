/**
 * Phase 3 — structured pre-design compliance checklist (local JSON).
 */

import type {
  CADAnalysisResult,
  ComplianceChecklistItem,
  ComplianceItemStatus,
  ComplianceReport,
  CoverageAuditResult,
  EgressAnalysisSummary,
  PreCalculationBundle,
  ZoneSystemRequirement,
} from '@/lib/projects/design-center/vision/types';

function rank(s: ComplianceItemStatus): number {
  if (s === 'CRITICAL_NON_COMPLIANCE') return 3;
  if (s === 'NEEDS_ENGINEER_REVIEW') return 2;
  return 1;
}

function overallOf(items: ComplianceChecklistItem[]): ComplianceItemStatus {
  let best: ComplianceItemStatus = 'COMPLIANT';
  for (const it of items) {
    if (rank(it.status) > rank(best)) best = it.status;
  }
  return best;
}

export function buildComplianceReport(params: {
  egress: EgressAnalysisSummary | null;
  coverage: CoverageAuditResult | null;
  zoneRequirements: ZoneSystemRequirement[];
  preCalculations: PreCalculationBundle | null;
  hasSprinklerDeclared: boolean;
  hasFireAlarmDeclared: boolean;
  scaleKnown: boolean;
}): ComplianceReport {
  const items: ComplianceChecklistItem[] = [];

  // Scale / data
  items.push({
    id: 'data-scale',
    category: 'data',
    title_ar: 'مقياس الرسم',
    title_en: 'Drawing scale',
    detail_ar: params.scaleKnown
      ? 'تم اكتشاف مقياس — الحسابات المترية ممكنة'
      : 'المقياس غير معروف — القيم المترية Needs Engineer Input',
    detail_en: params.scaleKnown
      ? 'Scale detected — metric checks possible'
      : 'Scale unknown — metric values Need Engineer Input',
    status: params.scaleKnown ? 'COMPLIANT' : 'NEEDS_ENGINEER_REVIEW',
    code_refs: ['SBC-801'],
  });

  // Egress
  if (!params.egress) {
    items.push({
      id: 'egress-missing',
      category: 'egress',
      title_ar: 'مسافة الإخلاء',
      title_en: 'Egress travel distance',
      detail_ar: 'لم يُحسب تحليل الإخلاء',
      detail_en: 'Egress analysis not computed',
      status: 'NEEDS_ENGINEER_REVIEW',
      code_refs: ['SBC-801'],
    });
  } else {
    const eg = params.egress;
    const status: ComplianceItemStatus =
      eg.overall_status === 'exceeds_limit'
        ? 'CRITICAL_NON_COMPLIANCE'
        : eg.overall_status === 'within_limit'
          ? 'COMPLIANT'
          : 'NEEDS_ENGINEER_REVIEW';
    items.push({
      id: 'egress-travel',
      category: 'egress',
      title_ar: 'حد مسافة الانتقال SBC 801',
      title_en: 'SBC 801 travel distance limit',
      detail_ar: `أقصى انتقال تقديري ${eg.max_travel_m ?? '—'} م مقابل حد ${eg.limit.applied_max_m} م (${eg.overall_status})`,
      detail_en: `Max estimated travel ${eg.max_travel_m ?? '—'} m vs limit ${eg.limit.applied_max_m} m (${eg.overall_status})`,
      status,
      code_refs: ['SBC-801', 'NFPA-101'],
    });
  }

  // Coverage
  const cov = params.coverage;
  if (!cov) {
    items.push({
      id: 'cov-missing',
      category: 'coverage',
      title_ar: 'تغطية MEP',
      title_en: 'MEP coverage',
      detail_ar: 'تدقيق التغطية غير متاح',
      detail_en: 'Coverage audit unavailable',
      status: 'NEEDS_ENGINEER_REVIEW',
      code_refs: ['NFPA-13', 'NFPA-72'],
    });
  } else {
    const criticalCov = cov.issues.filter(
      (i) => i.kind === 'uncovered_zone' || i.kind === 'over_spaced'
    );
    const noDev = cov.issues.filter((i) => i.kind === 'no_devices');
    items.push({
      id: 'cov-sprinkler-smoke',
      category: 'coverage',
      title_ar: 'تباعد/تغطية المرشات والكواشف',
      title_en: 'Sprinkler & smoke spacing/coverage',
      detail_ar: cov.summary_ar,
      detail_en: cov.summary_en,
      status:
        criticalCov.length > 0
          ? 'CRITICAL_NON_COMPLIANCE'
          : noDev.length > 0 || cov.issues.some((i) => i.kind === 'scale_unknown')
            ? 'NEEDS_ENGINEER_REVIEW'
            : cov.devices.length
              ? 'COMPLIANT'
              : 'NEEDS_ENGINEER_REVIEW',
      code_refs: ['NFPA-13', 'NFPA-72', 'SBC-801'],
    });
  }

  // Special suppression matching
  const specialZones = params.zoneRequirements.filter(
    (r) =>
      r.classification === 'electrical_room' ||
      r.classification === 'server_room' ||
      r.classification === 'kitchen'
  );
  if (!specialZones.length) {
    items.push({
      id: 'special-none',
      category: 'special_suppression',
      title_ar: 'أنظمة خاصة حسب الفراغات',
      title_en: 'Zone special suppression',
      detail_ar: 'لا فراغات خاصة مكتشفة تتطلب FM200/CO2/شفاط',
      detail_en: 'No special zones detected requiring FM200/CO2/hood',
      status: 'COMPLIANT',
      code_refs: ['NFPA-2001', 'NFPA-96'],
    });
  } else {
    for (const z of specialZones) {
      items.push({
        id: `special-${z.zone_id}`,
        category: 'special_suppression',
        title_ar: `مطابقة نظام خاص: ${z.zone_label || z.zone_id}`,
        title_en: `Special system match: ${z.zone_label || z.zone_id}`,
        detail_ar: z.note_ar,
        detail_en: z.note_en,
        status: 'NEEDS_ENGINEER_REVIEW',
        code_refs: z.primary_codes,
      });
    }
  }

  // Pre-calculations
  const hyd = params.preCalculations?.hydraulic;
  items.push({
    id: 'pre-hydraulic',
    category: 'pre_calculation',
    title_ar: 'تقدير هيدروليكي أولي',
    title_en: 'Preliminary hydraulic estimate',
    detail_ar: hyd?.note_ar || 'غير متاح',
    detail_en: hyd?.note_en || 'Not available',
    status:
      hyd?.status === 'estimated'
        ? 'NEEDS_ENGINEER_REVIEW'
        : hyd?.status === 'not_available'
          ? 'NEEDS_ENGINEER_REVIEW'
          : 'NEEDS_ENGINEER_REVIEW',
    code_refs: ['NFPA-13', 'SBC-801'],
  });

  const bat = params.preCalculations?.alarm_battery;
  items.push({
    id: 'pre-battery',
    category: 'pre_calculation',
    title_ar: 'تقدير بطارية الإنذار',
    title_en: 'Fire alarm battery estimate',
    detail_ar: bat?.note_ar || 'غير متاح',
    detail_en: bat?.note_en || 'Not available',
    status:
      bat?.status === 'estimated' ? 'NEEDS_ENGINEER_REVIEW' : 'NEEDS_ENGINEER_REVIEW',
    code_refs: ['NFPA-72'],
  });

  // Declared systems consistency
  if (params.hasSprinklerDeclared === false && (cov?.devices.some((d) => d.kind === 'sprinkler') ?? false)) {
    items.push({
      id: 'decl-spk',
      category: 'data',
      title_ar: 'اتساق إعلان نظام المرشات',
      title_en: 'Sprinkler declaration consistency',
      detail_ar: 'وُجدت رموز مرشات نصية بينما النظام غير معلن في بيانات المشروع',
      detail_en: 'Text sprinkler symbols found but sprinkler not declared in project data',
      status: 'NEEDS_ENGINEER_REVIEW',
      code_refs: ['NFPA-13'],
    });
  }

  const overall_status = overallOf(items);
  return {
    generated_at: new Date().toISOString(),
    overall_status,
    items,
    counts: {
      compliant: items.filter((i) => i.status === 'COMPLIANT').length,
      needs_engineer_review: items.filter((i) => i.status === 'NEEDS_ENGINEER_REVIEW').length,
      critical: items.filter((i) => i.status === 'CRITICAL_NON_COMPLIANCE').length,
    },
  };
}

export function complianceReportFromCad(result: CADAnalysisResult, opts: {
  hasSprinklerDeclared: boolean;
  hasFireAlarmDeclared: boolean;
}): ComplianceReport {
  return buildComplianceReport({
    egress: result.egress,
    coverage: result.coverage,
    zoneRequirements: result.zone_system_requirements,
    preCalculations: result.pre_calculations,
    hasSprinklerDeclared: opts.hasSprinklerDeclared,
    hasFireAlarmDeclared: opts.hasFireAlarmDeclared,
    scaleKnown: result.scale.meters_per_pixel != null,
  });
}
