import type { CompanyProfile } from '@/lib/company-profile';
import {
  UNDER_CONSTRUCTION_SOURCE_LABELS,
  UNDER_CONSTRUCTION_STUDY_GROUPS,
  resolveUnderConstructionProjectReferences,
  resolveUnderConstructionSystemReferences,
  type UnderConstructionCodeReference,
  type UnderConstructionReferenceSource,
  type UnderConstructionStudySystem,
  type UnderConstructionSystemDefinition,
  type UnderConstructionSystemKey,
} from '@/lib/projects/under-construction-study';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export type UnderConstructionTechnicalReportValue = {
  label: string;
  value: string;
  source: UnderConstructionReferenceSource;
  source_label: string;
  reference: string | null;
};

export type UnderConstructionTechnicalReportSystem = {
  system_key: UnderConstructionSystemKey;
  system_label: string;
  applicable: boolean | null;
  code_requirement: string | null;
  selected_solution: string | null;
  code_reference: string | null;
  drawing_reference: string | null;
  calculation_reference: string | null;
  implementation_note: string | null;
  canonical_references: UnderConstructionTechnicalReportValue[];
};

export type UnderConstructionTechnicalReportSection = {
  id: string;
  label: string;
  systems: UnderConstructionTechnicalReportSystem[];
};

export type UnderConstructionTechnicalReportCodeReference = {
  id: string;
  title: string;
  reference: string;
  note: string | null;
  source: 'UNDER_CONSTRUCTION_STUDY' | 'FIRE_PROTECTION_DESIGN';
  source_label: string;
};

export type UnderConstructionTechnicalReportImplementationNote = {
  id: string;
  text: string;
  system_key?: UnderConstructionSystemKey;
  system_label?: string;
};

export type UnderConstructionTechnicalReportModel = {
  project_identity: {
    project_code: string | null;
    project_classification: 'UNDER_CONSTRUCTION';
  };
  project_information: {
    project_name: string;
    owner: string | null;
    location: string | null;
    report_number: string | null;
    report_date: string | null;
    consulting_office: string | null;
  };
  introduction: string;
  study_scope: string | null;
  project_references: UnderConstructionTechnicalReportValue[];
  code_references: UnderConstructionTechnicalReportCodeReference[];
  report_sections: UnderConstructionTechnicalReportSection[];
  implementation_notes: UnderConstructionTechnicalReportImplementationNote[];
  limitations: string[];
};

/**
 * Traceable source matrix for the UNDER_CONSTRUCTION preview. It is metadata for
 * display/review only; all facts continue to be read at runtime from their canonical paths.
 */
export const UNDER_CONSTRUCTION_REPORT_SECTION_SOURCE_MATRIX = [
  {
    section: 'بيانات التقرير والمشروع',
    sources: ['project identity', 'ClientRecord', 'building_plan', 'design_center.space_safety'],
  },
  {
    section: 'الأكواد والمراجع',
    sources: ['under_construction_study.code_references', 'fire_protection_design.applicable_codes'],
  },
  {
    section: 'الوصول والإخلاء',
    sources: ['under_construction_study.systems', 'building_plan', 'fire_protection_design', 'design_center.space_safety'],
  },
  {
    section: 'أنظمة مكافحة الحريق',
    sources: ['under_construction_study.systems', 'fire_protection_design', 'design_center.space_safety', 'hydraulic calculation outputs'],
  },
  {
    section: 'نظام إنذار الحريق',
    sources: ['under_construction_study.systems', 'building_plan', 'fire_protection_design', 'design_center.space_safety'],
  },
  {
    section: 'السلامة الميكانيكية والكهربائية',
    sources: ['under_construction_study.systems', 'building_plan', 'fire_protection_design'],
  },
] as const;

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text || null;
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const itemKey = key(item);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}

function locationFromClient(client: ClientRecord): string | null {
  return [client.city, client.district, client.street, client.plot_number ? `قطعة ${client.plot_number}` : null]
    .map(cleanText)
    .filter((value): value is string => Boolean(value))
    .join(' — ') || null;
}

function reportValue(value: {
  label: string;
  value: string;
  source: UnderConstructionReferenceSource;
  reference?: string;
}): UnderConstructionTechnicalReportValue {
  return {
    label: value.label,
    value: value.value,
    source: value.source,
    source_label: UNDER_CONSTRUCTION_SOURCE_LABELS[value.source],
    reference: value.reference || null,
  };
}

function hasStudyDecision(system: UnderConstructionStudySystem): boolean {
  return Boolean(
    system.code_requirement ||
      system.selected_solution ||
      system.code_reference ||
      system.drawing_reference ||
      system.calculation_reference ||
      system.implementation_note ||
      typeof system.applicable === 'boolean'
  );
}

function reportSystem(
  definition: UnderConstructionSystemDefinition,
  system: UnderConstructionStudySystem,
  data: ProjectEngineeringData
): UnderConstructionTechnicalReportSystem {
  return {
    system_key: definition.key,
    system_label: definition.label,
    applicable: typeof system.applicable === 'boolean' ? system.applicable : null,
    code_requirement: cleanText(system.code_requirement),
    selected_solution: cleanText(system.selected_solution),
    code_reference: cleanText(system.code_reference),
    drawing_reference: cleanText(system.drawing_reference),
    calculation_reference: cleanText(system.calculation_reference),
    implementation_note: cleanText(system.implementation_note),
    canonical_references: resolveUnderConstructionSystemReferences(data, definition.key).map(reportValue),
  };
}

function reportSections(data: ProjectEngineeringData): UnderConstructionTechnicalReportSection[] {
  const systems = data.under_construction_study?.systems || {};
  return UNDER_CONSTRUCTION_STUDY_GROUPS
    .filter((group) => group.id !== 'project')
    .map((group) => ({
      id: group.id,
      label: group.label,
      systems: group.systems.flatMap((definition) => {
        const system = systems[definition.key];
        // Only an explicit study decision can introduce a system into the report.
        // A non-applicable system is intentionally omitted rather than made into an empty section.
        if (!system || system.applicable === false || !hasStudyDecision(system)) return [];
        return [reportSystem(definition, system, data)];
      }),
    }))
    .filter((section) => section.systems.length > 0);
}

function codeReferences(data: ProjectEngineeringData): UnderConstructionTechnicalReportCodeReference[] {
  const studyReferences = (data.under_construction_study?.code_references || []).map(
    (item: UnderConstructionCodeReference) => ({
      id: `study:${item.id}`,
      title: item.title,
      reference: item.reference,
      note: cleanText(item.note),
      source: 'UNDER_CONSTRUCTION_STUDY' as const,
      source_label: 'دراسة المشروع قيد الإنشاء',
    })
  );
  const designReferences = (data.fire_protection_design?.applicable_codes || [])
    .map(cleanText)
    .filter((item): item is string => Boolean(item))
    .map((reference) => ({
      id: `design:${reference}`,
      title: 'الكود أو المرجع المعتمد للتصميم',
      reference,
      note: null,
      source: 'FIRE_PROTECTION_DESIGN' as const,
      source_label: 'التصميم المعتمد',
    }));
  return unique([...studyReferences, ...designReferences], (item) => `${item.title}:${item.reference}`);
}

function implementationNotes(
  sections: UnderConstructionTechnicalReportSection[],
  data: ProjectEngineeringData
): UnderConstructionTechnicalReportImplementationNote[] {
  const notes: UnderConstructionTechnicalReportImplementationNote[] = [];
  const general = cleanText(data.under_construction_study?.general_implementation_notes);
  if (general) notes.push({ id: 'general', text: general });
  for (const section of sections) {
    for (const system of section.systems) {
      if (!system.implementation_note) continue;
      notes.push({
        id: `system:${system.system_key}`,
        text: system.implementation_note,
        system_key: system.system_key,
        system_label: system.system_label,
      });
    }
  }
  return unique(notes, (item) => `${item.system_key || 'general'}:${item.text}`);
}

/**
 * Pure derived view for the UNDER_CONSTRUCTION technical-report preview.
 * It reads only canonical project/design values and explicit engineer study decisions;
 * it does not persist a report, infer applicability, create requirements, or select a route.
 */
export function buildUnderConstructionTechnicalReportModel(
  client: ClientRecord,
  data: ProjectEngineeringData,
  company?: Pick<CompanyProfile, 'name' | 'legal_name'> | null
): UnderConstructionTechnicalReportModel {
  const sections = reportSections(data);
  const technical = data.technical_report;
  const projectName = cleanText(client.business_name) || cleanText(client.name) || 'مشروع غير مسمى';

  return {
    project_identity: {
      project_code: client.primary_engineering_project_identity?.projectCode || null,
      project_classification: 'UNDER_CONSTRUCTION',
    },
    project_information: {
      project_name: projectName,
      owner: cleanText(client.owner_name),
      location: locationFromClient(client),
      report_number: cleanText(technical.outgoing_number),
      report_date: cleanText(technical.report_date) || cleanText(data.building_plan.report_date),
      consulting_office: cleanText(company?.legal_name) || cleanText(company?.name),
    },
    introduction:
      'تعرض هذه المعاينة متطلبات دراسة المشروع قيد الإنشاء والحلول التصميمية ومراجع المخططات والحسابات وتعليمات التنفيذ التي سجلها المهندس. لا تمثل معاينة موقع قائم أو حكمًا آليًا بالمطابقة أو اعتمادًا نهائيًا.',
    study_scope: cleanText(data.under_construction_study?.project_description),
    project_references: resolveUnderConstructionProjectReferences(client, data).map(reportValue),
    code_references: codeReferences(data),
    report_sections: sections,
    implementation_notes: implementationNotes(sections, data),
    limitations: [
      'هذه المعاينة قراءة فقط ومشتقة من دراسة المشروع والمصادر الكانونية المتاحة وقت العرض.',
      'لا تنشئ المعاينة متطلبًا أو حلًا أو افتراضًا هندسيًا عند غياب بيانات صريحة.',
      'تظل نتائج التدفق والضغط وسعة الخزان وكميات الأنظمة في مصادر التصميم والحسابات الأصلية ولا تُحفظ في نموذج التقرير.',
      'لا تشكل المعاينة اعتمادًا من الدفاع المدني أو تصريحًا بالتنفيذ أو شهادة مطابقة نهائية.',
    ],
  };
}
