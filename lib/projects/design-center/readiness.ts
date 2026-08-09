/**
 * Design Center — Design Readiness + system input gates.
 * Never treat Knowledge Base document count as "applicable standards".
 */

import { hasDesignCenterDrawings } from '@/lib/projects/design-center/state';
import type {
  DesignCenterState,
  DesignJobStatus,
  FireSystemKind,
} from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export type DesignReadinessLevel =
  | 'NOT_READY'
  | 'READY_FOR_AI_ANALYSIS'
  | 'READY_FOR_PRELIMINARY_DESIGN'
  | 'READY_FOR_ENGINEER_REVIEW'
  | 'APPROVED';

export type DesignInputValue =
  | { state: 'known'; value: string | number | boolean }
  | { state: 'unknown' }
  | { state: 'not_available' }
  | { state: 'needs_engineer_input'; hint_ar?: string; hint_en?: string };

export type SystemDesignGateResult = {
  ok: boolean;
  missing: Array<{ key: string; label_ar: string; label_en: string }>;
};

function hasText(v: unknown): boolean {
  return String(v ?? '').trim().length > 0;
}

function hasNum(v: unknown): boolean {
  if (v == null || v === '') return false;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0;
}

export function hasProjectDrawings(data: ProjectEngineeringData): boolean {
  const drawings = data.plan_attachments?.engineering_drawings || [];
  const hydraulics = data.plan_attachments?.hydraulic_calculations || [];
  return (
    hasDesignCenterDrawings(data.design_center) ||
    drawings.length > 0 ||
    hydraulics.length > 0 ||
    Boolean(data.safety_blueprints?.architectural_base) ||
    Boolean(data.safety_blueprints?.fire_fighting_file) ||
    Boolean(data.safety_blueprints?.fire_alarm_file)
  );
}

export function projectHasOccupancy(client: ClientRecord, data: ProjectEngineeringData): boolean {
  return (
    hasText(data.building_plan?.occupancy_classification) ||
    hasText(client.activity_type)
  );
}

export function projectHasArea(client: ClientRecord, data: ProjectEngineeringData): boolean {
  return hasNum(client.building_area) || hasNum(data.building_plan?.total_site_area_m2);
}

export function projectHasGeometry(client: ClientRecord, data: ProjectEngineeringData): boolean {
  return (
    hasProjectDrawings(data) ||
    hasNum(client.floors_count) ||
    hasNum(data.building_plan?.building_height_m) ||
    hasNum(data.building_plan?.basement_floors_count)
  );
}

export function projectHasSpaces(data: ProjectEngineeringData): boolean {
  return hasText(data.building_plan?.floors_description);
}

export function projectHasEgress(data: ProjectEngineeringData): boolean {
  return (
    hasText(data.building_plan?.stairs_count) ||
    hasText(data.building_plan?.exits_count) ||
    hasText(data.building_plan?.emergency_exits_doors)
  );
}

/** Minimum inputs before resolving/creating a system design. */
export function systemDesignInputGate(
  kind: FireSystemKind,
  client: ClientRecord,
  data: ProjectEngineeringData
): SystemDesignGateResult {
  const missing: SystemDesignGateResult['missing'] = [];
  const need = (key: string, label_ar: string, label_en: string, ok: boolean) => {
    if (!ok) missing.push({ key, label_ar, label_en });
  };

  need('geometry', 'هندسة المبنى/الدور أو مخطط مرفوع', 'floor/building geometry or drawing', projectHasGeometry(client, data));
  need('occupancy', 'تصنيف الإشغال / الاستخدام', 'occupancy / use', projectHasOccupancy(client, data));
  need('spaces', 'معلومات الفراغات/الغرف', 'room/space information', projectHasSpaces(data) || hasProjectDrawings(data));

  if (kind === 'sprinkler' || kind === 'hose_reel' || kind === 'fm200' || kind === 'co2' || kind === 'clean_agent') {
    need('area', 'المساحة', 'area', projectHasArea(client, data));
    need(
      'design_inputs',
      'مدخلات تصميمية (مخطط أو نظام مرشات معلن)',
      'design inputs (drawing or declared sprinkler)',
      hasProjectDrawings(data) || hasText(data.building_plan?.sprinkler_system)
    );
  }

  if (kind === 'fire_alarm') {
    need(
      'egress',
      'مخارج / سلالم / مخطط أساسي',
      'egress / stairs / basic layout',
      projectHasEgress(data) || hasProjectDrawings(data)
    );
  }

  if (kind === 'kitchen_hood') {
    need('area', 'المساحة', 'area', projectHasArea(client, data));
  }

  return { ok: missing.length === 0, missing };
}

export function canCreateSystemDesign(
  kind: FireSystemKind,
  client: ClientRecord,
  data: ProjectEngineeringData
): boolean {
  return systemDesignInputGate(kind, client, data).ok;
}

function isApprovedStatus(status: string | null | undefined): boolean {
  return /معتمد|approved|signed/i.test(String(status || ''));
}

function analysisHonest(design: DesignCenterState | null | undefined): boolean {
  const job = design?.analysis;
  if (!job || job.status === 'idle' || job.status === 'queued' || job.status === 'running') return false;
  // Must not claim CAD vision completed
  const cadClaim = (job.steps || []).some(
    (s) =>
      (s.id === 'detect_rooms' || s.id === 'detect_walls' || s.id === 'ceiling_analysis' || s.id === 'mep_coordination') &&
      s.status === 'completed'
  );
  if (cadClaim) return false;
  return job.status === 'completed' || job.status === 'needs_engineer_review';
}

function systemsResolvedCount(design: DesignCenterState | null | undefined): number {
  return (design?.systems || []).filter((s) => s.status === 'completed' && s.standards).length;
}

/**
 * Overall Design Readiness for the Design Center header + workflow gate.
 */
export function computeDesignReadiness(
  client: ClientRecord,
  data: ProjectEngineeringData
): {
  level: DesignReadinessLevel;
  label_ar: string;
  label_en: string;
  reasons_ar: string[];
  reasons_en: string[];
} {
  const design = data.design_center;
  const reasons_ar: string[] = [];
  const reasons_en: string[] = [];

  if (isApprovedStatus(design?.status)) {
    return {
      level: 'APPROVED',
      label_ar: 'معتمد',
      label_en: 'APPROVED',
      reasons_ar: ['تم اعتماد مرحلة التصاميم'],
      reasons_en: ['Designs stage approved'],
    };
  }

  const drawings = hasProjectDrawings(data);
  const occupancy = projectHasOccupancy(client, data);
  const area = projectHasArea(client, data);
  const analysisOk = analysisHonest(design);
  const systemsOk = systemsResolvedCount(design);

  if (!drawings && !occupancy) {
    return {
      level: 'NOT_READY',
      label_ar: 'غير جاهز',
      label_en: 'NOT READY',
      reasons_ar: ['ارفع مخططاً أو أكمل تصنيف الإشغال قبل التحليل'],
      reasons_en: ['Upload a drawing or complete occupancy before analysis'],
    };
  }

  if (!analysisOk) {
    if (!drawings) {
      reasons_ar.push('لا يوجد مخطط مرفوع — محرك CAD غير متاح؛ ارفع PDF/DWG');
      reasons_en.push('No drawing uploaded — CAD engine unavailable; upload PDF/DWG');
    }
    if (!occupancy) {
      reasons_ar.push('تصنيف الإشغال غير مكتمل');
      reasons_en.push('Occupancy classification incomplete');
    }
    reasons_ar.push('شغّل تحليل المشروع من بيانات حقيقية (بدون محاكاة CAD)');
    reasons_en.push('Run project analysis from real fields (no CAD simulation)');
    return {
      level: 'READY_FOR_AI_ANALYSIS',
      label_ar: 'جاهز لتحليل AI',
      label_en: 'READY FOR AI ANALYSIS',
      reasons_ar,
      reasons_en,
    };
  }

  if (!area || systemsOk < 1) {
    if (!area) {
      reasons_ar.push('المساحة غير معروفة — Needs Engineer Input');
      reasons_en.push('Area unknown — Needs Engineer Input');
    }
    if (systemsOk < 1) {
      reasons_ar.push('حدّد المراجع المنطبقة لنظام واحد على الأقل بعد بوابة المدخلات');
      reasons_en.push('Resolve applicable standards for at least one system after input gate');
    }
    return {
      level: 'READY_FOR_PRELIMINARY_DESIGN',
      label_ar: 'جاهز لتصميم أولي',
      label_en: 'READY FOR PRELIMINARY DESIGN',
      reasons_ar,
      reasons_en,
    };
  }

  return {
    level: 'READY_FOR_ENGINEER_REVIEW',
    label_ar: 'جاهز لمراجعة المهندس',
    label_en: 'READY FOR ENGINEER REVIEW',
    reasons_ar: ['اكتملت الحد الأدنى من المدخلات والمراجع المنطبقة — بانتظار تحقق المهندس'],
    reasons_en: ['Minimum inputs and applicable standards resolved — awaiting engineer verification'],
  };
}

export function readinessAllowsStageApproval(level: DesignReadinessLevel): boolean {
  return level === 'READY_FOR_ENGINEER_REVIEW' || level === 'APPROVED';
}

/** KB docs available ≠ applicable standards */
export function knowledgeAvailabilityLabel(
  linkedDocs: number,
  preferAr: boolean
): string {
  if (preferAr) {
    return linkedDocs > 0
      ? `${linkedDocs} مراجع متاحة في قاعدة المعرفة`
      : 'لا توجد مراجع مربوطة في قاعدة المعرفة';
  }
  return linkedDocs > 0
    ? `${linkedDocs} references available in the knowledge base`
    : 'No knowledge-base references linked';
}

export function formatUnknownValue(
  value: unknown,
  preferAr: boolean,
  mode: 'unknown' | 'not_available' | 'needs_engineer_input' = 'unknown'
): string {
  if (value != null && String(value).trim() !== '') return String(value);
  if (mode === 'not_available') return preferAr ? 'غير متاح' : 'Not Available';
  if (mode === 'needs_engineer_input') return preferAr ? 'يحتاج إدخال المهندس' : 'Needs Engineer Input';
  return preferAr ? 'غير معروف' : 'Unknown';
}

export function normalizeStepStatus(status: DesignJobStatus | string | undefined): DesignJobStatus {
  if (status === 'not_available') return 'unavailable';
  if (status === 'pending') return 'idle';
  return (status as DesignJobStatus) || 'idle';
}
