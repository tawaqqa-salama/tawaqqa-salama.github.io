import type { ClientRecord } from '@/lib/types/client';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  EMPTY_BUILDING_PLAN,
  EMPTY_TECHNICAL_REPORT,
  type FieldVisitReport,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { mergeBuildingPlanDefaults } from '@/lib/projects/building-plan';
import { seedTechnicalReportFromClient } from '@/lib/projects/technical-report';

export function parseProjectEngineeringData(raw: ClientRecord['project_engineering_data']): ProjectEngineeringData {
  if (!raw || typeof raw !== 'object') {
    return {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      technical_report: { ...EMPTY_TECHNICAL_REPORT },
      field_visits: [],
    };
  }
  const data = raw as Partial<ProjectEngineeringData>;
  return {
    technical_report: { ...EMPTY_TECHNICAL_REPORT, ...data.technical_report },
    building_plan: mergeBuildingPlanDefaults({ ...EMPTY_BUILDING_PLAN, ...data.building_plan }),
    boq: { ...EMPTY_PROJECT_ENGINEERING_DATA.boq, items: data.boq?.items || [], ...data.boq },
    timeline: { ...EMPTY_PROJECT_ENGINEERING_DATA.timeline, milestones: data.timeline?.milestones || [], ...data.timeline },
    field_visits: Array.isArray(data.field_visits) ? data.field_visits : [],
    technical_notes: {
      ...EMPTY_PROJECT_ENGINEERING_DATA.technical_notes,
      deficiencies: data.technical_notes?.deficiencies || [],
      ...data.technical_notes,
    },
    engineering_delivery: { ...EMPTY_PROJECT_ENGINEERING_DATA.engineering_delivery, ...data.engineering_delivery },
    final_inspection: { ...EMPTY_PROJECT_ENGINEERING_DATA.final_inspection, ...data.final_inspection },
    completion_certificate: { ...EMPTY_PROJECT_ENGINEERING_DATA.completion_certificate, ...data.completion_certificate },
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
  return {
    ...data,
    technical_report: seedTechnicalReportFromClient(client, data.technical_report),
  };
}

export function getProjectReportProgress(data: ProjectEngineeringData): number {
  const sections = [
    data.technical_report.status,
    data.building_plan.status,
    data.boq.status,
    data.timeline.status,
    data.technical_notes.status,
    data.engineering_delivery.status,
    data.final_inspection.status,
    data.completion_certificate.status,
    ...data.field_visits.map((v) => v.status),
  ];
  const done = sections.filter((s) => s === 'مكتمل' || s === 'معتمد').length;
  return Math.round((done / Math.max(sections.length, 1)) * 100);
}
