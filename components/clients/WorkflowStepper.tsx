'use client';

import { PIPELINE_STAGES } from '@/lib/constants/navigation';
import { resolvePipelineStage } from '@/lib/business/pipeline';
import type { ClientRecord } from '@/lib/types/client';

interface WorkflowStepperProps {
  client: ClientRecord;
}

export default function WorkflowStepper({ client }: WorkflowStepperProps) {
  const currentStage = resolvePipelineStage(client);
  const stageOrder = ['marketing', 'sales', 'finance', 'projects'] as const;
  const currentIndex = stageOrder.indexOf(
    currentStage === 'completed' ? 'projects' : (currentStage as (typeof stageOrder)[number])
  );

  return (
    <div className="mt-4 mb-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {PIPELINE_STAGES.filter((s) => s.id !== 'completed').map((stage, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = stage.id === currentStage || (currentStage === 'completed' && stage.id === 'projects');
          const isLocked = index > currentIndex;

          return (
            <div
              key={stage.id}
              className={`rounded-xl border p-3 text-center text-xs transition ${
                isCurrent
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : isComplete
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : isLocked
                      ? 'border-gray-200 bg-gray-50 text-gray-400'
                      : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              <div className="font-bold mb-1">{index + 1}</div>
              <div className="font-semibold">{stage.label}</div>
              <div className="mt-1 opacity-80">
                {isCurrent ? 'المرحلة الحالية' : isComplete ? 'مكتملة ✓' : 'قادمة'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
