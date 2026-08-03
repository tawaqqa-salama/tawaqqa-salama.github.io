/**
 * Background indexing job queue — localStorage + Supabase.
 * Workers / cron can call processQueuedJobs(); UI can enqueue after upload.
 */
import type { DiIndexingJob } from '@/lib/design-intelligence/types';
import { isDemoMode, supabase } from '@/lib/supabase';

const JOBS_KEY = 'tawaqqa_di_indexing_jobs_v1';

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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

export async function enqueueIndexingJob(input: {
  documentId: string;
  jobType?: DiIndexingJob['job_type'];
}): Promise<DiIndexingJob> {
  const now = new Date().toISOString();
  const job: DiIndexingJob = {
    id: uid('job'),
    document_id: input.documentId,
    job_type: input.jobType || 'index',
    status: 'queued',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };
  writeJobs([job, ...readJobs()]);

  if (!isDemoMode) {
    await supabase.from('di_indexing_jobs').upsert({
      id: job.id,
      document_id: job.document_id,
      job_type: job.job_type,
      status: job.status,
      attempts: job.attempts,
      payload: {},
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
  }
  return job;
}

/** Mark a job completed (client-side indexer already ran synchronously for small files). */
export async function completeIndexingJob(documentId: string, ok = true, error?: string) {
  const jobs = readJobs().map((j) => {
    if (j.document_id !== documentId || j.status === 'done') return j;
    return {
      ...j,
      status: (ok ? 'done' : 'failed') as DiIndexingJob['status'],
      attempts: j.attempts + 1,
      error_message: error || null,
      updated_at: new Date().toISOString(),
    };
  });
  writeJobs(jobs);

  if (!isDemoMode) {
    const open = jobs.filter((j) => j.document_id === documentId);
    for (const j of open.slice(0, 3)) {
      await supabase
        .from('di_indexing_jobs')
        .update({
          status: j.status,
          attempts: j.attempts,
          error_message: j.error_message,
          finished_at: j.status === 'done' || j.status === 'failed' ? new Date().toISOString() : null,
          updated_at: j.updated_at,
        })
        .eq('id', j.id);
    }
  }
}

export function queuedJobCount(): number {
  return readJobs().filter((j) => j.status === 'queued' || j.status === 'running').length;
}
