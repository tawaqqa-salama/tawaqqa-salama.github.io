const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Converts Arabic/Persian digit characters to standard ASCII digits (0-9). */
export function normalizeToAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (char) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(char);
    if (arabicIndex >= 0) return String(arabicIndex);

    const extendedIndex = EXTENDED_ARABIC_INDIC_DIGITS.indexOf(char);
    if (extendedIndex >= 0) return String(extendedIndex);

    return char;
  });
}

/** Keeps only standard digits after normalization — for phone, areas, floors. */
export function sanitizeIntegerInput(value: string): string {
  return normalizeToAsciiDigits(value).replace(/\D/g, '');
}

/** Keeps digits and a single decimal point — accepts Arabic comma separators too. */
export function sanitizeDecimalInput(value: string): string {
  let normalized = normalizeToAsciiDigits(value).replace(/[،,]/g, '.');
  normalized = normalized.replace(/[^\d.]/g, '');

  const parts = normalized.split('.');
  if (parts.length <= 1) return normalized;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

/** Removes all digit characters (ASCII + Arabic) from text-only fields. */
export function sanitizeTextOnly(value: string): string {
  return normalizeToAsciiDigits(value).replace(/[0-9]/g, '');
}

export function parseLocalizedNumber(value: string): number {
  const cleaned = sanitizeDecimalInput(value);
  if (!cleaned || cleaned === '.') return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseLocalizedInteger(value: string): number {
  const cleaned = sanitizeIntegerInput(value);
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}
