import {
  TECH_REPORT_CHAPTERS,
  type TechReportChapterId,
} from '@/lib/constants/technical-report';

export const TECH_REPORT_CHAPTER_FLOW: TechReportChapterId[] = TECH_REPORT_CHAPTERS.map(
  (c) => c.id
);

export function isTechReportChapterId(value: unknown): value is TechReportChapterId {
  return (
    typeof value === 'string' &&
    (TECH_REPORT_CHAPTER_FLOW as readonly string[]).includes(value)
  );
}

export function techReportChapterTitle(id: TechReportChapterId): string {
  return TECH_REPORT_CHAPTERS.find((c) => c.id === id)?.title || id;
}

export function techReportChapterIndex(id: TechReportChapterId): number {
  return TECH_REPORT_CHAPTER_FLOW.indexOf(id);
}

/** Next internal chapter, or null when already on التوصيات العامة (ready for workflow stage 5). */
export function nextTechReportChapter(
  current: TechReportChapterId
): TechReportChapterId | null {
  const idx = techReportChapterIndex(current);
  if (idx < 0) return TECH_REPORT_CHAPTER_FLOW[0] || null;
  if (idx >= TECH_REPORT_CHAPTER_FLOW.length - 1) return null;
  return TECH_REPORT_CHAPTER_FLOW[idx + 1]!;
}

export function isLastTechReportChapter(id: TechReportChapterId): boolean {
  return nextTechReportChapter(id) === null;
}
