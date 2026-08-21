import { supabase } from '@/lib/supabase';
import type { WorkflowStageId } from '@/lib/projects/gated-pipeline';

export type EngineeringTransitionTarget = Extract<
  WorkflowStageId,
  'supervision_visits' | 'transmittals'
>;

export type EngineeringWorkflowTransitionResult =
  | { ok: true; targetStage: EngineeringTransitionTarget }
  | { ok: false; code: 'WORKFLOW_STAGE_BLOCKED'; blockers: string[]; message: string };

const WORKFLOW_BLOCKER_MESSAGES: Record<string, string> = {
  OPEN_CRITICAL_FIELD_OBSERVATION: 'توجد ملاحظة ميدانية حرجة لم يتم التحقق من معالجتها.',
  OPEN_HIGH_FIELD_OBSERVATION: 'توجد ملاحظة ميدانية عالية الخطورة لم يتم التحقق من معالجتها.',
};

export function workflowBlockerMessage(blocker: string): string {
  return WORKFLOW_BLOCKER_MESSAGES[blocker] || blocker;
}

function parseBlockers(details: string | null | undefined): string[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

/**
 * Advances only the server-protected engineering boundary. Ordinary stage saves
 * deliberately continue through their existing persistence path and never send
 * an engineering target through clients.pipeline_stage.
 */
export async function transitionProjectEngineeringStage(
  clientId: string,
  targetStage: EngineeringTransitionTarget
): Promise<EngineeringWorkflowTransitionResult> {
  const { data, error } = await supabase.rpc('transition_project_engineering_stage', {
    p_client_id: clientId,
    p_target_stage: targetStage,
  });

  if (error) {
    if (error.message === 'WORKFLOW_STAGE_BLOCKED') {
      return {
        ok: false,
        code: 'WORKFLOW_STAGE_BLOCKED',
        blockers: parseBlockers(error.details),
        message: 'تعذر اعتماد المرحلة بسبب متطلبات Workflow غير مكتملة.',
      };
    }
    throw new Error(error.message || 'تعذر اعتماد مرحلة المشروع على الخادم');
  }

  const result = data as { ok?: boolean; target_stage?: string } | null;
  if (!result?.ok || result.target_stage !== targetStage) {
    throw new Error('استجابة انتقال المرحلة غير صالحة');
  }

  return { ok: true, targetStage };
}
