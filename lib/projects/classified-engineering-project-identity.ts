import { supabase } from '@/lib/supabase';
import {
  isProjectClassification,
  type ProjectClassification,
} from '@/lib/projects/project-classification';
import type { CanonicalProjectIdentity } from '@/lib/types/client';

type ClassifiedProjectRpcRow = {
  project_id?: unknown;
  client_id?: unknown;
  project_code?: unknown;
  project_classification?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Sales-only bridge to the server-authorized classified-project resolver.
 * The browser never inserts or updates public.projects directly.
 */
export async function createOrResolveClassifiedEngineeringProject(params: {
  clientId: string;
  projectClassification: ProjectClassification;
}): Promise<{ identity: CanonicalProjectIdentity | null; error: string | null }> {
  const clientId = params.clientId.trim();
  if (!clientId || !isProjectClassification(params.projectClassification)) {
    return { identity: null, error: 'PROJECT_CLASSIFICATION_INVALID' };
  }

  const { data, error } = await supabase.rpc(
    'create_or_resolve_classified_engineering_project_for_client',
    {
      p_client_id: clientId,
      p_project_classification: params.projectClassification,
    }
  );

  if (error) return { identity: null, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as ClassifiedProjectRpcRow | null;
  const projectId = asNonEmptyString(row?.project_id);
  const resolvedClientId = asNonEmptyString(row?.client_id);
  const projectCode = asNonEmptyString(row?.project_code);
  const projectClassification = row?.project_classification;

  if (
    !projectId ||
    resolvedClientId !== clientId ||
    !projectCode ||
    !isProjectClassification(projectClassification)
  ) {
    return { identity: null, error: 'PROJECT_CLASSIFICATION_RESOLUTION_INVALID' };
  }

  return {
    identity: {
      clientId,
      projectId,
      projectCode,
      projectClassification,
    },
    error: null,
  };
}
