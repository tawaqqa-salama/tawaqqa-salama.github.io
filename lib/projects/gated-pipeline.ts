/**
 * Strict sequential 9-stage gated engineering workflow.
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
import {
  completionAttachmentBlockers,
  hasAllRequiredCompletionAttachments,
} from '@/lib/projects/completion-attachments';

export const WORKFLOW_STAGE_IDS = [
  'contract',
  'plans',
  'boq_schedule',
  'technical_report',
  'inspections',
  'deficiencies',
  'transmittals',
  'final_report',
  'completion',
] as const;

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
    id: 'contract',
    order: 1,
    label_ar: 'العقد والتعاقد',
    label_en: 'Contract & Onboarding',
    short_ar: '1. العقد',
  },
  {
    id: 'plans',
    order: 2,
    label_ar: 'معلومات المخطط والمرفقات',
    label_en: 'Plans & Hydraulic Calcs',
    short_ar: '2. المخطط',
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
    id: 'inspections',
    order: 5,
    label_ar: 'الزيارات الميدانية وتقرير الإشراف',
    label_en: 'Site Inspections & Supervision',
    short_ar: '5. الإشراف',
  },
  {
    id: 'deficiencies',
    order: 6,
    label_ar: 'الملاحظات الفنية واشتراطات الموقع',
    label_en: 'Technical Deficiencies & Snag List',
    short_ar: '6. الملاحظات',
  },
  {
    id: 'transmittals',
    order: 7,
    label_ar: 'خطابات تسليم الدراسة والدفاع المدني',
    label_en: 'Transmittal Cover Letters (CD)',
    short_ar: '7. الخطابات',
  },
  {
    id: 'final_report',
    order: 8,
    label_ar: 'التقرير النهائي',
    label_en: 'Final Technical Report',
    short_ar: '8. النهائي',
  },
  {
    id: 'completion',
    order: 9,
    label_ar: 'شهادة إنهاء الأعمال',
    label_en: 'Final Completion Certificate',
    short_ar: '9. الشهادة',
  },
];

export const LOCK_TOOLTIP_AR = 'يجب إنهاء واكتمال المرحلة السابقة أولاً';

const APPROVED: ReportMeta['status'][] = ['مكتمل', 'معتمد'];

export function isApprovedStatus(status?: string | null): boolean {
  return APPROVED.includes((status || '') as ReportMeta['status']);
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
    hasAttachment(data.plan_attachments?.hydraulic_calculations)
  );
}

/** Stage-level approval derived from underlying report statuses + gate rules */
export function isStageApproved(
  stageId: WorkflowStageId,
  client: ClientRecord,
  data: ProjectEngineeringData
): boolean {
  switch (stageId) {
    case 'contract': {
      const c = data.contract_onboarding;
      if (isApprovedStatus(c?.status)) return true;
      if (c?.contract_status === 'signed' || c?.contract_status === 'approved') return true;
      // Legacy: financially approved / signed quotation treated as contract gate
      const q = String(client.quotation_status || '');
      const f = String(client.financial_status || '');
      return (
        /موقع|معتمد|signed|approved/i.test(q) ||
        ['تم السداد', 'معتمد مالياً'].includes(f)
      );
    }
    case 'plans':
      return (
        isApprovedStatus(data.building_plan.status) &&
        !!String(data.building_plan.occupancy_classification || '').trim() &&
        hasAnyBlueprint(data)
      );
    case 'boq_schedule':
      return isApprovedStatus(data.boq.status) && isApprovedStatus(data.timeline.status);
    case 'technical_report':
      return isApprovedStatus(data.technical_report.status);
    case 'inspections': {
      const visitsOk =
        data.field_visits.length > 0 &&
        data.field_visits.every((v) => isApprovedStatus(v.status));
      return visitsOk && isApprovedStatus(data.supervision_report?.status);
    }
    case 'deficiencies': {
      if (!isApprovedStatus(data.technical_notes.status)) return false;
      const critical = (data.technical_notes.deficiencies || []).filter(
        (d) => /critical|حرج|عالي|high/i.test(d.severity || '')
      );
      if (!critical.length) return true;
      return critical.every((d) => d.resolved);
    }
    case 'transmittals':
      return (
        isApprovedStatus(data.engineering_delivery.status) &&
        isApprovedStatus(data.cd_cover_letter?.status)
      );
    case 'final_report':
      return isApprovedStatus(data.final_inspection.status);
    case 'completion':
      return (
        isApprovedStatus(data.completion_certificate.status) &&
        hasAllRequiredCompletionAttachments(client, data)
      );
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
  if (idx <= 0) return true;
  // Stage 9: all previous must be approved
  if (stageId === 'completion') {
    return WORKFLOW_STAGE_IDS.slice(0, 8).every((id) => isStageApproved(id, client, data));
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
  if (preferred && canUnlockStage(preferred, client, data)) return preferred;
  for (const id of WORKFLOW_STAGE_IDS) {
    if (!isStageApproved(id, client, data) && canUnlockStage(id, client, data)) return id;
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
    case 'contract':
      if (
        !(
          data.contract_onboarding?.project_name_snapshot ||
          client.business_name ||
          client.name
        )
      ) {
        blockers.push('اسم المشروع مطلوب');
      }
      break;
    case 'plans':
      if (!String(data.building_plan.occupancy_classification || '').trim()) {
        blockers.push('تصنيف الإشغال (SBC/NFPA) مطلوب');
      }
      if (!hasAnyBlueprint(data)) {
        blockers.push('ارفع المخططات الهندسية و/أو الحسابات الهيدروليكية');
      }
      break;
    case 'boq_schedule':
      if (!(data.boq.items || []).length) blockers.push('أضف بنود جدول الكميات');
      if (!data.timeline.project_start || !data.timeline.project_end) {
        blockers.push('حدد بداية ونهاية الجدول الزمني');
      }
      break;
    case 'deficiencies': {
      const openCritical = (data.technical_notes.deficiencies || []).filter(
        (d) => /critical|حرج|عالي|high/i.test(d.severity || '') && !d.resolved
      );
      if (openCritical.length) {
        blockers.push(`يوجد ${openCritical.length} ملاحظة حرجة غير محلولة`);
      }
      break;
    }
    case 'completion': {
      blockers.push(...completionAttachmentBlockers(client, data));
      break;
    }
    default:
      break;
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

  switch (stageId) {
    case 'contract':
      data.contract_onboarding = markApproved({
        ...EMPTY_PROJECT_ENGINEERING_DATA.contract_onboarding,
        ...data.contract_onboarding,
        contract_status: 'signed',
        client_name_snapshot:
          data.contract_onboarding?.client_name_snapshot || client.name || '',
        project_name_snapshot:
          data.contract_onboarding?.project_name_snapshot ||
          client.business_name ||
          client.name ||
          '',
        contract_value:
          data.contract_onboarding?.contract_value ?? client.quotation_amount ?? null,
        signed_at: new Date().toISOString().slice(0, 10),
      });
      break;
    case 'plans':
      data.building_plan = markApproved(data.building_plan);
      break;
    case 'boq_schedule':
      data.boq = markApproved(data.boq);
      data.timeline = markApproved(data.timeline);
      break;
    case 'technical_report':
      data.technical_report = markApproved(data.technical_report);
      break;
    case 'inspections':
      data.field_visits = data.field_visits.map((v) => markApproved(v));
      data.supervision_report = markApproved(data.supervision_report);
      break;
    case 'deficiencies':
      data.technical_notes = markApproved(data.technical_notes);
      break;
    case 'transmittals':
      data.engineering_delivery = markApproved(data.engineering_delivery);
      data.cd_cover_letter = markApproved(data.cd_cover_letter);
      break;
    case 'final_report':
      data.final_inspection = markApproved(data.final_inspection);
      break;
    case 'completion':
      data.completion_certificate = markApproved(data.completion_certificate);
      break;
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
  let next: ProjectEngineeringData = { ...data };

  // Stage 1 → 2 / 4 / 7 / 9: client & project meta
  const projectName =
    next.contract_onboarding?.project_name_snapshot ||
    client.business_name ||
    client.name ||
    '';
  const owner = client.owner_name || client.name || '';

  next.building_plan = seedBuildingPlanFromClient(client, {
    ...next.building_plan,
    office_name: next.building_plan.office_name || company?.legal_name || company?.name || '',
  });

  next.technical_report = seedTechnicalReportFromClient(client, {
    ...next.technical_report,
    building_classification:
      next.technical_report.building_classification ||
      next.building_plan.occupancy_classification ||
      '',
    building_permit_number:
      next.technical_report.building_permit_number ||
      next.building_plan.building_permit_number ||
      '',
    building_permit_date:
      next.technical_report.building_permit_date ||
      next.building_plan.building_permit_date ||
      '',
  });

  // Stage 2 hydraulic/plans → Stage 7 CD letter + delivery
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
      project_name: next.supervision_report.project_name || projectName,
      owner_name: next.supervision_report.owner_name || owner,
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

  next.workflow = {
    ...(next.workflow || {}),
    inherited_at: new Date().toISOString(),
  };

  return next;
}
