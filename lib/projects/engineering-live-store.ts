/**
 * All-stages engineering live store.
 *
 * CANONICAL PHYSICAL WRITE STORE: project_engineering_live.payload
 * NEVER reads/writes clients.project_engineering_data on save (avoids statement timeout).
 *
 * Read path: live payload is canonical; legacy JSON is compatibility fallback only
 * via resolveCanonicalEngineeringDataset (conflicts recorded, not silently preferred).
 */

import { supabase } from '@/lib/supabase';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import {
  hydrateTechnicalReportPhotosForDisplay,
  persistTechnicalReportPhotosToStorage,
} from '@/lib/projects/technical-report-photos';
import { resolveCanonicalEngineeringDataset } from '@/lib/projects/canonical-engineering';

function isMissing(message: string): boolean {
  return /relation|does not exist|Could not find|schema cache|function/i.test(message);
}

const MISSING_SQL_HINT =
  'جدول الحفظ الحي لجميع المراحل غير موجود. ' +
  'نفّذ مرة واحدة فقط في Supabase SQL Editor الملف: scripts/sql/040_all_stages_engineering_live.sql ' +
  'ثم أعد الحفظ. لا حاجة لسكربتات 035–039.';

/** Persist full (sanitized) engineering payload without touching the fat JSONB column. */
export async function saveEngineeringLive(params: {
  clientId: string;
  data: ProjectEngineeringData;
  pipelineStage?: string | null;
}): Promise<{ error: string | null; usedRpc: boolean }> {
  // Move inline tech-report photos to Storage first so sanitize can drop dataUrls safely
  const withStoredPhotos: ProjectEngineeringData = {
    ...params.data,
    technical_report: await persistTechnicalReportPhotosToStorage(
      params.clientId,
      params.data.technical_report
    ),
    engineering_meta: {
      ...(params.data.engineering_meta || {
        canonical_source: 'project_engineering_live',
      }),
      canonical_source: 'project_engineering_live',
      revision: params.data.engineering_meta?.revision || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
  const payload = sanitizeEngineeringDataForPersist(withStoredPhotos, { aggressive: true });

  const { error: rpcError } = await supabase.rpc('save_project_engineering_live', {
    p_client_id: params.clientId,
    p_payload: payload,
    p_pipeline_stage: params.pipelineStage ?? null,
  });

  if (!rpcError) return { error: null, usedRpc: true };

  if (!isMissing(rpcError.message)) {
    return { error: rpcError.message, usedRpc: true };
  }

  // Fallback: direct upsert (still never touches project_engineering_data)
  if (params.pipelineStage) {
    await supabase
      .from('clients')
      .update({ pipeline_stage: params.pipelineStage })
      .eq('id', params.clientId);
  }

  const { error } = await supabase.from('project_engineering_live').upsert(
    {
      client_id: params.clientId,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' }
  );

  if (error) {
    if (isMissing(error.message)) return { error: MISSING_SQL_HINT, usedRpc: false };
    return { error: error.message, usedRpc: false };
  }
  return { error: null, usedRpc: false };
}

/** Load live engineering payload (null if table missing / empty). */
export async function loadEngineeringLive(
  clientId: string
): Promise<ProjectEngineeringData | null> {
  const { data, error } = await supabase
    .from('project_engineering_live')
    .select('payload')
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) return null;
  if (!data?.payload || typeof data.payload !== 'object') return null;
  const parsed = parseProjectEngineeringData(data.payload);
  // Restore displayable image srcs from Storage paths
  return {
    ...parsed,
    technical_report: await hydrateTechnicalReportPhotosForDisplay(parsed.technical_report),
    engineering_meta: {
      ...(parsed.engineering_meta || { canonical_source: 'project_engineering_live' }),
      canonical_source: 'project_engineering_live',
    },
  };
}

/**
 * Prefer live payload (canonical) over legacy fat column via explicit compatibility layer.
 * Conflicts are recorded on engineering_meta — never silently chosen for compliance.
 */
export function hydrateEngineeringWithLive(
  base: ProjectEngineeringData,
  live: ProjectEngineeringData | null
): ProjectEngineeringData {
  return resolveCanonicalEngineeringDataset({ live, legacy: base });
}

/** Attach live engineering onto a client record (for fetchers / modals). */
export async function attachEngineeringLiveToClient<
  T extends { id: string; project_engineering_data?: unknown },
>(client: T): Promise<T> {
  const live = await loadEngineeringLive(client.id);
  const base = parseProjectEngineeringData(
    client.project_engineering_data as ProjectEngineeringData | null | undefined
  );
  if (!live) {
    return {
      ...client,
      project_engineering_data: {
        ...base,
        engineering_meta: {
          canonical_source: 'legacy_project_engineering_data',
          revision: null,
          updated_at: new Date().toISOString(),
          conflicts: [],
        },
      },
    };
  }
  return {
    ...client,
    project_engineering_data: hydrateEngineeringWithLive(base, live),
  };
}
