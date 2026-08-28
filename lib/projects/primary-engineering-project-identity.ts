import { supabase } from '@/lib/supabase';
import type { CanonicalProjectIdentity } from '@/lib/types/client';
import { syncProjectClassificationFromBasicData } from '@/lib/projects/basic-data-project-classification';
import { normalizeProjectClassification } from '@/lib/projects/project-classification';

/**
 * Resolves an already-established primary engineering project identity.
 *
 * This is deliberately read-only: page loading must never call the IDENTITY-1
 * ensure resolver because that resolver may create a missing identity. RLS on
 * the mapping and projects tables remains the authoritative tenant boundary.
 */
export async function resolvePrimaryEngineeringProjectIdentity(
  clientId: string
): Promise<CanonicalProjectIdentity | null> {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) return null;

  try {
    const { data: mapping, error: mappingError } = await supabase
      .from('primary_engineering_project_mappings')
      .select('client_id, project_id')
      .eq('client_id', normalizedClientId)
      .maybeSingle();

    if (
      mappingError ||
      !mapping ||
      mapping.client_id !== normalizedClientId ||
      !mapping.project_id
    ) {
      return null;
    }

    // Never select a first project by client. The mapping is the only authority,
    // and the composite pair must resolve exactly as stored by IDENTITY-1/2.
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, client_id, project_code, project_classification')
      .eq('id', mapping.project_id)
      .eq('client_id', normalizedClientId)
      .maybeSingle();

    if (
      projectError ||
      !project ||
      project.id !== mapping.project_id ||
      project.client_id !== normalizedClientId ||
      !project.project_code
    ) {
      return null;
    }

    let projectClassification = normalizeProjectClassification(project.project_classification);
    if (projectClassification === null) {
      const syncResult = await syncProjectClassificationFromBasicData(normalizedClientId);
      if (syncResult.projectClassification) {
        projectClassification = syncResult.projectClassification;
      }
    }

    return {
      clientId: normalizedClientId,
      projectId: project.id,
      projectCode: project.project_code,
      projectClassification,
    };
  } catch {
    // Identity is optional until a future project-centric feature needs it.
    // Keep the already-loaded client-centric engineering file usable.
    return null;
  }
}
