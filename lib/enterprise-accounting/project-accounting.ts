/**
 * Project accounting — auto cost center + ledger metrics
 */

import type { CostCenter, ProjectLedgerSummary } from "./types";
import { summarizeProjectLedger, type PostedLine } from "./statements";

export function projectToCostCenter(project: {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  branchId?: string | null;
}): CostCenter {
  return {
    id: `cc-prj-${project.id}`,
    code: `PRJ-${project.code}`,
    nameAr: `مركز تكلفة — ${project.nameAr}`,
    nameEn: `Cost Center — ${project.nameEn}`,
    parentId: null,
    branchId: project.branchId ?? null,
    projectId: project.id,
    isActive: true,
    autoFromProject: true,
  };
}

export function ensureProjectCostCenters(
  projects: { id: string; code: string; nameAr: string; nameEn: string; branchId?: string | null }[],
  existing: CostCenter[]
): CostCenter[] {
  const byProject = new Map(
    existing.filter((c) => c.projectId).map((c) => [c.projectId!, c])
  );
  const next = [...existing];
  for (const p of projects) {
    if (!byProject.has(p.id)) {
      const cc = projectToCostCenter(p);
      next.push(cc);
      byProject.set(p.id, cc);
    }
  }
  return next;
}

export function projectProfitabilityReport(
  projects: { id: string; budget?: number; committedCost?: number }[],
  costCenters: CostCenter[],
  lines: PostedLine[]
): ProjectLedgerSummary[] {
  return projects.map((p) => {
    const cc = costCenters.find((c) => c.projectId === p.id);
    return summarizeProjectLedger(
      p.id,
      cc?.id || `cc-prj-${p.id}`,
      lines,
      p.budget ?? 0,
      p.committedCost ?? 0
    );
  });
}
