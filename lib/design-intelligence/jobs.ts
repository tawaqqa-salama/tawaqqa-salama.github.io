/**
 * Background indexing job queue — localStorage + Supabase.
 * Workers / cron can call processQueuedJobs(); UI can enqueue after upload.
 *
 * Production: di_indexing_jobs.id is UUID — never send job-* strings.
 */
import type { DiIndexingJob } from '@/lib/design-intelligence/types';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { isUuid, newKnowledgeDocumentId } from '@/lib/design-intelligence/code-knowledge/persist';

const JOBS_KEY = 'tawaqqa_di_indexing_jobs_v1';

function readJobs(): DiIndexingJob[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(JOBS_KEY) || '[]') as DiIndexingJob[];
  } catch {
    return [];
  }
}

function writeJobs(jobs: DiIndexingJob[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.slice(0, 200)));
}

export function listIndexingJobs(): DiIndexingJob[] {
  return readJobs().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type EnqueueIndexingJobResult =
  | { ok: true; job: DiIndexingJob }
  | { ok: false; job: DiIndexingJob | null; error: string; code: 'indexing_job_create_failed' };

/**
 * Create an indexing job. When Supabase is configured, persists to di_indexing_jobs
 * with a real UUID primary key and surfaces DB errors (never silent).
 */
export async function enqueueIndexingJob(input: {
  documentId: string;
  jobType?: DiIndexingJob['job_type'];
  companyId?: string | null;
}): Promise<EnqueueIndexingJobResult> {
  const now = new Date().toISOString();
  const id = newKnowledgeDocumentId();

  if (!isUuid(input.documentId)) {
    return {
      ok: false,
      job: null,
      code: 'indexing_job_create_failed',
      error: `indexing_job_create_failed: document_id must be UUID (got non-uuid)`,
    };
  }

  const job: DiIndexingJob = {
    id,
    document_id: input.documentId,
    job_type: input.jobType || 'index',
    status: 'queued',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };
  writeJobs([job, ...readJobs()]);

  if (isSupabaseConfigured && !isDemoMode) {
    const companyId =
      input.companyId && isUuid(input.companyId) ? input.companyId : null;
    const { data, error } = await supabase
      .from('di_indexing_jobs')
      .insert({
        id: job.id,
        document_id: job.document_id,
        company_id: companyId,
        job_type: job.job_type,
        status: job.status,
        attempts: job.attempts,
        payload: {},
        created_at: job.created_at,
        updated_at: job.updated_at,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      job.status = 'failed';
      job.error_message = error.message;
      job.updated_at = new Date().toISOString();
      writeJobs([job, ...readJobs().filter((j) => j.id !== job.id)]);
      return {
        ok: false,
        job,
        code: 'indexing_job_create_failed',
        error: `indexing_job_create_failed: ${error.message}`,
      };
    }

    // Prefer DB-returned id when present (must still be UUID)
    if (data?.id && isUuid(data.id)) {
      job.id = data.id;
      writeJobs([job, ...readJobs().filter((j) => j.id !== id)]);
    }
  }

  return { ok: true, job };
}

/** Mark a job completed (client-side indexer already ran synchronously for small files). */
export async function completeIndexingJob(
  documentId: string,
  ok = true,
  error?: string,
  jobId?: string | null
) {
  const jobs = readJobs().map((j) => {
    if (j.document_id !== documentId || j.status === 'done') return j;
    if (jobId && j.id !== jobId) return j;
    return {
      ...j,
      status: (ok ? 'done' : 'failed') as DiIndexingJob['status'],
      attempts: j.attempts + 1,
      error_message: error || null,
      updated_at: new Date().toISOString(),
    };
  });
  writeJobs(jobs);

  if (isSupabaseConfigured && !isDemoMode) {
    const targets = jobId
      ? jobs.filter((j) => j.id === jobId)
      : jobs.filter((j) => j.document_id === documentId).slice(0, 3);
    for (const j of targets) {
      if (!isUuid(j.id)) continue; // never PATCH eq.job-*
      await supabase
        .from('di_indexing_jobs')
        .update({
          status: j.status,
          attempts: j.attempts,
          error_message: j.error_message,
          finished_at:
            j.status === 'done' || j.status === 'failed'
              ? new Date().toISOString()
              : null,
          updated_at: j.updated_at,
        })
        .eq('id', j.id);
    }
  }
}

export function queuedJobCount(): number {
  return readJobs().filter((j) => j.status === 'queued' || j.status === 'running').length;
}
