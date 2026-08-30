/**
 * EXISTING final technical report — engineering narrative presentation builders.
 * Deterministic Arabic prose from canonical assessment/engineering data only.
 */

import type { ExistingReportAssessmentInput, ExistingReportPresentationBlock, ExistingReportPresentationStatus } from '@/lib/projects/existing-report-presentation';
import { existingReportStatusBadgeLabel } from '@/lib/projects/existing-report-presentation';
import type { ExistingTechnicalReportModel } from '@/lib/projects/existing-technical-report-model';
import { existingFinalReportRecommendations } from '@/lib/projects/existing-technical-report-model';

const INCOMPLETE_STATUS_LABEL = 'لم يكتمل تقييم هذا البند.';
const PLACEHOLDER_ACTION = 'لم يُسجل إجراء مطلوب.';
const PLACEHOLDER_GAP = 'لم تُسجل فجوة.';
const PLACEHOLDER_REQUIRED = 'لم تُسجل قيمة.';

type EngineeringRow = { label: string; value: string };

export type ExistingReportEngineeringNarrativeItemBlock = {
  type: 'engineering_narrative_item';
  title: string;
  status?: ExistingReportPresentationStatus;
  paragraphs: string[];
  action?: string;
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

function findEngineeringSection(
  sections: Array<{ label: string; rows: EngineeringRow[] }>,
  labelPart: string
) {
  return sections.find((section) => section.label.includes(labelPart));
}

function rowValue(rows: EngineeringRow[], label: string): string | null {
  return cleanText(rows.find((row) => row.label === label)?.value);
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

function pumpNarrativeParagraph(rows: EngineeringRow[]): string | null {
  const parts = [
    rowValue(rows, 'تدفق المضخة الكهربائية') || rowValue(rows, 'ضغط المضخة الكهربائية') ? 'المضخة الكهربائية' : null,
    rowValue(rows, 'تدفق مضخة الديزل') || rowValue(rows, 'ضغط مضخة الديزل') ? 'المضخة الاحتياطية' : null,
    rowValue(rows, 'تدفق مضخة الجوكي') || rowValue(rows, 'ضغط مضخة الجوكي') ? 'مضخة الجوكي' : null,
  ].filter(Boolean) as string[];
  if (parts.length < 2) return null;
  const joinTwo = (items: string[]) => (items.length === 2 ? `${items[0]} و${items[1]}` : `${items.slice(0, -1).join('، ')}، و${items[items.length - 1]}`);
  return ensurePeriod(`تتكون مجموعة مضخات الحريق من ${joinTwo(parts)} وفق القيم المسجلة في بيانات التصميم`);
}

function sprinklerNarrativeParagraph(rows: EngineeringRow[]): string | null {
  const count = rowValue(rows, 'عدد المرشات');
  const kFactor = rowValue(rows, 'معامل K');
  const systemType = rowValue(rows, 'نوع النظام');
  if (!count && !kFactor && !systemType) return null;
  const details = [
    count ? `${count} رشاشًا` : null,
    kFactor ? `بمعامل ${kFactor}` : null,
    systemType ? `من نوع ${systemType}` : null,
  ].filter(Boolean);
  return ensurePeriod(`تم تسجيل نظام رش آلي ضمن المشروع${details.length ? ` بعدد ${details.join('، ')}` : ''}، وفق بيانات التصميم المسجلة للمشروع`);
}

function alarmIntroParagraph(rows: EngineeringRow[]): string {
  const panels = rowValue(rows, 'عدد لوحات الإنذار');
  const smoke = rowValue(rows, 'كواشف الدخان');
  const heat = rowValue(rows, 'كواشف الحرارة');
  const bells = rowValue(rows, 'أجهزة التنبيه');
  const details = [
    panels ? `${panels} لوحة/لوحات إنذار` : null,
    smoke ? `${smoke} كاشف دخان` : null,
    heat ? `${heat} كاشف حرارة` : null,
    bells ? `${bells} جهاز تنبيه` : null,
  ].filter(Boolean);
  if (!details.length) {
    return 'يتضمن نظام إنذار الحريق لوحة/لوحات التحكم وأجهزة الكشف والإنذار المسجلة في بيانات المشروع.';
  }
  return ensurePeriod(`يتضمن نظام إنذار الحريق ${details.join('، ')} وفق البيانات المسجلة في المشروع`);
}

function alarmSummaryTable(rows: EngineeringRow[]): ExistingReportPresentationBlock | null {
  const countLabels: Record<string, string> = {
    'عدد لوحات الإنذار': 'لوحات إنذار الحريق',
    'كواشف الدخان': 'كواشف الدخان',
    'كواشف الحرارة': 'كواشف الحرارة',
    'أجهزة التنبيه': 'أجهزة التنبيه',
  };
  const summaryRows = rows
    .map((row) => {
      const mapped = countLabels[row.label];
      if (!mapped || !/^\d+$/.test(row.value.trim())) return null;
      return [mapped, row.value];
    })
    .filter((row): row is string[] => Boolean(row));
  if (summaryRows.length < 2) return null;
  return {
    type: 'table',
    caption: 'ملخص نظام الإنذار',
    headers: ['العنصر', 'العدد'],
    rows: summaryRows,
  };
}

function pumpSummaryTable(rows: EngineeringRow[]): ExistingReportPresentationBlock | null {
  const pumpMap: Record<string, { flow?: string; pressure?: string }> = {};
  for (const row of rows) {
    const { label, value } = row;
    if (label.includes('كهربائية') && label.includes('تدفق')) pumpMap.electric = { ...pumpMap.electric, flow: value };
    if (label.includes('كهربائية') && label.includes('ضغط')) pumpMap.electric = { ...pumpMap.electric, pressure: value };
    if (label.includes('ديزل') && label.includes('تدفق')) pumpMap.diesel = { ...pumpMap.diesel, flow: value };
    if (label.includes('ديزل') && label.includes('ضغط')) pumpMap.diesel = { ...pumpMap.diesel, pressure: value };
    if (label.includes('جوكي') && label.includes('تدفق')) pumpMap.jockey = { ...pumpMap.jockey, flow: value };
    if (label.includes('جوكي') && label.includes('ضغط')) pumpMap.jockey = { ...pumpMap.jockey, pressure: value };
  }
  const tableRows = [
    pumpMap.electric?.flow || pumpMap.electric?.pressure ? ['كهربائية', pumpMap.electric?.flow || '—', pumpMap.electric?.pressure || '—'] : null,
    pumpMap.diesel?.flow || pumpMap.diesel?.pressure ? ['ديزل', pumpMap.diesel?.flow || '—', pumpMap.diesel?.pressure || '—'] : null,
    pumpMap.jockey?.flow || pumpMap.jockey?.pressure ? ['جوكي', pumpMap.jockey?.flow || '—', pumpMap.jockey?.pressure || '—'] : null,
  ].filter((row): row is string[] => Boolean(row));
  if (tableRows.length < 2) return null;
  return {
    type: 'table',
    caption: 'مضخات الحريق',
    headers: ['نوع المضخة', 'التدفق', 'الضغط'],
    rows: tableRows,
  };
}

export function buildFireProtectionNarrative(
  systems: ExistingReportAssessmentInput[],
  engineeringSections: Array<{ label: string; rows: EngineeringRow[] }> = []
): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [];
  const pumps = findEngineeringSection(engineeringSections, 'مضخات');
  const sprinkler = findEngineeringSection(engineeringSections, 'الرش');
  const pumpParagraph = pumps ? pumpNarrativeParagraph(pumps.rows) : null;
  if (pumpParagraph) blocks.push({ type: 'paragraph', text: pumpParagraph });
  if (pumps) {
    const table = pumpSummaryTable(pumps.rows);
    if (table) blocks.push(table);
  }
  const sprinklerParagraph = sprinkler ? sprinklerNarrativeParagraph(sprinkler.rows) : null;
  if (sprinklerParagraph) blocks.push({ type: 'paragraph', text: sprinklerParagraph });
  for (const item of systems) blocks.push(buildNarrativeItem(item));
  return blocks;
}

export function buildFireAlarmNarrative(
  systems: ExistingReportAssessmentInput[],
  engineeringSections: Array<{ label: string; rows: EngineeringRow[] }> = []
): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [];
  const alarm = findEngineeringSection(engineeringSections, 'إنذار');
  if (alarm) {
    blocks.push({ type: 'paragraph', text: alarmIntroParagraph(alarm.rows) });
    const table = alarmSummaryTable(alarm.rows);
    if (table) blocks.push(table);
  }
  for (const item of systems) blocks.push(buildNarrativeItem(item));
  return blocks;
}

export function buildLifeSafetyNarrative(systems: ExistingReportAssessmentInput[]): ExistingReportPresentationBlock[] {
  return [
    {
      type: 'paragraph',
      text: 'تمت مراجعة متطلبات سلامة الحياة والإخلاء وفق البيانات والمخططات المسجلة للمشروع، وتشمل إنارة الطوارئ ولوحات مخارج الطوارئ ومسارات الهروب والأنظمة المرتبطة بالتحكم بالدخان عند انطباقها.',
    },
    ...systems.map((item) => buildNarrativeItem(item)),
  ];
}

export function buildElectricalSafetyNarrative(systems: ExistingReportAssessmentInput[]): ExistingReportPresentationBlock[] {
  const blocks: ExistingReportPresentationBlock[] = [];
  if (systems.length) {
    blocks.push({
      type: 'paragraph',
      text: 'تمت مراجعة متطلبات السلامة الكهربائية والقدرة الاحتياطية وفق البيانات المسجلة في ملف المشروع.',
    });
  }
  for (const item of systems) blocks.push(buildNarrativeItem(item));
  return blocks;
}

export function buildSiteAssessmentNarrative(systems: ExistingReportAssessmentInput[]): ExistingReportPresentationBlock[] {
  return systems.map((item) => buildNarrativeItem(item));
}

export function buildEngineeringGroupNarrativeBlocks(
  groupId: string,
  systems: ExistingReportAssessmentInput[],
  engineeringSections: Array<{ label: string; rows: EngineeringRow[] }> = []
): ExistingReportPresentationBlock[] {
  switch (groupId) {
    case 'firefighting':
      return buildFireProtectionNarrative(systems, engineeringSections);
    case 'alarm':
      return buildFireAlarmNarrative(systems, engineeringSections);
    case 'life_safety':
      return buildLifeSafetyNarrative(systems);
    case 'electrical':
      return buildElectricalSafetyNarrative(systems);
    case 'site':
    default:
      return buildSiteAssessmentNarrative(systems);
  }
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
