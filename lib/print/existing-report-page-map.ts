import type { EngineeringStudyDocument } from '@/lib/projects/engineering-report-engine/types';
import { documentToFlowBlocks, estimateFlowTocPages } from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import { EXISTING_MANDATORY_PAGE_SECTIONS } from '@/lib/projects/existing-technical-report-profile';

const EXISTING_FIXED_PAGE_MAP: Record<string, number> = {
  facility_data: 3,
  site_information: 4,
  fire_truck_access: 5,
  project_components: 6,
};

/** Client-safe page map estimation aligned with mandatory EXISTING layout pages 3–6. */
export function estimateExistingReportPageMap(document: EngineeringStudyDocument): Record<string, number> {
  const { chapters, blocks } = documentToFlowBlocks(document);
  const map = estimateFlowTocPages(chapters, blocks);

  for (const [id, page] of Object.entries(EXISTING_FIXED_PAGE_MAP)) {
    if (chapters.some((chapter) => chapter.id === id)) map[id] = page;
  }

  let nextPage = 7;
  for (const chapter of chapters) {
    if (chapter.id in EXISTING_FIXED_PAGE_MAP) continue;
    if ((EXISTING_MANDATORY_PAGE_SECTIONS as readonly string[]).includes(chapter.id)) {
      map[chapter.id] = EXISTING_FIXED_PAGE_MAP[chapter.id] ?? nextPage;
      continue;
    }
    if (!map[chapter.id] || map[chapter.id] < 7) map[chapter.id] = nextPage;
    nextPage = Math.max(nextPage, (map[chapter.id] || nextPage) + 1);
  }

  map.approvals = Math.max(...Object.values(map), 10) + 1;
  return map;
}

export function tocPageNumbersMatch(
  pageMap: Record<string, number>,
  chapters: { id: string }[]
): boolean {
  const entries = [...chapters.map((chapter) => chapter.id), 'approvals'];
  return entries.every((id) => typeof pageMap[id] === 'number' && pageMap[id] > 0);
}
