'use client';

import {
  LOCK_TOOLTIP_AR,
  WORKFLOW_STAGES,
  canUnlockStage,
  getStageUiState,
  type WorkflowStageId,
} from '@/lib/projects/gated-pipeline';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  activeStage: WorkflowStageId;
  progressPercent: number;
  onSelect: (stageId: WorkflowStageId) => void;
};

export default function WorkflowStageRail({
  client,
  data,
  activeStage,
  progressPercent,
  onSelect,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-600 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">
        مسار المراحل المتسلسل: {progressPercent}% · 🟢 مكتمل · 🔵 نشط · 🔒 مقفل
      </p>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {WORKFLOW_STAGES.map((stage) => {
          const ui = getStageUiState(stage.id, activeStage, client, data);
          const unlocked = canUnlockStage(stage.id, client, data);
          const isActive = activeStage === stage.id;
          const base =
            ui === 'completed'
              ? 'bg-emerald-600 text-white border-emerald-700'
              : isActive
                ? 'bg-sky-600 text-white border-sky-700'
                : unlocked
                  ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-80';

          return (
            <button
              key={stage.id}
              type="button"
              title={unlocked ? stage.label_ar : LOCK_TOOLTIP_AR}
              disabled={!unlocked}
              onClick={() => unlocked && onSelect(stage.id)}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold ${base}`}
            >
              <span className="ml-1">
                {ui === 'completed' ? '🟢' : !unlocked ? '🔒' : isActive ? '🔵' : '○'}
              </span>
              {stage.short_ar}
            </button>
          );
        })}
      </div>

      <nav className="space-y-0.5">
        {WORKFLOW_STAGES.map((stage) => {
          const ui = getStageUiState(stage.id, activeStage, client, data);
          const unlocked = canUnlockStage(stage.id, client, data);
          const isActive = activeStage === stage.id;
          return (
            <button
              key={`nav-${stage.id}`}
              type="button"
              title={unlocked ? stage.label_ar : LOCK_TOOLTIP_AR}
              disabled={!unlocked}
              onClick={() => unlocked && onSelect(stage.id)}
              className={`w-full text-right px-3 py-2 rounded-lg text-xs font-medium ${
                isActive
                  ? 'bg-sky-600 text-white'
                  : ui === 'completed'
                    ? 'bg-emerald-50 text-emerald-900'
                    : unlocked
                      ? 'text-gray-700 hover:bg-gray-100'
                      : 'text-gray-400 cursor-not-allowed'
              }`}
            >
              {!unlocked ? '🔒 ' : ui === 'completed' ? '🟢 ' : isActive ? '🔵 ' : ''}
              {stage.order}. {stage.label_ar}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
