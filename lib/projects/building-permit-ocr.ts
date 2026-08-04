/**
 * Building permit (رخصة البناء) text extraction + field parsing.
 * Uses local PDF text sniffing / regex first; Vision API when configured server-side.
 */

export type BuildingPermitExtraction = {
  permitNumber: string | null;
  permitDateGregorian: string | null;
  permitDateHijri: string | null;
  ownerName: string | null;
  district: string | null;
  city: string | null;
  locationSummary: string | null;
  rawTextPreview?: string;
  source: 'vision' | 'pdf_text' | 'regex' | 'filename' | 'tesseract' | 'none';
  confidence: 'high' | 'medium' | 'low';
};

const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabicDigits(input: string): string {
  return String(input || '')
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

  if (labeledGregorian) gregorian = toIsoDate(labeledGregorian) || labeledGregorian;
  if (labeledHijri) hijri = parseHijriDate(labeledHijri) || cleanLabelValue(labeledHijri);

  if (labeledGeneric) {
    const asHijri = parseHijriDate(labeledGeneric);
    if (asHijri && !hijri) hijri = asHijri;
    else if (looksHijri(labeledGeneric) && !hijri) hijri = cleanLabelValue(labeledGeneric);
    else if (!gregorian) gregorian = toIsoDate(labeledGeneric) || labeledGeneric;
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
  const normalized = text.replace(/\s+/g, ' ');
  // Balady: اسم صاحب الرخصة
  const balady = normalizeArabicDigits(text).match(
    /اسم\s*صاحب\s*الرخص[ةه]\s*\n+\s*([^\n\r]{5,80})/imu
  );
  if (balady?.[1]) {
    return cleanLabelValue(
      balady[1].split(/(?:رقم|جوال|السجل|الاستخدام|رخصة\s*بناء)/)[0] || balady[1]
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
  if (!value) return null;
  return cleanLabelValue(value.split(/(?:رقم|تاريخ|الحي|الموقع|المدينة|جوال)/)[0] || value);
}

function extractLocation(text: string): {
  district: string | null;
  city: string | null;
  locationSummary: string | null;
} {
  const normalized = normalizeArabicDigits(text);
  // Balady sparse: الحي\nالنهضة  (OCR may read النهضة as التهضة)
  let district =
    normalized.match(/\nالحي\s*\n+\s*([^\n\r]{2,40})/u)?.[1] ||
    pickLabeledValue(text, [/الحي/, /الحى/, /District/i]);
  const municipality = normalized.match(/\nالبلدية\s*\n+\s*([^\n\r]{2,40})/u)?.[1];
  let city = pickLabeledValue(text, [/المدينة/, /City/i]);
  if (!city && municipality) {
    // ابحر الفرعية / أمانة جدة → جدة
    if (/جدة|جده/i.test(municipality) || /ابحر|أبحر/i.test(municipality)) city = 'جدة';
  }
  if (!city && /جدة|جده|امانة\s*محافظة\s*جدة/i.test(normalized)) city = 'جدة';

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

  const locationSummary =
    location ||
    (cleanCity || cleanDistrict
      ? [cleanCity, cleanDistrict].filter(Boolean).join(' — ')
      : null);

  return { district: cleanDistrict, city: cleanCity, locationSummary };
}

export function parseBuildingPermitText(
  text: string,
  source: BuildingPermitExtraction['source'] = 'regex'
): BuildingPermitExtraction {
  const cleaned = String(text || '').replace(/\0/g, ' ').trim();
  if (!cleaned) {
    return emptyExtraction('none');
  }

  const permitNumber = extractPermitNumber(cleaned);
  const dates = extractDates(cleaned);
  const ownerName = extractOwnerName(cleaned);
  const location = extractLocation(cleaned);

  const hits = [permitNumber, dates.gregorian || dates.hijri, ownerName, location.district || location.city].filter(
    Boolean
  ).length;

  return {
    permitNumber,
    permitDateGregorian: dates.gregorian,
    permitDateHijri: dates.hijri,
    ownerName,
    district: location.district,
    city: location.city,
    locationSummary: location.locationSummary,
    rawTextPreview: cleaned.slice(0, 1200),
    source,
    confidence: hits >= 3 ? 'high' : hits >= 2 ? 'medium' : hits >= 1 ? 'low' : 'low',
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
  location_summary?: string;
};

export function extractionToHydration(result: BuildingPermitExtraction): BuildingPermitHydration {
  const patch: BuildingPermitHydration = {};
  if (result.permitNumber) patch.building_permit_number = result.permitNumber;
  if (result.permitDateGregorian) {
    const iso = toIsoDate(result.permitDateGregorian) || result.permitDateGregorian;
    patch.building_permit_date = iso;
    // Fill report date when it looks like Gregorian ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) patch.report_date = iso;
  }
  if (result.permitDateHijri) patch.building_permit_date_hijri = result.permitDateHijri;
  if (result.ownerName) patch.owner_name = result.ownerName;
  if (result.district) patch.district = result.district;
  if (result.city) patch.city = result.city;
  if (result.locationSummary) patch.location_summary = result.locationSummary;
  return patch;
}
