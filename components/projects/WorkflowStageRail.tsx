'use client';

import { useLanguage } from '@/lib/i18n/LanguageProvider';
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
  const { lang } = useLanguage();
  const ar = lang === 'ar';

  return (
    <div className="space-y-3">
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-600 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">
        {ar
          ? `مسار المراحل المتسلسل: ${progressPercent}% · 🟢 مكتمل · 🔵 نشط · 🔒 مقفل`
          : `Sequential stage path: ${progressPercent}% · 🟢 done · 🔵 current · 🔒 locked`}
      </p>

      <nav className="space-y-0.5">
        {WORKFLOW_STAGES.map((stage) => {
          const ui = getStageUiState(stage.id, activeStage, client, data);
          const unlocked = canUnlockStage(stage.id, client, data);
          const isActive = activeStage === stage.id;
          return (
            <button
              key={`nav-${stage.id}`}
              type="button"
              title={unlocked ? (ar ? stage.label_ar : stage.label_en) : LOCK_TOOLTIP_AR}
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
              {stage.order}. {ar ? stage.label_ar : stage.label_en}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
