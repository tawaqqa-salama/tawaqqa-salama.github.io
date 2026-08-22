/**
 * Strict sequential 8-stage visible engineering workflow.
 * Stages stay LOCKED until the previous stage is Approved/Completed.
 * Approving a stage runs forward data inheritance into later stages.
 */

import type { ClientRecord } from '@/lib/types/client';
import type {
  PlanAttachmentFile,
  ProjectEngineeringData,
  ReportMeta,
  SupervisionTaskRow,
} from '@/lib/types/project-reports';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import { hasDesignCenterDrawings } from '@/lib/projects/design-center/state';
import { seedSpaceSafetyFromClient } from '@/lib/projects/design-center/space-safety';
import {
  computeDesignReadiness,
  readinessAllowsStageApproval,
} from '@/lib/projects/design-center/readiness';
import { seedBuildingPlanFromClient } from '@/lib/projects/building-plan';
import { seedCdCoverLetter } from '@/lib/projects/cd-cover-letter';
import { seedEngineeringDelivery } from '@/lib/projects/safety-delivery-letter';
import { seedTechnicalReportFromClient } from '@/lib/projects/technical-report';
import {
  DEFAULT_SUPERVISION_MONTHS,
  ensureTaskMonths,
  seedSupervisionReport,
} from '@/lib/projects/supervision-report';
import type { CompanyProfile } from '@/lib/company-profile';
import { validateCompletionAttachmentsForIssue } from '@/lib/projects/completion-certificate-attachments';
import { seedCompletionCertificate } from '@/lib/projects/completion-certificate';
import { getClientIdentitySnapshot } from '@/lib/projects/client-identity';
import {
  gateBlockerMessages,
  isComplianceGatedStage,
  runProjectCompliance,
} from '@/lib/projects/compliance';
import {
  attachFrozenComplianceSnapshot,
  freezeComplianceSnapshot,
} from '@/lib/projects/compliance/snapshot';
import { getBlockingStructuredObservationCases } from '@/lib/projects/field-visit-remediation';
import { AUTHORITATIVE_COMPLIANCE_MODULE } from '@/lib/projects/canonical-engineering';
import { getStage6ApprovalBlockers } from '@/lib/projects/stage6-contract';

export const WORKFLOW_STAGE_IDS = [
  'designs',
  'plan_info',
  'boq_schedule',
  'technical_report',
  'visits_supervision',
  'transmittals',
  'final_report',
  'completion',
] as const;

/** Legacy stage ids retained for loading older project records safely. */
export const LEGACY_PLANS_STAGE_ID = 'plans';
export const LEGACY_CONTRACT_STAGE_ID = 'contract';
export const LEGACY_INSPECTIONS_STAGE_ID = 'inspections';
export const LEGACY_DEFICIENCIES_STAGE_ID = 'deficiencies';

export function normalizeWorkflowStageId(
  id: string | null | undefined
): WorkflowStageId | null {
  if (!id) return null;
  if (id === LEGACY_PLANS_STAGE_ID) return 'plan_info';
  if (id === LEGACY_CONTRACT_STAGE_ID) return 'designs';
  if (id === LEGACY_INSPECTIONS_STAGE_ID || id === LEGACY_DEFICIENCIES_STAGE_ID) {
    return 'visits_supervision';
  }
  return (WORKFLOW_STAGE_IDS as readonly string[]).includes(id)
    ? (id as WorkflowStageId)
    : null;
}

/** Maps historical workflow pointers and approval dates into the visible eight-stage flow. */
export function normalizeWorkflowState(
  workflow: ProjectEngineeringData['workflow'] | null | undefined
): ProjectEngineeringData['workflow'] {
  if (!workflow) return {};
  const approved_at: Record<string, string> = {};
  for (const [stage, timestamp] of Object.entries(workflow.approved_at || {})) {
    const normalized = normalizeWorkflowStageId(stage);
    if (!normalized) continue;
    const prior = approved_at[normalized];
    approved_at[normalized] = !prior || timestamp > prior ? timestamp : prior;
  }
  return {
    ...workflow,
    active_stage: normalizeWorkflowStageId(workflow.active_stage) || undefined,
    last_approved_stage: normalizeWorkflowStageId(workflow.last_approved_stage) || undefined,
    approved_at,
  };
}

export type WorkflowStageId = (typeof WORKFLOW_STAGE_IDS)[number];

export type WorkflowStageUiState = 'completed' | 'current' | 'locked' | 'available';

export type WorkflowStageDef = {
  id: WorkflowStageId;
  order: number;
  label_ar: string;
  label_en: string;
  short_ar: string;
};

export const WORKFLOW_STAGES: WorkflowStageDef[] = [
  {
    id: 'designs',
    order: 1,
    label_ar: 'التصاميم',
    label_en: 'Designs — Design Center',
    short_ar: '1. التصاميم',
  },
  {
    id: 'plan_info',
    order: 2,
    label_ar: 'معلومات المخطط',
    label_en: 'Building Plan Information',
    short_ar: '2. معلومات المخطط',
  },
  {
    id: 'boq_schedule',
    order: 3,
    label_ar: 'جدول الكميات والجدول الزمني',
    label_en: 'BOQ & Master Schedule',
    short_ar: '3. الكميات',
  },
  {
    id: 'technical_report',
    order: 4,
    label_ar: 'التقرير الفني والدراسة',
    label_en: 'Technical Report & SBC',
    short_ar: '4. الفني',
  },
  {
    id: 'visits_supervision',
    order: 5,
    label_ar: 'الزيارات والإشراف',
    label_en: 'Visits & Supervision',
    short_ar: '5. الزيارات',
  },
  {
    id: 'transmittals',
    order: 6,
    label_ar: 'خطابات تسليم الدراسة وارد الدفاع المدني',
    label_en: 'Study Delivery & Civil Defense Response Letters',
    short_ar: '6. الخطابات',
  },
  {
    id: 'final_report',
    order: 7,
    label_ar: 'التقرير النهائي',
    label_en: 'Final Technical Report',
    short_ar: '7. النهائي',
  },
  {
    id: 'completion',
    order: 8,
    label_ar: 'شهادة إنهاء الأعمال',
    label_en: 'Final Completion Certificate',
    short_ar: '8. الشهادة',
  },
];

export const LOCK_TOOLTIP_AR = 'يجب إنهاء واكتمال المرحلة السابقة أولاً';

const APPROVED: ReportMeta['status'][] = ['مكتمل', 'معتمد'];

export function isApprovedStatus(status?: string | null): boolean {
  return APPROVED.includes((status || '') as ReportMeta['status']);
}

export type Stage5ApprovalBlockerCode =
  | 'NO_FIELD_VISITS'
  | 'FIELD_VISIT_NOT_APPROVED'
  | 'SUPERVISION_NOT_APPROVED'
  | 'TECHNICAL_NOTES_NOT_APPROVED'
  | 'OPEN_CRITICAL_DEFICIENCY'
  | 'OPEN_HIGH_DEFICIENCY'
  | 'OPEN_CRITICAL_FIELD_OBSERVATION'
  | 'OPEN_HIGH_FIELD_OBSERVATION';

export type Stage5ApprovalBlocker = {
  code: Stage5ApprovalBlockerCode;
  message: string;
};

/**
 * Canonical client-side Stage 5 approval predicate. The dedicated server RPC
 * mirrors these persisted-state rules; callers must not create a second list.
 */
export function getStage5ApprovalBlockers(data: ProjectEngineeringData): Stage5ApprovalBlocker[] {
  const blockers: Stage5ApprovalBlocker[] = [];
  const visits = data.field_visits || [];
  if (!visits.length) {
    blockers.push({ code: 'NO_FIELD_VISITS', message: 'يجب إضافة زيارة ميدانية واحدة على الأقل.' });
  } else if (visits.some((visit) => !isApprovedStatus(visit.status))) {
    blockers.push({ code: 'FIELD_VISIT_NOT_APPROVED', message: 'توجد زيارة غير مكتملة أو غير معتمدة.' });
  }
  if (!isApprovedStatus(data.supervision_report?.status)) {
    blockers.push({ code: 'SUPERVISION_NOT_APPROVED', message: 'يجب اعتماد تقرير الإشراف.' });
  }
  if (!isApprovedStatus(data.technical_notes?.status)) {
    blockers.push({ code: 'TECHNICAL_NOTES_NOT_APPROVED', message: 'يجب اعتماد الملاحظات الفنية.' });
  }

  const deficiencies = data.technical_notes?.deficiencies || [];
  if (deficiencies.some((item) => /critical|حرج/i.test(item.severity || '') && !item.resolved)) {
    blockers.push({ code: 'OPEN_CRITICAL_DEFICIENCY', message: 'توجد ملاحظة حرجة غير محلولة.' });
  }
  if (deficiencies.some((item) => /high|عالي/i.test(item.severity || '') && !item.resolved)) {
    blockers.push({ code: 'OPEN_HIGH_DEFICIENCY', message: 'توجد ملاحظة عالية غير محلولة.' });
  }

  const observationBlockers = getBlockingStructuredObservationCases({
    visits,
    supervision: data.supervision_report,
    technicalNotes: data.technical_notes,
  });
  if (observationBlockers.some((item) => item.severity === 'critical')) {
    blockers.push({
      code: 'OPEN_CRITICAL_FIELD_OBSERVATION',
      message: 'توجد ملاحظة ميدانية حرجة لم يتم التحقق من معالجتها.',
    });
  }
  if (observationBlockers.some((item) => item.severity === 'high')) {
    blockers.push({
      code: 'OPEN_HIGH_FIELD_OBSERVATION',
      message: 'توجد ملاحظة ميدانية عالية الخطورة لم يتم التحقق من معالجتها.',
    });
  }
  return blockers;
}

/**
 * Contract readiness remains governed by Sales/Finance, but is intentionally not
 * rendered as a project workflow stage.
 */
export function isContractGateSatisfied(client: ClientRecord, data: ProjectEngineeringData): boolean {
  const onboarding = data.contract_onboarding;
  if (isApprovedStatus(onboarding?.status)) return true;
  if (onboarding?.contract_status === 'signed' || onboarding?.contract_status === 'approved') {
    return true;
  }
  const quotation = String(client.quotation_status || '');
  const financial = String(client.financial_status || '');
  return /موقع|معتمد|signed|approved/i.test(quotation) || [
    'تم السداد',
    'معتمد مالياً',
  ].includes(financial);
}

function hasAttachment(list?: PlanAttachmentFile[] | null): boolean {
  return Array.isArray(list) && list.length > 0;
}

function hasAnyBlueprint(data: ProjectEngineeringData): boolean {
  const bp = data.safety_blueprints;
  return !!(
    bp?.architectural_base ||
    bp?.fire_fighting_file ||
    bp?.fire_alarm_file ||
    bp?.life_safety_file ||
    hasAttachment(data.plan_attachments?.engineering_drawings) ||
    hasAttachment(data.plan_attachments?.hydraulic_calculations) ||
    hasDesignCenterDrawings(data.design_center)
  );
}

/** Stage-level approval derived from underlying report statuses + gate rules */
export function isStageApproved(
  stageId: WorkflowStageId,
  client: ClientRecord,
  data: ProjectEngineeringData
): boolean {
  switch (stageId) {
    case 'designs': {
      const legacyDesignApproved = Boolean(data.workflow?.approved_at?.designs);
      const approvedDesign = isApprovedStatus(data.design_center.status) || legacyDesignApproved;
      const hasSpaceSafety = Boolean(data.design_center.space_safety?.floors.some((floor) => floor.areas.length));
      const hasLegacyAreas = Boolean(client.floor_levels?.length || data.technical_report.floor_uses?.length);
      return approvedDesign && (hasSpaceSafety || hasLegacyAreas) && hasAnyBlueprint(data);
    }
    case 'plan_info': {
      const legacyPlansApproved = Boolean(data.workflow?.approved_at?.[LEGACY_PLANS_STAGE_ID]);
      return (
        (isApprovedStatus(data.building_plan.status) || legacyPlansApproved) &&
        !!String(data.building_plan.occupancy_classification || '').trim()
      );
    }
    case 'boq_schedule':
      return isApprovedStatus(data.boq.status) && isApprovedStatus(data.timeline.status);
    case 'technical_report':
      return isApprovedStatus(data.technical_report.status);
    case 'visits_supervision':
      return getStage5ApprovalBlockers(data).length === 0;
    case 'transmittals':
      // Stage 6A is approved only by the server transition after validating the
      // canonical locked payload. A locally selected «مكتمل» status must never
      // unlock Stage 7 before that atomic transition has succeeded.
      return (
        getStage6ApprovalBlockers(data).length === 0 &&
        data.engineering_delivery.status === 'معتمد' &&
        data.cd_cover_letter?.status === 'معتمد' &&
        data.workflow?.last_approved_stage === 'transmittals' &&
        Boolean(data.workflow?.approved_at?.transmittals)
      );
    case 'final_report':
      return isApprovedStatus(data.final_inspection.status);
    case 'completion':
      return isApprovedStatus(data.completion_certificate.status);
    default:
      return false;
  }
}

export function canUnlockStage(
  stageId: WorkflowStageId,
  client: ClientRecord,
  data: ProjectEngineeringData
): boolean {
  const idx = WORKFLOW_STAGE_IDS.indexOf(stageId);
  if (stageId === 'designs') return isContractGateSatisfied(client, data);
  if (idx <= 0) return true;
  // Completion requires every visible predecessor to be approved.
  if (stageId === 'completion') {
    return WORKFLOW_STAGE_IDS.slice(0, -1).every((id) => isStageApproved(id, client, data));
  }
  const prev = WORKFLOW_STAGE_IDS[idx - 1];
  return isStageApproved(prev, client, data);
}

export function getStageUiState(
  stageId: WorkflowStageId,
  activeStage: WorkflowStageId,
  client: ClientRecord,
  data: ProjectEngineeringData
): WorkflowStageUiState {
  if (isStageApproved(stageId, client, data)) return 'completed';
  if (!canUnlockStage(stageId, client, data)) return 'locked';
  if (stageId === activeStage) return 'current';
  return 'available';
}

export function resolveActiveStage(
  client: ClientRecord,
  data: ProjectEngineeringData,
  preferred?: WorkflowStageId | null
): WorkflowStageId {
  const preferredNorm =
    normalizeWorkflowStageId(preferred) ||
    normalizeWorkflowStageId(data.workflow?.active_stage);
  if (preferredNorm && canUnlockStage(preferredNorm, client, data)) return preferredNorm;
  for (const id of WORKFLOW_STAGE_IDS) {
    // Keep the first incomplete visible stage selected even when it is locked by
    // the Sales/Finance contract gate; this never unlocks or approves it.
    if (!isStageApproved(id, client, data)) return id;
  }
  return 'completion';
}

export function workflowProgressPercent(client: ClientRecord, data: ProjectEngineeringData): number {
  const done = WORKFLOW_STAGE_IDS.filter((id) => isStageApproved(id, client, data)).length;
  return Math.round((done / WORKFLOW_STAGE_IDS.length) * 100);
}

export function stageApprovalBlockers(
  stageId: WorkflowStageId,
  client: ClientRecord,
  data: ProjectEngineeringData
): string[] {
  const blockers: string[] = [];
  switch (stageId) {
    case 'designs': {
      if (!isContractGateSatisfied(client, data)) {
        blockers.push('اعتماد العقد أو الحالة المالية من المبيعات مطلوب قبل بدء المشروع');
      }
      if (!data.design_center.space_safety?.floors.some((floor) => floor.areas.length)) {
        blockers.push('أدخل أو راجع بيانات المساحات وأنظمة السلامة داخل التصاميم');
      }
      if (!hasAnyBlueprint(data)) {
        blockers.push('ارفع مخططًا واحدًا على الأقل ضمن قسم المخططات في التصاميم');
      }
      // Keep Design Intelligence readiness as an existing independent gate.
      const readiness = computeDesignReadiness(client, data);
      if (!readinessAllowsStageApproval(readiness.level)) {
        blockers.push(
          `جاهزية التصميم: ${readiness.label_ar} — يلزم READY FOR ENGINEER REVIEW قبل اعتماد المرحلة`
        );
      }
      break;
    }
    case 'plan_info':
      if (!String(data.building_plan.occupancy_classification || '').trim()) {
        blockers.push('تصنيف الإشغال (SBC/NFPA) مطلوب في معلومات المخطط');
      }
      break;
    case 'boq_schedule':
      if (!(data.boq.items || []).length) blockers.push('أضف بنود جدول الكميات');
      if (!data.timeline.project_start || !data.timeline.project_end) {
        blockers.push('حدد بداية ونهاية الجدول الزمني');
      }
      break;
    case 'visits_supervision':
      blockers.push(...getStage5ApprovalBlockers(data).map((item) => item.message));
      break;
    case 'transmittals':
      blockers.push(...getStage6ApprovalBlockers(data).map((item) => item.message));
      break;
    case 'completion': {
      const cert = data.completion_certificate;
      const attachmentError = validateCompletionAttachmentsForIssue(cert?.attachments, {
        activityType: client.activity_type,
        activityLabel: cert?.activity_label || client.activity_type,
        elevatorsCount: data.building_plan?.elevators_count,
        hasElevator: cert?.has_elevator,
      });
      if (attachmentError) blockers.push(attachmentError);
      break;
    }
    default:
      break;
  }

  // Saudi Code Compliance Engine gate (AUTHORITATIVE ONLY — lib/projects/compliance).
  // Design Center / DI / vision / lib/compliance advisory findings MUST NOT unlock stages.
  if (isComplianceGatedStage(stageId)) {
    // Explicitly ignore advisory payloads on design_center.compliance
    void data.design_center?.compliance;
    void AUTHORITATIVE_COMPLIANCE_MODULE;
    const run = runProjectCompliance({ client, data });
    if (run.gate === 'BLOCKED') {
      blockers.push(...gateBlockerMessages(run));
    }
  }

  return blockers;
}

function markApproved<T extends ReportMeta>(report: T): T {
  return { ...report, status: 'معتمد', updated_at: new Date().toISOString() };
}

/** Approve the current stage (set underlying statuses) then inherit into later stages. */
export function approveWorkflowStage(params: {
  stageId: WorkflowStageId;
  client: ClientRecord;
  data: ProjectEngineeringData;
  company?: CompanyProfile | null;
}): { ok: boolean; data: ProjectEngineeringData; blockers: string[]; nextStage: WorkflowStageId } {
  const { stageId, client, company } = params;
  let data = { ...params.data };
  const blockers = stageApprovalBlockers(stageId, client, data);

  if (!canUnlockStage(stageId, client, data)) {
    return {
      ok: false,
      data,
      blockers: [LOCK_TOOLTIP_AR],
      nextStage: stageId,
    };
  }

  if (blockers.length) {
    return { ok: false, data, blockers, nextStage: stageId };
  }

  // Stage 6A must pass the canonical server-side transition before any status
  // mutation. ProjectReportModal invokes that RPC and reloads the resulting
  // canonical payload rather than calling this local approval path.
  if (stageId === 'transmittals') {
    return {
      ok: false,
      data,
      blockers: ['يلزم اعتماد مرحلة الخطابات عبر الحاجز الخادمي.'],
      nextStage: stageId,
    };
  }

  switch (stageId) {
    case 'designs':
      data.design_center = markApproved({
        ...EMPTY_PROJECT_ENGINEERING_DATA.design_center,
        ...data.design_center,
      });
      break;
    case 'plan_info':
      data.building_plan = markApproved(data.building_plan);
      break;
    case 'boq_schedule':
      data.boq = markApproved(data.boq);
      data.timeline = markApproved(data.timeline);
      break;
    case 'technical_report':
      data.technical_report = markApproved(data.technical_report);
      break;
    case 'visits_supervision':
      data.field_visits = data.field_visits.map((v) => markApproved(v));
      data.supervision_report = markApproved(data.supervision_report);
      data.technical_notes = markApproved(data.technical_notes);
      break;
    case 'final_report':
      data.final_inspection = markApproved(data.final_inspection);
      break;
    case 'completion':
      data.completion_certificate = markApproved(data.completion_certificate);
      break;
  }

  // Freeze authoritative compliance snapshot on compliance-gated approvals
  if (isComplianceGatedStage(stageId)) {
    const run = runProjectCompliance({ client, data });
    data = attachFrozenComplianceSnapshot(
      data,
      freezeComplianceSnapshot({
        run,
        stageId,
        datasetRevision: data.engineering_meta?.revision ?? null,
        sourceCode: 'SBC 201/801',
        codeEdition: data.compliance?.approved_snapshot?.code_edition ?? null,
      })
    );
  }

  data = applyPipelineInheritance(client, data, company);
  data.workflow = {
    ...(data.workflow || {}),
    active_stage: undefined,
    last_approved_stage: stageId,
    approved_at: {
      ...(data.workflow?.approved_at || {}),
      [stageId]: new Date().toISOString(),
    },
  };

  const idx = WORKFLOW_STAGE_IDS.indexOf(stageId);
  const nextStage =
    idx >= 0 && idx < WORKFLOW_STAGE_IDS.length - 1
      ? WORKFLOW_STAGE_IDS[idx + 1]
      : 'completion';

  return { ok: true, data, blockers: [], nextStage };
}

function boqToSupervisionTasks(data: ProjectEngineeringData): SupervisionTaskRow[] {
  const months = data.supervision_report?.months?.length
    ? data.supervision_report.months
    : DEFAULT_SUPERVISION_MONTHS;
  const items = data.boq.items || [];
  if (!items.length) return data.supervision_report?.tasks || [];

  return items.map((item, index) => {
    const existing = (data.supervision_report?.tasks || []).find(
      (t) => t.description === item.item
    );
    if (existing) return ensureTaskMonths(existing, months);
    const label = item.item.toLowerCase();
    let category_id = 'general';
    let category_label = 'أعمال عامة';
    if (/رش|إطفاء|sprinkler|pump|مضخ/i.test(label)) {
      category_id = 'firefighting';
      category_label = 'أنظمة الإطفاء';
    } else if (/إنذار|alarm|كشف/i.test(label)) {
      category_id = 'alarm';
      category_label = 'أنظمة الإنذار';
    } else if (/دخان|smoke|تهوية/i.test(label)) {
      category_id = 'smoke';
      category_label = 'التحكم بالدخان';
    }
    return ensureTaskMonths(
      {
        id: `boq-${item.id || index}`,
        category_id,
        category_label,
        description: item.item,
        work_type: 'توريد وتركيب',
        month_progress: {},
        total_percent: null,
      },
      months
    );
  });
}

/**
 * Forward-flowing inheritance: later stages pick up context from earlier ones
 * without inventing engineering values.
 */
export function applyPipelineInheritance(
  client: ClientRecord,
  data: ProjectEngineeringData,
  company?: CompanyProfile | null
): ProjectEngineeringData {
  const next: ProjectEngineeringData = { ...data };

  // Stage 1 → 2 / 4 / 7 / 9: client & project meta — always refresh from Sales
  const identity = getClientIdentitySnapshot(client);
  const projectName = identity.facility_name;
  const owner = identity.owner_name;

  next.contract_onboarding = {
    ...next.contract_onboarding,
    client_name_snapshot: identity.client_name || identity.owner_name,
    project_name_snapshot: identity.facility_name,
  };

  next.design_center = {
    ...next.design_center,
    space_safety: seedSpaceSafetyFromClient(client, next.design_center.space_safety),
  };

  next.building_plan = seedBuildingPlanFromClient(client, {
    ...next.building_plan,
    office_name: next.building_plan.office_name || company?.legal_name || company?.name || '',
    building_permit_number:
      next.building_plan.building_permit_number ||
      next.technical_report.building_permit_number ||
      client.license_number ||
      '',
  });

  next.technical_report = seedTechnicalReportFromClient(client, {
    ...next.technical_report,
    building_classification:
      next.technical_report.building_classification ||
      next.building_plan.occupancy_classification ||
      '',
    building_permit_number:
      next.building_plan.building_permit_number ||
      next.technical_report.building_permit_number ||
      client.license_number ||
      '',
    building_permit_date:
      next.building_plan.building_permit_date ||
      next.technical_report.building_permit_date ||
      '',
  });

  // Designs and plan information → later delivery-letter context
  next.engineering_delivery = seedEngineeringDelivery(client, next, next.engineering_delivery);
  next.cd_cover_letter = seedCdCoverLetter(client, next, {
    ...next.cd_cover_letter,
    building_status:
      next.cd_cover_letter.building_status ||
      next.technical_report.building_status ||
      client.project_status ||
      'تحت الإنشاء',
  });

  // Attachments note for CD letter inheritance
  const drawingNames = (next.plan_attachments?.engineering_drawings || [])
    .map((f) => f.fileName)
    .join('، ');
  const calcNames = (next.plan_attachments?.hydraulic_calculations || [])
    .map((f) => f.fileName)
    .join('، ');
  if (drawingNames || calcNames) {
    next.engineering_delivery = {
      ...next.engineering_delivery,
      attachments_note:
        next.engineering_delivery.attachments_note ||
        [
          drawingNames ? `مخططات: ${drawingNames}` : '',
          calcNames ? `حسابات هيدروليكية: ${calcNames}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
    };
  }

  // Stage 3 BOQ → Stage 5 supervision rows
  if ((next.boq.items || []).length) {
    const tasks = boqToSupervisionTasks(next);
    next.supervision_report = {
      ...next.supervision_report,
      project_name: projectName || next.supervision_report.project_name,
      owner_name: owner || next.supervision_report.owner_name,
      building_type: identity.activity_label || next.supervision_report.building_type,
      area_m2:
        identity.building_area || identity.land_area || next.supervision_report.area_m2,
      tasks,
      months: next.supervision_report.months?.length
        ? next.supervision_report.months
        : DEFAULT_SUPERVISION_MONTHS,
    };
  } else if (company) {
    next.supervision_report = seedSupervisionReport(
      client,
      next,
      company,
      next.supervision_report
    );
  }

  // Timeline duration hint on supervision
  if (next.timeline.project_start && next.timeline.project_end) {
    next.supervision_report = {
      ...next.supervision_report,
      notes:
        next.supervision_report.notes ||
        `الجدول الزمني المعتمد: ${next.timeline.project_start} → ${next.timeline.project_end}`,
    };
  }

  // Study ref from technical report → CD letter outgoing
  if (next.technical_report.outgoing_number) {
    next.cd_cover_letter = {
      ...next.cd_cover_letter,
      outgoing_number:
        next.cd_cover_letter.outgoing_number || next.technical_report.outgoing_number,
    };
    next.engineering_delivery = {
      ...next.engineering_delivery,
      outgoing_number:
        next.engineering_delivery.outgoing_number || next.technical_report.outgoing_number,
    };
  }

  // Completion certificate identity inherited from Sales
  next.completion_certificate = seedCompletionCertificate(
    client,
    next,
    company,
    next.completion_certificate
  );

  next.workflow = {
    ...(next.workflow || {}),
    inherited_at: new Date().toISOString(),
  };

  return next;
}
