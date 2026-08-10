import type { ClientRecord } from '@/lib/types/client';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  EMPTY_BUILDING_PLAN,
  EMPTY_TECHNICAL_REPORT,
  EMPTY_SAFETY_BLUEPRINTS,
  EMPTY_PLAN_ATTACHMENTS,
  EMPTY_CONTRACT_ONBOARDING,
  EMPTY_SUPERVISION_REPORT,
  type FieldVisitReport,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { mergeDesignCenterDefaults } from '@/lib/projects/design-center/state';
import { syncKnowledgeLinksToDesignCenterSync } from '@/lib/design-intelligence/project-knowledge-bridge';
import {
  applyPipelineInheritance,
  workflowProgressPercent,
} from '@/lib/projects/gated-pipeline';
import { mergeBuildingPlanDefaults } from '@/lib/projects/building-plan';
import { seedTechnicalReportFromClient } from '@/lib/projects/technical-report';
import { mergeSafetyScope, seedEngineeringDelivery } from '@/lib/projects/safety-delivery-letter';
import { seedCdCoverLetter } from '@/lib/projects/cd-cover-letter';
import { seedFinalInspectionReport } from '@/lib/projects/final-safety-report';
import { ensureTaskMonths } from '@/lib/projects/supervision-report';
import { mergeFireProtectionDesign } from '@/lib/projects/admin-uc-report/design';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';

export function parseProjectEngineeringData(raw: ClientRecord['project_engineering_data']): ProjectEngineeringData {
  if (!raw || typeof raw !== 'object') {
    return {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: { ...EMPTY_TECHNICAL_REPORT },
      field_visits: [],
      supervision_report: { ...EMPTY_SUPERVISION_REPORT, months: [], tasks: [] },
    };
  }
  const data = raw as Partial<ProjectEngineeringData>;
  const months = Array.isArray(data.supervision_report?.months)
    ? data.supervision_report!.months
    : [];
  const rawTasks = Array.isArray(data.supervision_report?.tasks)
    ? data.supervision_report!.tasks
    : [];
  const tasks = months.length
    ? rawTasks.map((t) => ensureTaskMonths(t, months))
    : rawTasks;
  return {
    technical_report: {
      ...EMPTY_TECHNICAL_REPORT,
      ...data.technical_report,
      floor_uses: data.technical_report?.floor_uses || [],
      code_proof_photos: data.technical_report?.code_proof_photos || [],
      code_proofs_by_key: data.technical_report?.code_proofs_by_key || {},
      components: data.technical_report?.components || [],
      firefighting_items: data.technical_report?.firefighting_items || [],
      ventilation_items: data.technical_report?.ventilation_items || [],
      alarm_items: data.technical_report?.alarm_items || [],
      exits_items: data.technical_report?.exits_items || [],
      general_recommendations: data.technical_report?.general_recommendations || [],
    },
    building_plan: mergeBuildingPlanDefaults({ ...EMPTY_BUILDING_PLAN, ...data.building_plan }),
    safety_blueprints: {
      ...EMPTY_SAFETY_BLUEPRINTS,
      ...data.safety_blueprints,
    },
    plan_attachments: {
      ...EMPTY_PLAN_ATTACHMENTS,
      engineering_drawings: data.plan_attachments?.engineering_drawings || [],
      hydraulic_calculations: data.plan_attachments?.hydraulic_calculations || [],
    },
    design_center: mergeDesignCenterDefaults(data.design_center),
    contract_onboarding: {
      ...EMPTY_CONTRACT_ONBOARDING,
      ...data.contract_onboarding,
    },
    boq: { ...EMPTY_PROJECT_ENGINEERING_DATA.boq, items: data.boq?.items || [], ...data.boq },
    timeline: { ...EMPTY_PROJECT_ENGINEERING_DATA.timeline, milestones: data.timeline?.milestones || [], ...data.timeline },
    field_visits: Array.isArray(data.field_visits) ? data.field_visits : [],
    technical_notes: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_notes,
      deficiencies: data.technical_notes?.deficiencies || [],
      ...data.technical_notes,
    },
    engineering_delivery: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.engineering_delivery,
      ...data.engineering_delivery,
      safety_scope: mergeSafetyScope(
        data.engineering_delivery?.safety_scope,
        EMPTY_PROJECT_ENGINEERING_DATA.engineering_delivery.safety_scope
      ),
    },
    cd_cover_letter: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.cd_cover_letter,
      ...data.cd_cover_letter,
    },
    final_inspection: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.final_inspection,
      ...data.final_inspection,
      system_completion: data.final_inspection?.system_completion || [],
      observations: data.final_inspection?.observations || [],
    },
    completion_certificate: { ...EMPTY_PROJECT_ENGINEERING_DATA.completion_certificate, ...data.completion_certificate },
    supervision_report: {
      ...EMPTY_SUPERVISION_REPORT,
      ...data.supervision_report,
      months,
      tasks,
    },
    fire_protection_design: data.fire_protection_design
      ? mergeFireProtectionDesign(data.fire_protection_design)
      : { ...EMPTY_FIRE_PROTECTION_DESIGN },
    workflow: { ...(data.workflow || {}) },
  };
}

export function buildFieldVisits(count: number, existing: FieldVisitReport[] = []): FieldVisitReport[] {
  const safeCount = Math.max(1, Math.min(count, 10));
  return Array.from({ length: safeCount }, (_, index) => {
    const visitNumber = index + 1;
    const found = existing.find((v) => v.visit_number === visitNumber);
    return (
      found || {
        visit_number: visitNumber,
        status: 'مسودة',
        checklist: [],
      }
    );
  });
}

export function syncProjectVisitsFromQuotation(
  data: ProjectEngineeringData,
  visitsCount: number
): ProjectEngineeringData {
  return {
    ...data,
    field_visits: buildFieldVisits(visitsCount, data.field_visits),
  };
}

export function seedProjectEngineeringFromClient(
  client: ClientRecord,
  data: ProjectEngineeringData
): ProjectEngineeringData {
  const seeded: ProjectEngineeringData = {
    ...data,
    contract_onboarding: {
      ...EMPTY_CONTRACT_ONBOARDING,
      ...data.contract_onboarding,
      client_name_snapshot: client.name || client.owner_name || '',
      project_name_snapshot: client.business_name || client.name || '',
      contract_value:
        data.contract_onboarding?.contract_value ?? client.quotation_amount ?? null,
      scope_of_work:
        data.contract_onboarding?.scope_of_work ||
        (client.quotation_services || []).join(' · '),
    },
    technical_report: seedTechnicalReportFromClient(client, data.technical_report),
    engineering_delivery: seedEngineeringDelivery(client, data, data.engineering_delivery),
    cd_cover_letter: seedCdCoverLetter(client, data, data.cd_cover_letter),
    final_inspection: seedFinalInspectionReport(client, data, data.final_inspection),
  };
  const withInheritance = applyPipelineInheritance(client, seeded, null);
  return syncKnowledgeLinksToDesignCenterSync(client, withInheritance);
}

export function getProjectReportProgress(
  data: ProjectEngineeringData,
  client?: ClientRecord | null
): number {
  if (client) return workflowProgressPercent(client, data);
  const sections = [
    data.contract_onboarding?.status,
    data.technical_report.status,
    data.building_plan.status,
    data.boq.status,
    data.timeline.status,
    data.technical_notes.status,
    data.engineering_delivery.status,
    data.cd_cover_letter?.status,
    data.final_inspection.status,
    data.completion_certificate.status,
    data.supervision_report?.status,
    ...data.field_visits.map((v) => v.status),
  ];
  const done = sections.filter((s) => s === 'مكتمل' || s === 'معتمد').length;
  return Math.round((done / Math.max(sections.length, 1)) * 100);
}
