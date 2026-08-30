import type { ExistingReportPresentationBlock } from '@/lib/projects/existing-report-presentation';

type EngineeringRow = { label: string; value: string };

function cleanText(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result || null;
}

function rowValue(rows: EngineeringRow[], label: string): string | null {
  return cleanText(rows.find((row) => row.label === label)?.value);
}

export function pumpSummaryTable(rows: EngineeringRow[]): ExistingReportPresentationBlock | null {
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
  if (tableRows.length < 1) return null;
  return {
    type: 'table',
    caption: 'مضخات الحريق',
    headers: ['نوع المضخة', 'التدفق', 'الضغط'],
    rows: tableRows,
  };
}

export function sprinklerSummaryTable(rows: EngineeringRow[]): ExistingReportPresentationBlock | null {
  const summaryRows = [
    rowValue(rows, 'عدد المرشات') ? ['عدد المرشات', rowValue(rows, 'عدد المرشات')!] : null,
    rowValue(rows, 'معامل K') ? ['معامل K', rowValue(rows, 'معامل K')!] : null,
    rowValue(rows, 'نوع النظام') ? ['نوع النظام', rowValue(rows, 'نوع النظام')!] : null,
    rowValue(rows, 'نوع المرشات') ? ['نوع المرشات', rowValue(rows, 'نوع المرشات')!] : null,
  ].filter((row): row is string[] => Boolean(row));
  if (summaryRows.length < 2) return null;
  return {
    type: 'table',
    caption: 'نظام الرش الآلي',
    headers: ['البند', 'البيان'],
    rows: summaryRows,
  };
}

export function alarmSummaryTable(rows: EngineeringRow[]): ExistingReportPresentationBlock | null {
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

export const EXISTING_REPORT_ENGINEERING_SUMMARY_CAPTIONS = [
  'مضخات الحريق',
  'نظام الرش الآلي',
  'ملخص نظام الإنذار',
  'مقاييس الإخلاء',
  'إمداد مياه الإطفاء والخزان',
] as const;
