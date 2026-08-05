/**
 * Building permit (رخصة البناء) text extraction + field parsing.
 * Uses local PDF text sniffing / regex first; Vision API when configured server-side.
 */

import type { FloorLevel } from '@/lib/types/client';
import {
  classifyFloorName,
  mapPermitUsageToActivityType,
  resolveFloorLevelsFromPermit,
  type PermitFloorRow,
} from '@/lib/projects/permit-floors-activity';
import {
  buildFloorsFromAreaList,
  ensureFloorRowLabels,
  extractBaladyContentsFloorAreas,
  floorsCountFromFuzzyLabel,
  landAreaFromLooseBlock,
  mergeFloorRows,
  normalizePermitOcrText,
} from '@/lib/projects/balady-permit-floors';

export type BuildingPermitExtraction = {
  permitNumber: string | null;
  permitDateGregorian: string | null;
  permitDateHijri: string | null;
  ownerName: string | null;
  district: string | null;
  city: string | null;
  street: string | null;
  plotNumber: string | null;
  municipality: string | null;
  commercialRegister: string | null;
  phone: string | null;
  landAreaM2: string | null;
  /** إجمالي مساحة البناء (م²) إن وُجدت في الرخصة */
  buildingAreaM2: string | null;
  /** عدد الأدوار من الرخصة */
  floorsCount: number | null;
  /** نص الاستخدام كما في الرخصة (مثل: رخصة بناء مبنى تجاري) */
  usageLabel: string | null;
  /** مفتاح النشاط في النظام بعد المطابقة */
  activityType: string | null;
  /** تفصيل الأدوار إن أمكن استخراجه من جدول محتويات المبنى */
  floors: PermitFloorRow[] | null;
  nationalAddress: string | null;
  locationSummary: string | null;
  rawTextPreview?: string;
  source: 'vision' | 'pdf_text' | 'regex' | 'filename' | 'tesseract' | 'none';
  confidence: 'high' | 'medium' | 'low';
};

const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabicDigits(input: string): string {
  return String(input || '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/[٠-٩]/g, (d) => String(EASTERN_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
}

function cleanLabelValue(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[:：\-\s]+/, '')
    .replace(/[\u200f\u200e]/g, '')
    .trim();
}

function pickLabeledValue(text: string, labels: RegExp[]): string | null {
  const normalized = normalizeArabicDigits(text);
  for (const label of labels) {
    const re = new RegExp(
      `${label.source}\\s*[:：]?\\s*([^\\n\\r|]{2,80})`,
      label.flags.includes('i') ? 'imu' : 'mu'
    );
    const match = normalized.match(re);
    if (match?.[1]) {
      const value = cleanLabelValue(match[1]);
      if (value && value !== '-' && value !== '—') return value;
    }
  }
  return null;
}

/** Convert common Gregorian date strings to YYYY-MM-DD when possible */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = normalizeArabicDigits(value)
    .replace(/[^\d\/\-.]/g, ' ')
    .trim()
    .split(/\s+/)[0];
  const iso = v.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (iso) {
    const y = Number(iso[1]);
    if (y >= 1900 && y <= 2100) {
      return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }
  }
  const dmy = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const y = Number(dmy[3]);
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (y >= 1900 && y <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
  }
  return null;
}

function looksHijri(value: string): boolean {
  const iso = normalizeArabicDigits(value).match(/(\d{4})/);
  if (!iso) return false;
  const y = Number(iso[1]);
  return y >= 1300 && y <= 1600;
}

function looksGregorianDate(value: string): boolean {
  return Boolean(toIsoDate(value));
}

function normalizePlaceLite(value: string): string {
  return String(value || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '');
}

function isLikelyFieldLabel(value: string): boolean {
  const v = normalizePlaceLite(value);
  if (
    /^(البلديه|رقمالكروكي|رقالمخطط|رقمالقطعه|القطعه|الحي|اسمالشارع|الشارع|مساحهالارض|مساحهالار|رقمالسجل|اسمصاحبالرخصه|الاستخدام|التاريخ|صلاحيتها|رقمالصك|تاريخالصك|الجهه|الحدود|الارتداد)$/.test(
      v
    )
  ) {
    return true;
  }
  // Short fragments that are clearly labels, not person/place values
  return /^(رقم|اسم|تاريخ|صلاح)/.test(v) && v.length <= 12;
}

/** Common Tesseract confusions on Balady Arabic names / districts */
function fixArabicOcrText(value: string): string {
  return value
    .replace(/قائز/g, 'فايز')
    .replace(/صالج/g, 'صالح')
    .replace(/الجارثي/g, 'الحارثي')
    .replace(/التهضة|التهضه/g, 'النهضة')
    .trim();
}

function splitNonEmptyLines(block: string): string[] {
  return block
    .split(/\n+/)
    .map((line) => cleanLabelValue(line.replace(/[\u200f\u200e\u00a0]/g, '')))
    .filter((line) => line.length >= 1 && line !== '|' && !/^[\u060c,.]+$/.test(line));
}

/**
 * Balady scanned OCR often dumps labels in one column then values in the next:
 * البلدية / رقم الكروكي / ... / مساحة الار   then   ابحر الفرعية / ... / 595.50
 */
function extractBaladyLocationColumns(text: string): {
  municipality: string | null;
  plotNumber: string | null;
  district: string | null;
  street: string | null;
  landAreaM2: string | null;
} | null {
  const normalized = normalizeArabicDigits(text);
  const block = normalized.match(
    /البلدية\s*\n+\s*رقم\s*الكروكي\s*\n+\s*رقم\s*المخطط\s*\n+\s*(?:رقم\s*)?القطعة\s*\n+\s*الحي\s*\n+\s*اسم\s*الشارع\.?\s*\n+\s*مساحة\s*الار[ض]?\.?\s*\n+([\s\S]{8,500}?)(?:\n\s*الجهة|\n\s*الحدود|\n\s*الارتداد|\n\s*جميع\s*التعهد)/u
  );
  if (!block?.[1]) return null;

  const lines = splitNonEmptyLines(block[1]).filter((line) => !isLikelyFieldLabel(line));
  if (lines.length < 5) return null;

  const municipality = lines[0] || null;
  const plotNumber = (lines[3] || '').match(/[A-Za-z0-9][A-Za-z0-9\/\-]*/)?.[0] || null;
  let district = lines[4] || null;
  if (district && /تهضه|تهضة|نهضه|نهضة/.test(normalizePlaceLite(district))) {
    district = 'النهضة';
  } else if (district) {
    district = fixArabicOcrText(district);
  }
  const street = lines[5] ? fixArabicOcrText(lines[5]) : null;
  const landAreaM2 = (lines[6] || '').match(/[\d]+(?:[.,]\d+)?/)?.[0]?.replace(/,/g, '') || null;

  return { municipality, plotNumber, district, street, landAreaM2 };
}

/** Owner + CR column block after اسم صاحب الرخصة / رقم السجل */
function extractBaladyOwnerColumns(text: string): {
  ownerName: string | null;
  commercialRegister: string | null;
} | null {
  const normalized = normalizeArabicDigits(text);
  const block = normalized.match(
    /اسم\s*صاحب\s*الرخص[ةه]\s*\n+\s*رقم\s*السجل\s*\n+([\s\S]{5,280}?)(?:\n\s*جوال|\n\s*البلدية|\n\s*رقم\s*الكروكي)/u
  );
  if (!block?.[1]) return null;

  const lines = splitNonEmptyLines(block[1]);
  let ownerName: string | null = null;
  let commercialRegister: string | null = null;

  for (const line of lines) {
    if (isLikelyFieldLabel(line)) continue;
    if (/^رخصة\s*بناء/.test(line)) continue;
    if (!commercialRegister) {
      const cr = line.match(/\b(\d{8,15})\b/)?.[1];
      if (cr && !cr.startsWith('05')) {
        commercialRegister = cr;
        continue;
      }
    }
    if (!ownerName && /[\u0600-\u06FF]{3,}/.test(line) && !/\d{6,}/.test(line)) {
      ownerName = fixArabicOcrText(line);
    }
  }

  if (!ownerName && !commercialRegister) return null;
  return { ownerName, commercialRegister };
}

const HIJRI_MONTH =
  '(?:محرم|صفر|ربيع\\s*الأول|ربيع\\s*الثاني|ربيع\\s*آخر|جمادى\\s*الأولى|جمادى\\s*الأول|جمادي\\s*الأول|جمادى\\s*الثانية|جمادى\\s*آخر|رجب|شعبان|رمضان|شوال|ذو\\s*القعدة|ذي\\s*القعدة|ذو\\s*الحجة|ذي\\s*الحجة|إ?جمادي|جمادي)';

/** Parse Hijri forms like 9/جمادي الأول/1442 or OCR-split lines */
export function parseHijriDate(text: string): string | null {
  const normalized = normalizeArabicDigits(text).replace(/\s+/g, ' ');
  const named = normalized.match(
    new RegExp(`(\\d{1,2})\\s*[\\/\\-.]?\\s*(${HIJRI_MONTH})\\s*[\\/\\-.]?\\s*(\\d{4})`, 'u')
  );
  if (named) {
    return `${named[1]}/${named[2].replace(/\s+/g, ' ').trim()}/${named[3]}`;
  }
  // Numeric hijri d/m/yyyy with year 13xx-15xx
  const numeric = normalized.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](1[3-5]\d{2})\b/);
  if (numeric) return `${numeric[1]}/${numeric[2]}/${numeric[3]}`;
  return null;
}

function extractDates(text: string): { gregorian: string | null; hijri: string | null } {
  const normalized = collapseOcrDigitGaps(text);
  let gregorian: string | null = null;
  let hijri: string | null = null;

  // Balady header often OCR-splits: "9إجمادي" ... رقم الرخصة ... "الأول/1442"
  const baladyWindow = normalized.match(
    /([\s\S]{0,40}?)رقم\s*الرخص[ةه][\s\S]{0,40}?(\d{8,14})[\s\S]{0,160}?التاريخ([\s\S]{0,160}?)(?:اسم\s*صاحب|الاستخدام|رقم\s*الصك)/u
  );
  if (baladyWindow) {
    const chunk = `${baladyWindow[1] || ''}\n${baladyWindow[3] || ''}`;
    const named = parseHijriDate(chunk);
    if (named) hijri = named;
    else {
      const day = chunk.match(/(\d{1,2})\s*إ?جماد/u)?.[1];
      const yearMonth = chunk.match(
        /(الأول|الأولى|الثاني|الثانية)\s*[\/\-]?\s*(1[3-5]\d{2})/u
      );
      if (day && yearMonth) {
        hijri = `${day}/جمادى ${yearMonth[1]}/${yearMonth[2]}`;
      } else if (yearMonth) {
        hijri = `1/جمادى ${yearMonth[1]}/${yearMonth[2]}`;
      }
    }
  }

  const labeledGregorian = pickLabeledValue(normalized, [
    /تاريخ\s*(?:الرخصة|الإصدار|اصدار)?\s*(?:الميلادي|ميلادي)/,
    /التاريخ\s*الميلادي/,
    /Gregorian\s*Date/i,
    /Issue\s*Date/i,
  ]);
  const labeledHijri = pickLabeledValue(normalized, [
    /تاريخ\s*(?:الرخصة|الإصدار|اصدار)?\s*(?:الهجري|هجري)/,
    /التاريخ\s*الهجري/,
    /Hijri\s*Date/i,
  ]);
  const labeledGeneric = pickLabeledValue(normalized, [
    /تاريخ\s*الرخصة/,
    /تاريخ\s*إصدار\s*الرخصة/,
    /تاريخ\s*الاصدار/,
    /تاريخ\s*الإصدار/,
    /التاريخ/,
  ]);

  if (labeledGregorian && looksGregorianDate(labeledGregorian)) {
    gregorian = toIsoDate(labeledGregorian);
  }
  if (labeledHijri) {
    hijri = parseHijriDate(labeledHijri) || (looksHijri(labeledHijri) ? cleanLabelValue(labeledHijri) : null);
  }

  if (labeledGeneric && !isLikelyFieldLabel(labeledGeneric)) {
    const asHijri = parseHijriDate(labeledGeneric);
    if (asHijri && !hijri) hijri = asHijri;
    else if (looksHijri(labeledGeneric) && !hijri) hijri = cleanLabelValue(labeledGeneric);
    else if (!gregorian && looksGregorianDate(labeledGeneric)) {
      gregorian = toIsoDate(labeledGeneric);
    }
  }

  if (!hijri) {
    const anyHijri = parseHijriDate(normalized);
    if (anyHijri) hijri = anyHijri;
  }

  const ymdDates = normalized.match(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/g) || [];
  for (const d of ymdDates) {
    if (looksHijri(d) && !hijri) hijri = d;
    else if (!looksHijri(d) && !gregorian) gregorian = toIsoDate(d);
  }

  const dmyDates = normalized.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g) || [];
  for (const d of dmyDates) {
    if (looksHijri(d) && !hijri) hijri = d;
    else if (!looksHijri(d) && !gregorian) gregorian = toIsoDate(d);
  }

  return { gregorian, hijri };
}

function collapseOcrDigitGaps(text: string): string {
  // OCR often splits digits: "1 4 7 0 0 1 2 3" → "14700123"
  // Only collapse runs of *single* digits separated by spaces — never join
  // multi-digit values across newlines (e.g. 4100097644\n9).
  return normalizeArabicDigits(text).replace(
    /(?:(?<=\D)|^)(?:\d(?:\s+\d)+)(?=\D|$)/g,
    (m) => m.replace(/\s+/g, '')
  );
}

function extractPermitNumber(text: string): string | null {
  const normalized = collapseOcrDigitGaps(text);

  // Balady sparse OCR: label on its own line, 10-digit number on next
  const baladyBlock = normalized.match(
    /رقم\s*الرخص[ةه]\s*\n+\s*(\d{8,14})/imu
  );
  if (baladyBlock?.[1]) return baladyBlock[1];

  // Same line with OCR spacing: رقم الرخصة 4100097644
  const sameLine = normalized.match(/رقم\s*الرخص[ةه]\s*[:：]?\s*(\d{8,14})/u);
  if (sameLine?.[1]) return sameLine[1];

  const labeled = pickLabeledValue(normalized, [
    /رقم\s*رخصة\s*البناء/,
    /رقم\s*الرخص[ةه]/,
    /رخصة\s*رقم/,
    /رخصة\s*البناء\s*رقم/,
    /Building\s*Permit\s*(?:No|Number|#)?/i,
    /Permit\s*(?:No|Number|#)/i,
  ]);
  if (labeled) {
    const cleaned = collapseOcrDigitGaps(labeled);
    const num =
      cleaned.match(/\d{8,14}/)?.[0] ||
      cleaned.match(/\d{6,}/)?.[0] ||
      cleaned.match(/[A-Za-z0-9][A-Za-z0-9\-\/]{3,}/)?.[0];
    return num || cleanLabelValue(labeled);
  }

  const afterLabel = normalized.match(
    /(?:رقم\s*رخصة\s*البناء|رقم\s*الرخص[ةه]|رخصة\s*رقم)\s*[:：]?\s*\n+\s*([A-Za-z0-9][A-Za-z0-9\-\/ ]{3,})/imu
  );
  if (afterLabel?.[1]) {
    const num = collapseOcrDigitGaps(afterLabel[1]).match(/\d{8,14}|\d{6,}|[A-Za-z0-9][A-Za-z0-9\-\/]{3,}/);
    if (num) return num[0];
  }

  const patterns = [
    /(?:رقم\s*رخصة\s*البناء|رقم\s*الرخص[ةه])\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{3,})/u,
    /\b(\d{4,5}\/\d{2,4})\b/,
    /\b(41\d{8,12})\b/, // Balady Jeddah-style
    /\b(14\d{8,12})\b/,
    /\b([A-Z]{1,4}\-\d{4,})\b/,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m?.[1]) return collapseOcrDigitGaps(m[1]);
  }
  return null;
}

function extractOwnerName(text: string): string | null {
  const fromColumns = extractBaladyOwnerColumns(text)?.ownerName;
  if (fromColumns) return fromColumns;

  // Line-oriented Balady: label then name (skip if next line is another label)
  const balady = normalizeArabicDigits(text).match(
    /اسم\s*صاحب\s*الرخص[ةه]\s*\n+\s*([^\n\r]{5,80})/imu
  );
  if (balady?.[1] && !isLikelyFieldLabel(balady[1])) {
    return fixArabicOcrText(
      cleanLabelValue(
        balady[1].split(/(?:رقم|جوال|السجل|الاستخدام|رخصة\s*بناء)/)[0] || balady[1]
      )
    );
  }

  const value = pickLabeledValue(text, [
    /اسم\s*صاحب\s*الرخص[ةه]/,
    /اسم\s*المالك/,
    /المالك\s*\/?\s*المستثمر/,
    /المالك/,
    /Owner\s*Name/i,
    /Owner/i,
  ]);
  if (!value || isLikelyFieldLabel(value)) return null;
  return fixArabicOcrText(
    cleanLabelValue(value.split(/(?:رقم|تاريخ|الحي|الموقع|المدينة|جوال)/)[0] || value)
  );
}

function extractStreet(text: string): string | null {
  const fromColumns = extractBaladyLocationColumns(text)?.street;
  if (fromColumns) return fromColumns;

  const normalized = normalizeArabicDigits(text);
  const balady =
    normalized.match(/\nاسم\s*الشارع\.?\s*\n+\s*([^\n\r]{2,60})/u)?.[1] ||
    normalized.match(/اسم\s*الشارع\.?\s*[:：]?\s*([^\n\r]{2,60})/u)?.[1];
  const labeled = balady || pickLabeledValue(text, [/اسم\s*الشارع/, /الشارع/, /Street/i]);
  if (!labeled || isLikelyFieldLabel(labeled)) return null;
  const cleaned = cleanLabelValue(String(labeled).split(/(?:مساحة|رقم|الحي|القطعة)/)[0] || labeled);
  if (!cleaned || isLikelyFieldLabel(cleaned)) return null;
  return fixArabicOcrText(cleaned);
}

function extractPlotNumber(text: string): string | null {
  const fromColumns = extractBaladyLocationColumns(text)?.plotNumber;
  if (fromColumns) return fromColumns;

  const normalized = collapseOcrDigitGaps(text);
  const balady =
    normalized.match(/\n(?:رقم\s*)?القطعة\s*\n+\s*([A-Za-z0-9\/\-]+)/u)?.[1] ||
    normalized.match(/(?:رقم\s*)?القطعة\s*[:：]?\s*([A-Za-z0-9\/\-]+)/u)?.[1];
  if (!balady || isLikelyFieldLabel(balady)) return null;
  return cleanLabelValue(balady);
}

function extractCommercialRegister(text: string): string | null {
  const fromColumns = extractBaladyOwnerColumns(text)?.commercialRegister;
  if (fromColumns) return fromColumns;

  const normalized = collapseOcrDigitGaps(text);
  const m =
    normalized.match(/رقم\s*السجل\s*\n+\s*(\d{8,15})/u)?.[1] ||
    normalized.match(/رقم\s*السجل\s*[:：]?\s*(\d{8,15})/u)?.[1] ||
    normalized.match(/السجل\s*التجاري\s*[:：]?\s*(\d{8,15})/u)?.[1];
  return m || null;
}

function extractPhone(text: string): string | null {
  const normalized = collapseOcrDigitGaps(text);
  const m =
    normalized.match(/جوال\s*(?:رقم)?\s*[:：]?\s*(05\d{8})/u)?.[1] ||
    normalized.match(/\b(05\d{8})\b/)?.[1];
  return m || null;
}

function extractLandArea(text: string): string | null {
  const fromColumns = extractBaladyLocationColumns(text)?.landAreaM2;
  if (fromColumns) return fromColumns;

  const normalized = collapseOcrDigitGaps(text);
  const m =
    normalized.match(/مساحة\s*الار[ض]?\.?\s*\n+\s*([\d.,]+)/u)?.[1] ||
    normalized.match(/مساحة\s*الأرض\.?\s*[:：]?\s*([\d.,]+)/u)?.[1] ||
    normalized.match(/مساحة\s*الارض\.?\s*[:：]?\s*([\d.,]+)/u)?.[1];
  if (m) return m.replace(/,/g, '');
  return landAreaFromLooseBlock(text);
}

function extractFloorsCount(text: string): number | null {
  return floorsCountFromFuzzyLabel(text);
}

function extractUsageLabel(text: string): string | null {
  const normalized = collapseOcrDigitGaps(text).replace(/[\u200e\u200f\u202a-\u202e]/g, '');
  const titled =
    normalized.match(
      /رخصة\s*بناء\s*مبنى\s*(تجاري|تجارى|سكني|سكنى|صناعي|صناعى|تعليمي|إداري|اداري)/u
    )?.[0] ||
    normalized.match(
      /إصدار\s*رخصة\s*بناء\s*(تجارية|سكنية|صناعية|تعليمية|إدارية|ادارية)/u
    )?.[0];
  if (titled) return cleanLabelValue(titled);

  const afterUsage = normalized.match(
    /الاستخدام\s*[:：]?\s*\n+([\s\S]{3,160}?)(?:\n\s*اسم\s*صاحب|\n\s*رقم\s*السجل|\n\s*رقم\s*الرخص|\n\s*البلدية)/u
  );
  if (afterUsage?.[1]) {
    const lines = splitNonEmptyLines(afterUsage[1]).filter((l) => !isLikelyFieldLabel(l));
    const hit = lines.find((l) =>
      /رخصة|تجار|سكن|صناع|تعليم|مكتب|مصنع|مطعم|فندق|مستودع/.test(l)
    );
    if (hit) return cleanLabelValue(hit);
  }

  const labeled = pickLabeledValue(normalized, [/الاستخدام/u, /نوع\s*الاستخدام/u, /الغرض/u]);
  return labeled ? cleanLabelValue(labeled) : null;
}

function extractBuildingArea(text: string): string | null {
  const normalized = collapseOcrDigitGaps(text);
  const match =
    normalized.match(/مساحة\s*البناء\s*[:：]?\s*([\d.,]+)/u)?.[1] ||
    normalized.match(/مساحة\s*المبنى\s*[:：]?\s*([\d.,]+)/u)?.[1] ||
    normalized.match(/إجمالي\s*مساحة\s*(?:البناء|المبنى)\s*[:：]?\s*([\d.,]+)/u)?.[1] ||
    normalized.match(/اجمالي\s*مساحة\s*(?:البناء|المبنى)\s*[:：]?\s*([\d.,]+)/u)?.[1] ||
    normalized.match(/المساحة\s*الإجمالية\s*(?:للبناء|للمبنى)?\s*[:：]?\s*([\d.,]+)/u)?.[1];
  return match ? match.replace(/,/g, '') : null;
}

function parseAreaToken(raw: string): number | null {
  const cleaned = collapseOcrDigitGaps(raw).replace(/[^\d.,]/g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 500_000) return null;
  return Math.round(n * 100) / 100;
}

const FLOOR_TOKEN =
  'بدروم|قبو|سرداب|أرض[يى]|ارضي|متكرر|سطح|الأول|الاول|أول|اول|الثاني|الثانى|ثاني|الثالث|ثالث|الرابع|رابع|الخامس|خامس';

/**
 * Parse floor rows from contents table / labeled lines, e.g.:
 *   أرضي  429.33
 *   الدور الأول: 353.69 م²
 */
function extractFloorRows(text: string): PermitFloorRow[] {
  const normalized = collapseOcrDigitGaps(text).replace(/[\u200e\u200f\u202a-\u202e]/g, '');
  const rows: PermitFloorRow[] = [];
  const seen = new Set<string>();
  const nameRe = new RegExp(`^(?:الدور\\s*)?(?:${FLOOR_TOKEN})$`, 'u');

  const pushRow = (name: string, areaRaw: string) => {
    const classified = classifyFloorName(name);
    const area = parseAreaToken(areaRaw);
    if (!classified || area == null || area < 5) return;
    if (seen.has(classified.label)) return;
    seen.add(classified.label);
    rows.push({
      label: classified.label,
      kind: classified.kind,
      area_m2: area,
      repeat_count: 1,
    });
  };

  const lines = splitNonEmptyLines(normalized);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Same-line: "أرضي 429.33" or "أرضي: 429.33 م²"
    const same = line.match(
      new RegExp(`^(?:الدور\\s*)?(${FLOOR_TOKEN})\\s*[:：\\-]?\\s*([\\d.,]+)\\s*(?:م²|م2|متر)?$`, 'u')
    );
    if (same) {
      pushRow(same[1], same[2]);
      continue;
    }

    // Name-only line + area on next line
    const nameOnly = line.replace(/م²|م2|متر/gi, '').trim();
    if (!nameRe.test(nameOnly)) continue;
    if (i + 1 >= lines.length) continue;
    const area = parseAreaToken(lines[i + 1]);
    if (area == null) continue;
    const window = lines.slice(Math.max(0, i - 6), i + 3).join(' ');
    if (!/محتويات|المساحات|عدد\s*الوحدات|أدوار|ادوار|مساحة\s*البناء/.test(window)) continue;
    pushRow(nameOnly, lines[i + 1]);
  }

  return rows;
}

function extractBuildingFloorsBundle(text: string): {
  floorsCount: number | null;
  buildingAreaM2: string | null;
  usageLabel: string | null;
  activityType: string | null;
  floors: PermitFloorRow[] | null;
} {
  const floorsCount = extractFloorsCount(text);
  const usageLabel = extractUsageLabel(text);
  const activityType = mapPermitUsageToActivityType(usageLabel, text);
  const namedFloors = extractFloorRows(text);
  const heuristicAreas = extractBaladyContentsFloorAreas(text);
  const heuristicFloors = ensureFloorRowLabels(
    buildFloorsFromAreaList(heuristicAreas, floorsCount)
  );
  const floors = mergeFloorRows(namedFloors, heuristicFloors);
  let buildingAreaM2 = extractBuildingArea(text);

  if (!buildingAreaM2 && floors.length > 0) {
    const sum = floors.reduce((s, f) => s + f.area_m2 * Math.max(1, f.repeat_count), 0);
    if (sum > 0) buildingAreaM2 = String(Math.round(sum * 100) / 100);
  }

  const floorsFromRows =
    floors.length > 0 ? floors.reduce((s, f) => s + Math.max(1, f.repeat_count), 0) : null;

  return {
    floorsCount: floorsCount ?? floorsFromRows,
    buildingAreaM2,
    usageLabel,
    activityType,
    floors: floors.length > 0 ? floors : null,
  };
}

function extractLocation(text: string): {
  district: string | null;
  city: string | null;
  street: string | null;
  plotNumber: string | null;
  municipality: string | null;
  locationSummary: string | null;
} {
  const normalized = normalizeArabicDigits(text);
  const columns = extractBaladyLocationColumns(text);

  let district =
    columns?.district ||
    normalized.match(/\nالحي\s*\n+\s*([^\n\r]{2,40})/u)?.[1] ||
    pickLabeledValue(text, [/الحي/, /الحى/, /District/i]);
  if (district && isLikelyFieldLabel(district)) district = columns?.district || null;
  if (district && /تهضه|تهضة|نهضه|نهضة/.test(normalizePlaceLite(district))) {
    district = 'النهضة';
  } else if (district) {
    district = fixArabicOcrText(district);
  }

  let municipality =
    columns?.municipality ||
    normalized.match(/\nالبلدية\s*\n+\s*([^\n\r]{2,40})/u)?.[1] ||
    pickLabeledValue(text, [/البلدية/, /Municipality/i]);
  if (municipality && isLikelyFieldLabel(municipality)) {
    municipality = columns?.municipality || null;
  }

  let city = pickLabeledValue(text, [/المدينة/, /City/i]);
  if (city && isLikelyFieldLabel(city)) city = null;
  if (!city && municipality) {
    if (/جدة|جده/i.test(municipality) || /ابحر|أبحر/i.test(municipality)) city = 'جدة';
  }
  if (!city && /جدة|جده|امانة\s*محافظة\s*جدة|أمانة\s*محافظة\s*جدة/i.test(normalized)) {
    city = 'جدة';
  }
  if (!city && /رياض/i.test(normalized)) city = 'الرياض';

  const street = columns?.street || extractStreet(text);
  const plotNumber = columns?.plotNumber || extractPlotNumber(text);

  const location = pickLabeledValue(text, [
    /موقع\s*المنشأة/,
    /موقع\s*المبنى/,
    /الموقع/,
    /Location/i,
  ]);

  const cleanDistrict = district
    ? cleanLabelValue(String(district).split(/(?:المدينة|الشارع|رقم|مساحة)/)[0] || district)
    : null;
  const cleanCity = city
    ? cleanLabelValue(String(city).split(/(?:الحي|المنطقة|رقم)/)[0] || city)
    : null;
  const cleanMunicipality = municipality
    ? cleanLabelValue(String(municipality).split(/(?:رقم|الحي)/)[0] || municipality)
    : null;

  if (cleanDistrict && isLikelyFieldLabel(cleanDistrict)) {
    return {
      district: columns?.district || null,
      city: cleanCity,
      street,
      plotNumber,
      municipality: cleanMunicipality && !isLikelyFieldLabel(cleanMunicipality) ? cleanMunicipality : columns?.municipality || null,
      locationSummary:
        location ||
        [cleanCity, columns?.district, street].filter(Boolean).join(' — ') ||
        null,
    };
  }

  const locationSummary =
    location ||
    [cleanCity, cleanDistrict, street].filter(Boolean).join(' — ') ||
    null;

  return {
    district: cleanDistrict,
    city: cleanCity,
    street,
    plotNumber,
    municipality:
      cleanMunicipality && !isLikelyFieldLabel(cleanMunicipality)
        ? cleanMunicipality
        : columns?.municipality || null,
    locationSummary,
  };
}

export function parseBuildingPermitText(
  text: string,
  source: BuildingPermitExtraction['source'] = 'regex'
): BuildingPermitExtraction {
  const cleaned = normalizePermitOcrText(String(text || '').replace(/\0/g, ' ').trim());
  if (!cleaned) {
    return emptyExtraction('none');
  }

  const permitNumber = extractPermitNumber(cleaned);
  const dates = extractDates(cleaned);
  const ownerName = extractOwnerName(cleaned);
  const location = extractLocation(cleaned);
  const commercialRegister = extractCommercialRegister(cleaned);
  const phone = extractPhone(cleaned);
  const landAreaM2 = extractLandArea(cleaned);
  const floorsBundle = extractBuildingFloorsBundle(cleaned);

  const hits = [
    permitNumber,
    dates.gregorian || dates.hijri,
    ownerName,
    location.district || location.city,
    location.street,
    commercialRegister,
    floorsBundle.floorsCount,
    floorsBundle.activityType,
  ].filter(Boolean).length;

  const nationalAddress = [location.city, location.district, location.street, location.plotNumber]
    .filter(Boolean)
    .join(' — ') || null;

  return {
    permitNumber,
    permitDateGregorian: dates.gregorian,
    permitDateHijri: dates.hijri,
    ownerName,
    district: location.district,
    city: location.city,
    street: location.street,
    plotNumber: location.plotNumber,
    municipality: location.municipality,
    commercialRegister,
    phone,
    landAreaM2,
    buildingAreaM2: floorsBundle.buildingAreaM2,
    floorsCount: floorsBundle.floorsCount,
    usageLabel: floorsBundle.usageLabel,
    activityType: floorsBundle.activityType,
    floors: floorsBundle.floors,
    nationalAddress,
    locationSummary: location.locationSummary,
    rawTextPreview: cleaned.slice(0, 1200),
    source,
    confidence: hits >= 4 ? 'high' : hits >= 2 ? 'medium' : hits >= 1 ? 'low' : 'low',
  };
}

export function emptyExtraction(source: BuildingPermitExtraction['source'] = 'none'): BuildingPermitExtraction {
  return {
    permitNumber: null,
    permitDateGregorian: null,
    permitDateHijri: null,
    ownerName: null,
    district: null,
    city: null,
    street: null,
    plotNumber: null,
    municipality: null,
    commercialRegister: null,
    phone: null,
    landAreaM2: null,
    buildingAreaM2: null,
    floorsCount: null,
    usageLabel: null,
    activityType: null,
    floors: null,
    nationalAddress: null,
    locationSummary: null,
    source,
    confidence: 'low',
  };
}

export function hasUsefulPermitExtraction(result: BuildingPermitExtraction): boolean {
  return Boolean(result.permitNumber || result.permitDateGregorian || result.permitDateHijri);
}

/** Pull printable text from PDF binary when text layer exists (no external deps). */
export async function extractTextFromPdfFile(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let raw = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    raw += String.fromCharCode(...buf.subarray(i, i + chunk));
  }

  const parts: string[] = [];
  const tj = raw.matchAll(/\((?:\\.|[^\\)]){2,}\)(?:\s*Tj|\s*TJ)/g);
  for (const m of tj) {
    const inner = m[0]
      .replace(/\)\s*T[Jj]$/, '')
      .replace(/^\(/, '')
      .replace(/\\([nrt\\()])/g, (_, c: string) => {
        if (c === 'n') return '\n';
        if (c === 'r') return '\r';
        if (c === 't') return '\t';
        return c;
      });
    if (/[\u0600-\u06FFa-zA-Z0-9]/.test(inner)) parts.push(inner);
  }

  // UTF-16BE hex strings common in Arabic PDFs: <FEFF...>
  const hex = raw.matchAll(/<((?:FEFF|feff)?[0-9A-Fa-f]{8,})>/g);
  for (const m of hex) {
    const hexBody = m[1].replace(/^(FEFF|feff)/, '');
    if (hexBody.length % 4 !== 0) continue;
    let s = '';
    for (let i = 0; i < hexBody.length; i += 4) {
      const code = parseInt(hexBody.slice(i, i + 4), 16);
      if (code > 0 && code < 0xfffe) s += String.fromCharCode(code);
    }
    if (/[\u0600-\u06FFa-zA-Z0-9]/.test(s)) parts.push(s);
  }

  return parts.join('\n').replace(/[^\S\n]+/g, ' ').trim();
}

export async function extractTextFromPermitFile(file: File): Promise<{ text: string; source: BuildingPermitExtraction['source'] }> {
  const name = file.name.toLowerCase();
  const mime = file.type || '';

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    const text = await extractTextFromPdfFile(file);
    if (text.length > 20) return { text, source: 'pdf_text' };
  }

  if (mime.startsWith('text/') || name.endsWith('.txt')) {
    return { text: await file.text(), source: 'regex' };
  }

  // Filename heuristics as last resort hints
  const fromName = file.name.replace(/[_\-.]+/g, ' ');
  return { text: fromName, source: 'filename' };
}

export function parsePermitFromFilename(fileName: string): BuildingPermitExtraction {
  return parseBuildingPermitText(fileName.replace(/[_\-.]+/g, ' '), 'filename');
}

export type BuildingPermitHydration = {
  building_permit_number?: string;
  building_permit_date?: string;
  building_permit_date_hijri?: string;
  report_date?: string;
  owner_name?: string;
  district?: string;
  city?: string;
  region?: string;
  street?: string;
  plot_number?: string;
  municipality?: string;
  commercial_register?: string;
  phone?: string;
  land_area?: string;
  building_area?: string;
  floors_count?: number;
  activity_type?: string;
  usage_label?: string;
  floor_levels?: FloorLevel[];
  national_address?: string;
  location_summary?: string;
};

export function extractionToHydration(result: BuildingPermitExtraction): BuildingPermitHydration {
  const patch: BuildingPermitHydration = {};
  if (result.permitNumber) patch.building_permit_number = result.permitNumber;
  if (result.permitDateGregorian) {
    const iso = toIsoDate(result.permitDateGregorian) || result.permitDateGregorian;
    patch.building_permit_date = iso;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) patch.report_date = iso;
  }
  if (result.permitDateHijri) patch.building_permit_date_hijri = result.permitDateHijri;
  if (result.ownerName) patch.owner_name = result.ownerName;
  if (result.district) patch.district = result.district;
  if (result.city) patch.city = result.city;
  if (result.street) patch.street = result.street;
  if (result.plotNumber) patch.plot_number = result.plotNumber;
  if (result.municipality) patch.municipality = result.municipality;
  if (result.commercialRegister) patch.commercial_register = result.commercialRegister;
  if (result.phone) patch.phone = result.phone;
  if (result.landAreaM2) patch.land_area = result.landAreaM2;
  if (result.buildingAreaM2) patch.building_area = result.buildingAreaM2;
  if (result.floorsCount != null && result.floorsCount > 0) {
    patch.floors_count = result.floorsCount;
  }
  if (result.activityType) patch.activity_type = result.activityType;
  if (result.usageLabel) patch.usage_label = result.usageLabel;
  if (result.nationalAddress) patch.national_address = result.nationalAddress;
  if (result.locationSummary) patch.location_summary = result.locationSummary;

  const levels = resolveFloorLevelsFromPermit({
    floors: result.floors,
    floorsCount: result.floorsCount,
    buildingAreaM2: result.buildingAreaM2 ? Number(result.buildingAreaM2) : null,
  });
  if (levels.length > 0) {
    patch.floor_levels = levels;
    if (patch.floors_count == null) {
      patch.floors_count = levels.reduce((s, l) => s + Math.max(1, l.repeat_count), 0);
    }
    if (!patch.building_area) {
      const sum = levels.reduce(
        (s, l) => s + Math.max(0, l.area_m2) * Math.max(1, l.repeat_count),
        0
      );
      if (sum > 0) patch.building_area = String(Math.round(sum * 100) / 100);
    }
  }
  return patch;
}
