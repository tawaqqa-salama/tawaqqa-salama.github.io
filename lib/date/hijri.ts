const HIJRI_FORMATTER = new Intl.DateTimeFormat('en-SA-u-ca-islamic-umalqura-nu-latn', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export type HijriParts = { day: number; month: number; year: number };

export const HIJRI_MONTHS = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
] as const;

function partsForGregorian(date: Date): HijriParts | null {
  const parts = HIJRI_FORMATTER.formatToParts(date);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  return Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)
    ? { day, month, year }
    : null;
}

export function parseHijriParts(value: string | null | undefined): HijriParts | null {
  const match = String(value || '').trim().match(/^(\d{1,2})\s*[/\\-]\s*(\d{1,2})\s*[/\\-]\s*(\d{3,4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 30 || month < 1 || month > 12 || year < 1200 || year > 1700) return null;
  return { day, month, year };
}

export function formatHijriParts(parts: Partial<HijriParts>): string {
  if (!parts.day || !parts.month || !parts.year) return '';
  return `${parts.day}/${parts.month}/${parts.year}`;
}

/** Convert a Hijri Umm al-Qura date to YYYY-MM-DD without guessing on failure. */
export function hijriToGregorian(parts: HijriParts): string | null {
  if (parts.day < 1 || parts.day > 30 || parts.month < 1 || parts.month > 12 || parts.year < 1200 || parts.year > 1700) {
    return null;
  }
  const approximateGregorianYear = Math.floor(parts.year * 0.970224 + 621.5774);
  const start = Date.UTC(approximateGregorianYear - 2, 0, 1);
  const end = Date.UTC(approximateGregorianYear + 2, 11, 31);
  for (let time = start; time <= end; time += 86_400_000) {
    const date = new Date(time);
    const hijri = partsForGregorian(date);
    if (hijri?.day === parts.day && hijri.month === parts.month && hijri.year === parts.year) {
      return date.toISOString().slice(0, 10);
    }
  }
  return null;
}
