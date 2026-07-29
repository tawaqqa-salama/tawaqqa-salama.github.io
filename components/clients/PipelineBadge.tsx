import type { PipelineStage } from '@/lib/types/client';
import { getPipelineStageLabel } from '@/lib/business/pipeline';

const STAGE_STYLES: Record<PipelineStage, string> = {
  marketing: 'bg-purple-100 text-purple-700',
  sales: 'bg-blue-100 text-blue-700',
  finance: 'bg-amber-100 text-amber-800',
  projects: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
};

export default function PipelineBadge({ stage }: { stage: PipelineStage }) {
  return (
    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${STAGE_STYLES[stage]}`}>
      {getPipelineStageLabel(stage)}
    </span>
  );
}
