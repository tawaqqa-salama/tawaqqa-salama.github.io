import { supabase } from '@/lib/supabase';
import type { WorkflowStageId } from '@/lib/projects/gated-pipeline';

export type EngineeringTransitionTarget = Extract<
  WorkflowStageId,
  'supervision_visits' | 'transmittals'
>;

export type EngineeringWorkflowTransitionResult =
  | { ok: true; targetStage: EngineeringTransitionTarget }
  | { ok: false; code: 'WORKFLOW_STAGE_BLOCKED'; blockers: string[]; message: string };

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
