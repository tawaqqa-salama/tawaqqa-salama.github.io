/**
 * EXISTING final technical report — engineering narrative presentation builders.
 * Deterministic Arabic prose from canonical assessment/engineering data only.
 */

import {
  alarmSummaryTable,
  pumpSummaryTable,
  sprinklerSummaryTable,
} from '@/lib/projects/existing-report-engineering-tables';
import type { ExistingReportAssessmentInput, ExistingReportPresentationBlock, ExistingReportPresentationStatus } from '@/lib/projects/existing-report-presentation';
import { existingReportStatusBadgeLabel } from '@/lib/projects/existing-report-presentation';
import type { ExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { existingFinalReportRecommendations } from '@/lib/projects/existing-technical-report-model';

const INCOMPLETE_STATUS_LABEL = 'لم يكتمل تقييم هذا البند.';
const PLACEHOLDER_ACTION = 'لم يُسجل إجراء مطلوب.';
const PLACEHOLDER_GAP = 'لم تُسجل فجوة.';
const PLACEHOLDER_REQUIRED = 'لم تُسجل قيمة.';

type EngineeringRow = { label: string; value: string };
type EngineeringSection = { label: string; rows: EngineeringRow[] };

export type ExistingReportEngineeringNarrativeItemBlock = {
  type: 'engineering_narrative_item';
  title: string;
  status?: ExistingReportPresentationStatus;
  paragraphs: string[];
};

function cleanText(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result || null;
}

function endsWithPeriod(value: string): boolean {
  return /[.!?]$/.test(value.trim());
}

function ensurePeriod(value: string): string {
  return endsWithPeriod(value) ? value : `${value}.`;
}

function paragraphContains(needle: string, paragraphs: string[]): boolean {
  const normalized = needle.replace(/\s+/g, ' ').trim();
  return paragraphs.some((paragraph) => paragraph.replace(/\s+/g, ' ').includes(normalized));
}

function isPlaceholder(value: string | null | undefined, placeholders: string[]): boolean {
  const text = cleanText(value);
  if (!text) return true;
  return placeholders.includes(text);
}

function findEngineeringSection(sections: EngineeringSection[], labelPart: string) {
  return sections.find((section) => section.label.includes(labelPart));
}

function rowValue(rows: EngineeringRow[], label: string): string | null {
  return cleanText(rows.find((row) => row.label === label)?.value);
}

function joinArabicList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} و${items[1]}`;
  return `${items.slice(0, -1).join('، ')}، و${items[items.length - 1]}`;
}

function buildItemParagraphs(item: ExistingReportAssessmentInput): string[] {
  const paragraphs: string[] = [];
  const existing = cleanText(item.existing_condition);
  const required = cleanText(item.required_condition);
  const gap = cleanText(item.gap);
  const notes = cleanText(item.notes);

  if (existing) paragraphs.push(ensurePeriod(existing));
  if (required && !isPlaceholder(required, [PLACEHOLDER_REQUIRED]) && !paragraphContains(required, paragraphs)) {
    paragraphs.push(ensurePeriod(required));
  }
  if (gap && !isPlaceholder(gap, [PLACEHOLDER_GAP]) && !paragraphContains(gap, paragraphs)) {
    paragraphs.push(ensurePeriod(`تُظهر المراجعة فجوة مسجلة: ${gap}`));
  }
  if (notes && !paragraphContains(notes, paragraphs)) {
    paragraphs.push(ensurePeriod(notes));
  }
  if (!paragraphs.length) paragraphs.push(INCOMPLETE_STATUS_LABEL);
  return paragraphs;
}

function buildNarrativeItem(item: ExistingReportAssessmentInput): ExistingReportEngineeringNarrativeItemBlock {
  return {
    type: 'engineering_narrative_item',
    title: item.system_label,
    status: item.compliance_status === 'INCOMPLETE' ? undefined : item.compliance_status,
    paragraphs: buildItemParagraphs(item),
  };
}

function fireProtectionIntro(sections: EngineeringSection[], systems: ExistingReportAssessmentInput[]): string {
  const components: string[] = [];
  if (findEngineeringSection(sections, 'خزان') || systems.some((item) => /خزان|مياه/.test(item.system_label))) {
    components.push('منظومة مياه الحريق');
  }
  if (findEngineeringSection(sections, 'مضخات') || systems.some((item) => /مضخ/.test(item.system_label))) {
    components.push('مضخات الحريق');
  }
  if (findEngineeringSection(sections, 'الرش') || systems.some((item) => /رش/.test(item.system_label))) {
    components.push('أنظمة الرش الآلي');
  }
  if (systems.some((item) => /خرطوم|صنبور|standpipe|وصل/i.test(item.system_label))) {
    components.push('شبكة المواسير والتجهيزات المرتبطة');
  }
  const suffix = components.length
    ? `، وتشمل ${joinArabicList(components)}`
    : '';
  return ensurePeriod(`تمت مراجعة أنظمة الإطفاء ومكافحة الحريق بالمشروع استنادًا إلى البيانات والمخططات المسجلة في ملف المشروع${suffix}`);
}

function fireAlarmIntro(sections: EngineeringSection[]): string {
  const alarm = findEngineeringSection(sections, 'إنذار');
  const table = alarm ? alarmSummaryTable(alarm.rows) : null;
  if (table) {
    return 'تشير بيانات المشروع المسجلة إلى وجود منظومة إنذار حريق وفق المخططات والبيانات المتاحة في ملف المشروع.';
  }
  const panels = alarm ? rowValue(alarm.rows, 'عدد لوحات الإنذار') : null;
  const smoke = alarm ? rowValue(alarm.rows, 'كواشف الدخان') : null;
  const heat = alarm ? rowValue(alarm.rows, 'كواشف الحرارة') : null;
  const bells = alarm ? rowValue(alarm.rows, 'أجهزة التنبيه') : null;
  const details = [
    panels ? `${panels} لوحة/لوحات إنذار` : null,
    smoke ? `${smoke} كاشف دخان` : null,
    heat ? `${heat} كاشف حرارة` : null,
    bells ? `${bells} جهاز تنبيه` : null,
  ].filter(Boolean);
  if (!details.length) {
    return 'يتضمن نظام إنذار الحريق لوحة/لوحات التحكم وأجهزة الكشف والإنذار المسجلة في بيانات المشروع.';
  }
  return ensurePeriod(`تشير بيانات المشروع المسجلة إلى وجود منظومة إنذار حريق تتكون من ${details.join('، ')}`);
}

function lifeSafetyIntro(systems: ExistingReportAssessmentInput[], sections: EngineeringSection[]): string {
  const topics = systems.map((item) => item.system_label);
  const egress = findEngineeringSection(sections, 'مقاييس');
  const exitCount = egress ? rowValue(egress.rows, 'إجمالي المخارج') : null;
  const base = 'تمت مراجعة متطلبات سلامة الحياة والإخلاء وفق البيانات والمخططات المسجلة للمشروع';
  if (topics.length) {
    return ensurePeriod(`${base}، وتشمل ${joinArabicList(topics)}`);
  }
  if (exitCount) {
    return ensurePeriod(`${base}، ويبلغ عدد مخارج الهروب المسجل ${exitCount} وفق البيانات المتاحة`);
  }
  return ensurePeriod(`${base}، وتشمل إنارة الطوارئ ولوحات مخارج الطوارئ ومسارات الهروب والأنظمة المرتبطة بالتحكم بالدخان عند انطباقها`);
}

function electricalIntro(systems: ExistingReportAssessmentInput[]): string {
  if (!systems.length) return '';
  const topics = systems.map((item) => item.system_label);
  return ensurePeriod(`تمت مراجعة متطلبات ${joinArabicList(topics)} وفق البيانات المسجلة في ملف المشروع`);
}

export function buildFireProtectionNarrative(
  systems: ExistingReportAssessmentInput[],
  engineeringSections: EngineeringSection[] = []
): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [
    { type: 'paragraph', text: fireProtectionIntro(engineeringSections, systems) },
  ];
  const pumps = findEngineeringSection(engineeringSections, 'مضخات');
  if (pumps) {
    const table = pumpSummaryTable(pumps.rows);
    if (table) blocks.push(table);
  }
  const sprinkler = findEngineeringSection(engineeringSections, 'الرش');
  if (sprinkler) {
    const table = sprinklerSummaryTable(sprinkler.rows);
    if (table) blocks.push(table);
  }
  for (const item of systems) blocks.push(buildNarrativeItem(item));
  return blocks;
}

export function buildFireAlarmNarrative(
  systems: ExistingReportAssessmentInput[],
  engineeringSections: EngineeringSection[] = []
): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [];
  const alarm = findEngineeringSection(engineeringSections, 'إنذار');
  blocks.push({ type: 'paragraph', text: fireAlarmIntro(engineeringSections) });
  if (alarm) {
    const table = alarmSummaryTable(alarm.rows);
    if (table) blocks.push(table);
  }
  for (const item of systems) blocks.push(buildNarrativeItem(item));
  return blocks;
}

export function buildLifeSafetyNarrative(
  systems: ExistingReportAssessmentInput[],
  engineeringSections: EngineeringSection[] = []
): ExistingReportPresentationBlock[] {
  return [
    { type: 'paragraph', text: lifeSafetyIntro(systems, engineeringSections) },
    ...systems.map((item) => buildNarrativeItem(item)),
  ];
}

export function buildElectricalSafetyNarrative(systems: ExistingReportAssessmentInput[]): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [];
  const intro = electricalIntro(systems);
  if (intro) blocks.push({ type: 'paragraph', text: intro });
  for (const item of systems) blocks.push(buildNarrativeItem(item));
  return blocks;
}

export function buildSiteAssessmentNarrative(systems: ExistingReportAssessmentInput[]): ExistingReportPresentationBlock[] {
  return systems.map((item) => buildNarrativeItem(item));
}

export function buildEngineeringGroupNarrativeBlocks(
  groupId: string,
  systems: ExistingReportAssessmentInput[],
  engineeringSections: EngineeringSection[] = []
): ExistingReportPresentationBlock[] {
  switch (groupId) {
    case 'firefighting':
      return buildFireProtectionNarrative(systems, engineeringSections);
    case 'alarm':
      return buildFireAlarmNarrative(systems, engineeringSections);
    case 'life_safety':
      return buildLifeSafetyNarrative(systems, engineeringSections);
    case 'electrical':
      return buildElectricalSafetyNarrative(systems);
    case 'site':
    default:
      return buildSiteAssessmentNarrative(systems);
  }
}

export function collectPresentedEngineeringCaptions(model: ExistingTechnicalReportModel): Set<string> {
  const captions = new Set<string>();
  for (const group of model.assessment_sections) {
    const blocks = buildEngineeringGroupNarrativeBlocks(group.id, group.systems, model.engineering_sections);
    for (const block of blocks) {
      if (block.type === 'table') captions.add(block.caption);
    }
  }
  return captions;
}

export function buildEngineeringActionsNarrative(model: ExistingTechnicalReportModel): ExistingReportPresentationBlock[] {
  const actions: string[] = [];
  for (const group of model.assessment_sections) {
    for (const system of group.systems) {
      const action = cleanText(system.required_action);
      if (!action || isPlaceholder(action, [PLACEHOLDER_ACTION])) continue;
      if (system.compliance_status === 'COMPLIANT' || system.compliance_status === 'NOT_APPLICABLE') continue;
      const line = `${system.system_label}: ${action}`;
      if (!actions.includes(line)) actions.push(line);
    }
  }
  for (const item of existingFinalReportRecommendations(model)) {
    if (!actions.includes(item.text)) actions.push(item.text);
  }
  if (!actions.length) {
    return [{ type: 'paragraph', text: 'لم تُسجل إجراءات تصحيحية إضافية ضمن بيانات التقييم الحالية.' }];
  }
  return [{ type: 'numbered_list', items: actions }];
}

export function buildEngineeringReferences(
  model: ExistingTechnicalReportModel
): ExistingReportPresentationBlock[] {
  const refs = new Set<string>();
  for (const basis of model.assessment_basis) {
    const reference = cleanText(basis.reference);
    if (reference) refs.add(reference);
  }
  for (const group of model.assessment_sections) {
    for (const system of group.systems) {
      const reference = cleanText(system.requirement_reference);
      if (reference) refs.add(reference);
    }
  }
  const items = [...refs];
  if (!items.length) return [];
  return [{ type: 'reference_list', items }];
}

export const EXISTING_REPORT_CHECKLIST_LABELS = [
  'الوضع الراهن:',
  'المطلوب:',
  'المتطلب:',
  'التقييم:',
  'الإجراء المطلوب:',
  'المرجع:',
] as const;

export function existingReportStatusLabelForNarrative(status: ExistingReportPresentationStatus): string {
  return existingReportStatusBadgeLabel(status);
}
