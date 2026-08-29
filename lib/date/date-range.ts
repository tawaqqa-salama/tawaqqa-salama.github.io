/** Returns YYYY-MM-DD in local timezone. */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type DateRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'year';

export function getDateRangeForPreset(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date();
  const today = toLocalDateString(now);

  if (preset === 'today') {
    return { from: today, to: today };
  }

  if (preset === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const day = toLocalDateString(yesterday);
    return { from: day, to: day };
  }

  if (preset === 'week') {
    const start = new Date(now);
    const dayOfWeek = start.getDay();
    const diffToSaturday = (dayOfWeek + 1) % 7;
    start.setDate(start.getDate() - diffToSaturday);
    return { from: toLocalDateString(start), to: today };
  }

  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toLocalDateString(start), to: today };
  }

  const start = new Date(now.getFullYear(), 0, 1);
  return { from: toLocalDateString(start), to: today };
}

export function inDateRange(iso: string | undefined | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
