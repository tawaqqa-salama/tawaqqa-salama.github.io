'use client';

/**
 * Code Knowledge Manager — editions, adoption, Storage upload/ingest, search, rule status.
 * Advisory only: AI answers never shown as authoritative without citations.
 *
 * Production (Supabase): documents listed from DB; indexed only when Storage+DB+chunks verified.
 * Demo (no Supabase): session-memory with LOCAL / NOT SAVED badge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  adoptNfpa13_2025ForProject,
  advanceCodeEditionStatus,
  CODE_KNOWLEDGE_STORAGE_BUCKET,
  compareCodeEditions,
  explainCodeKnowledgeHits,
  getProjectAdoptedEdition,
  listAvailableCodes,
  listCodeEditions,
  listCodeKnowledgeDocumentsForUi,
  listEditionRules,
  listPipelineJobs,
  NFPA13_PIPELINE_RULE_IDS,
  registerCodeEdition,
  registerEditionRuleShellsForNewEdition,
  registerKnowledgeDocument,
  registerNfpa13_2025ProjectEdition,
  registerNfpa13_2025RuleShells,
  resumeIncompleteCodeKnowledgeIngestion,
  resetCodeKnowledgeStore,
  resetInMemoryCodeKnowledgeStorage,
  runDocumentPipeline,
  searchCodeKnowledge,
  shouldPersistCodeKnowledgeToSupabase,
  uploadAndIngestCodeKnowledgeDocument,
  deleteKnowledgeDocument,
  documentHasSha256Duplicate,
  shouldUseResumableUpload,
  canReingestKnowledgeRole,
  findExistingNfpa13Document,
  isKnowledgeDocumentPresentInStorage,
  uploadMissingFileMessage,
  type CodeKnowledgeDocumentMeta,
  type CodeKnowledgeSearchHit,
  type DiCodeEdition,
  type DiProjectCodeAdoption,
  type EditionComparisonResult,
  type KnowledgeDeleteResult,
  type ResumableUploadHandle,
  type UploadPhase,
} from '@/lib/design-intelligence/code-knowledge';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { supabase } from '@/lib/supabase';
import { getBrowserAccessToken } from '@/lib/auth/browser-access-token';
import { isSuperAdminRole } from '@/lib/tenant/rbac';
import SaudiOnlyKnowledgeCleanupPanel from '@/components/platform/SaudiOnlyKnowledgeCleanupPanel';

type Props = {
  companyId?: string;
  clientId?: string;
};

const DEMO_COMPANY = 'demo-company';
const DEMO_CLIENT = 'demo-client';

function PersistenceBadge({ persistedMode, docPersisted }: { persistedMode: boolean; docPersisted?: boolean }) {
  if (persistedMode && docPersisted) {
    return (
      <span className="inline-flex rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-800">
        SUPABASE / PERSISTED
      </span>
    );
  }
  if (persistedMode && docPersisted === false) {
    return (
      <span className="inline-flex rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-rose-800">
        FAILED / NOT PERSISTED
      </span>
    );
  }
  return (
    <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900">
      LOCAL / NOT SAVED
    </span>
  );
}


/** Stay under Vercel maxDuration (300s) so UI fails clearly before a silent platform kill. */
const REINGEST_CLIENT_TIMEOUT_MS = 290_000;
const RESUME_CLIENT_TIMEOUT_MS = 290_000;

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}


export default function CodeKnowledgePanel({ companyId, clientId }: Props) {
  const { session, profile } = useAuth();
  const { t } = useLanguage();
  const uploadLabel = (() => {
    const v = t('design.kb.index');
    return v === 'design.kb.index' ? 'رفع وفهرسة' : v;
  })();

  const authCompany =
    session?.companyId || profile?.company_id || companyId || null;
  const persistedMode = shouldPersistCodeKnowledgeToSupabase();
  const company =
    persistedMode && authCompany
      ? authCompany
      : companyId || authCompany || DEMO_COMPANY;
  const client = clientId || DEMO_CLIENT;

  const [editions, setEditions] = useState<DiCodeEdition[]>([]);
  const [adoption, setAdoption] = useState<DiProjectCodeAdoption | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [docs, setDocs] = useState<CodeKnowledgeDocumentMeta[]>([]);
  const [listSource, setListSource] = useState<'supabase' | 'session-memory'>('session-memory');
  const [query, setQuery] = useState('sprinkler density Section 5 Table 5.1');
  const [hits, setHits] = useState<CodeKnowledgeSearchHit[]>([]);
  const [selectedHit, setSelectedHit] = useState<CodeKnowledgeSearchHit | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [compare, setCompare] = useState<EditionComparisonResult | null>(null);
  const [indexStatus, setIndexStatus] = useState<string>('—');
  const [busy, setBusy] = useState(false);
  const [reingestingId, setReingestingId] = useState<string | null>(null);
  const [operationElapsedMs, setOperationElapsedMs] = useState(0);
  const [operationStage, setOperationStage] = useState<string | null>(null);
  const operationStartedAtRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [uploadCode, setUploadCode] = useState('NFPA-13');
  const [uploadEdition, setUploadEdition] = useState('2025');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase | 'idle'>('idle');
  const [uploadHandle, setUploadHandle] = useState<ResumableUploadHandle | null>(
    null
  );
  /** Stable document UUID across Retry/Resume for the same File (no duplicate paths). */
  const [resumeDocumentId, setResumeDocumentId] = useState<string | null>(null);
  const [lastUploadError, setLastUploadError] = useState<string | null>(null);

  const clearOperationTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    operationStartedAtRef.current = null;
  };

  const startOperationTimer = (stage: string) => {
    clearOperationTimer();
    operationStartedAtRef.current = Date.now();
    setOperationElapsedMs(0);
    setOperationStage(stage);
    elapsedTimerRef.current = setInterval(() => {
      if (operationStartedAtRef.current != null) {
        setOperationElapsedMs(Date.now() - operationStartedAtRef.current);
      }
    }, 500);
  };

  const finishOperation = (stage: string | null) => {
    clearOperationTimer();
    setOperationStage(stage);
  };

  useEffect(() => {
    return () => clearOperationTimer();
  }, []);


  const [sourceText, setSourceText] = useState(
    'Section 8.1 general requirements.\n\nTable 8.2.1 design criteria placeholder text for indexing tests only.\n\nPage 12 discusses spacing. Figure 8.3 shows coverage layout.'
  );

  const canReingest = canReingestKnowledgeRole(session?.roleCode || profile?.role_code);
  const existingNfpa13 = useMemo(
    () => findExistingNfpa13Document(docs, { edition: '2025' }),
    [docs]
  );

  const refresh = useCallback(async () => {
    setEditions(listCodeEditions({ companyId: company }));
    setCodes(listAvailableCodes(company));
    setAdoption(getProjectAdoptedEdition(client, 'NFPA-13', company));
    const listed = await listCodeKnowledgeDocumentsForUi({ companyId: company });
    setDocs(listed.documents);
    setListSource(listed.source);
  }, [company, client]);

  useEffect(() => {
    registerNfpa13_2025ProjectEdition({ companyId: company });
    registerNfpa13_2025RuleShells();
    void refresh();
  }, [company, refresh]);

  const rules = useMemo(
    () => listEditionRules({ code: 'NFPA-13', edition: adoption?.edition || '2025' }),
    [adoption, editions]
  );

  const onBootstrap = () => {
    registerNfpa13_2025ProjectEdition({ companyId: company });
    const a = adoptNfpa13_2025ForProject({ companyId: company, clientId: client });
    registerNfpa13_2025RuleShells();
    setAdoption(a);
    void refresh();
    setMessage(
      'NFPA-13 2025 registered & project-adopted. platform_verification_status=NOT_VERIFIED_OFFICIAL. Rules=RULE_NOT_CONFIGURED.'
    );
  };

  const onRegisterSource = () => {
    if (persistedMode) {
      setMessage(
        'FAILED: text excerpt is LOCAL / NOT SAVED. Use رفع وفهرسة to upload into Supabase Storage + di_knowledge_documents.'
      );
      return;
    }
    const doc = registerKnowledgeDocument({
      companyId: company,
      title: 'NFPA 13 — 2025 (project-provided excerpt for indexing)',
      code: 'NFPA-13',
      edition: '2025',
      source_document_id: 'project_provided:NFPA-13-2025-cover',
      source_type: 'PROJECT_PROVIDED_DOCUMENT',
      adoption_status: 'PROJECT_ADOPTED',
      verification_status: 'PROJECT_COVER_IDENTIFIED',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
      extracted_text: sourceText,
      file_name: 'nfpa13-2025-excerpt.txt',
      file_mime: 'text/plain',
    });
    const result = runDocumentPipeline(doc.id);
    doc.persisted = false;
    setIndexStatus(result.document?.index_status || 'failed');
    const jobs = listPipelineJobs(doc.id)
      .map((j) => `${j.job_type}:${j.status}`)
      .join(', ');
    void refresh();
    setMessage(
      result.ok
        ? `LOCAL / NOT SAVED — indexed in session-memory (${result.document?.chunk_count || 0} chunks). Jobs: ${jobs}`
        : `Indexing incomplete. Jobs: ${jobs}`
    );
  };

  /**
   * Primary Production path: always calls uploadAndIngestCodeKnowledgeDocument
   * (Storage → di_knowledge_documents → extract/OCR → chunks → verify).
   * Large files use TUS resumable upload with real 0–100% progress; ingestion
   * never starts before upload reaches 100% and Storage object is verified.
   * Large files are NOT fully arrayBuffer()'d before TUS (Safari/iPhone).
   */
  const onUploadAndIndex = async () => {
    if (!uploadFile) {
      setMessage(uploadMissingFileMessage(existingNfpa13));
      return;
    }
    if (persistedMode && !authCompany) {
      setMessage(
        'FAILED: no authenticated company UUID — cannot persist to Supabase Storage/DB.'
      );
      setIndexStatus('failed');
      return;
    }
    setBusy(true);
    setUploadPercent(0);
    setUploadPhase('uploading');
    setUploadHandle(null);
    setLastUploadError(null);
    try {
      const large = shouldUseResumableUpload(uploadFile.size);
      const resumeKey = `ck-resume:${company}:${uploadCode}:${uploadEdition}:${uploadFile.name}:${uploadFile.size}:${uploadFile.lastModified}`;
      let docId = resumeDocumentId;
      if (!docId && typeof sessionStorage !== 'undefined') {
        try {
          docId = sessionStorage.getItem(resumeKey);
        } catch {
          docId = null;
        }
      }
      if (!docId) {
        docId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
        setResumeDocumentId(docId);
        try {
          sessionStorage.setItem(resumeKey, docId);
        } catch {
          /* ignore quota */
        }
      }

      setMessage(
        large
          ? `Uploading large file via resumable TUS (${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB)…`
          : 'Uploading…'
      );

      // Small files: load bytes once (unchanged successful path).
      // Large files: pass File only — stream SHA + TUS without full ArrayBuffer first.
      const bytes = large
        ? null
        : new Uint8Array(await uploadFile.arrayBuffer());

      const result = await uploadAndIngestCodeKnowledgeDocument({
        companyId: company,
        code: uploadCode.trim() || 'NFPA-13',
        edition: uploadEdition.trim() || '2025',
        title: `${uploadCode} ${uploadEdition} — ${uploadFile.name}`,
        fileName: uploadFile.name,
        mimeType: uploadFile.type || undefined,
        bytes,
        file: uploadFile,
        resumeDocumentId: docId,
        source_document_id: `platform_upload:${uploadCode}-${uploadEdition}:${uploadFile.name}`,
        source_type: 'PROJECT_PROVIDED_DOCUMENT',
        verification_status: 'PROJECT_COVER_IDENTIFIED',
        platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
        adoption_status: 'PROJECT_ADOPTED',
        replaceIfChanged: true,
        onUploadProgress: (percent) => setUploadPercent(percent),
        onPhase: (phase) => {
          setUploadPhase(phase);
          setIndexStatus(phase);
          setOperationStage(String(phase));
          if (phase === 'indexing') {
            setUploadPercent((prev) => (prev < 5 ? 5 : prev));
          }
        },
        registerUploadHandle: (handle) => setUploadHandle(handle),
      });

      if (result.status === 'failed') {
        setIndexStatus('failed');
        setUploadPhase('failed');
        const err =
          ('error' in result ? result.error : null) || 'ingestion_failed';
        setLastUploadError(err);
        await refresh();
        setMessage(
          `FAILED: ${err}. Use Retry to resume the same Storage path (no duplicate document). No silent session-memory fallback.`
        );
        return;
      }

      if (result.status === 'skipped_duplicate') {
        setIndexStatus(
          result.document.persisted ? 'skipped_duplicate' : 'failed'
        );
        setUploadPhase('idle');
        setUploadPercent(0);
        setResumeDocumentId(null);
        try {
          sessionStorage.removeItem(resumeKey);
        } catch {
          /* ignore */
        }
        await refresh();
        setMessage(
          result.document.persisted
            ? `Identical SHA-256 — already persisted (no re-upload). document_id=${result.document.id}`
            : `FAILED: duplicate only in session-memory — re-upload required for Supabase persistence.`
        );
        return;
      }

      // Indexed only when Production persistence verified (or demo local mode)
      if (persistedMode && !result.document.persisted) {
        setIndexStatus('failed');
        setUploadPhase('failed');
        const err = result.document.persist_error || 'not_persisted';
        setLastUploadError(err);
        await refresh();
        setMessage(
          `FAILED: ${err}. Storage/DB required.`
        );
        return;
      }

      setResumeDocumentId(null);
      try {
        sessionStorage.removeItem(resumeKey);
      } catch {
        /* ignore */
      }
      setLastUploadError(null);

      if (
        uploadCode.trim() === 'NFPA-13' &&
        uploadEdition.trim() === '2025' &&
        (result.document.persisted || !persistedMode)
      ) {
        adoptNfpa13_2025ForProject({
          companyId: company,
          clientId: client,
          source_document_id: result.document.source_document_id || result.document.id,
        });
        registerNfpa13_2025RuleShells();
      }

      setUploadPhase('indexed');
      setIndexStatus(result.document.index_status || 'indexed');
      setUploadPercent(100);
      await refresh();
      const method =
        'upload_method' in result && result.upload_method
          ? result.upload_method
          : 'standard';
      setMessage(
        persistedMode
          ? `SUPABASE / PERSISTED · upload=${method} · document_id=${result.document.id} · path=${result.storage_path} · pages=${result.document.page_count} extracted=${result.document.pages_extracted} ocr=${result.document.pages_ocr} chunks=${result.chunk_count}`
          : `LOCAL / NOT SAVED · pages=${result.document.page_count} chunks=${result.chunk_count}`
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setLastUploadError(err);
      setIndexStatus('failed');
      setUploadPhase('failed');
      setMessage(`FAILED: ${err}. No silent session-memory fallback.`);
    } finally {
      setBusy(false);
      setUploadHandle(null);
    }
  };

  const onReingest = async (documentId: string) => {
    if (busy || reingestingId) return;
    if (!canReingest) {
      setMessage('FAILED: إعادة الفهرسة متاحة لمسؤول المستأجر فقط.');
      return;
    }
    const confirmed = window.confirm(
      'سيتم إعادة فهرسة المستند الحالي من الملف الموجود في التخزين. لن يتم إنشاء مستند جديد.'
    );
    if (!confirmed) return;

    setBusy(true);
    setReingestingId(documentId);
    setMessage(null);
    setUploadPhase('indexing');
    setUploadPercent(0);
    startOperationTimer('AUTH');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REINGEST_CLIENT_TIMEOUT_MS);
    try {
      setOperationStage('AUTH');
      let accessToken = await getBrowserAccessToken();
      if (!accessToken) {
        const { data: authData, error: authErr } = await supabase.auth.getSession();
        accessToken = authData.session?.access_token || null;
        if (authErr || !accessToken) {
          setUploadPhase('failed');
          setIndexStatus('failed');
          setMessage(
            'FAILED: لا توجد جلسة Supabase مصادَقة — سجّل الدخول ثم أعد المحاولة.'
          );
          return;
        }
      }

      setOperationStage('REINGEST_REQUEST');
      setMessage('Reingest in progress… waiting for server stages (download → extract → chunks).');
      const response = await fetch('/api/design/knowledge/reingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ documentId }),
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setUploadPhase('failed');
        setIndexStatus('failed');
        setMessage(`FAILED: reingest endpoint returned non-JSON (${response.status})`);
        return;
      }
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        documentId?: string;
        ingestion_version?: number | null;
        page_count?: number | null;
        chunks_after?: number;
        chunks_before?: number;
        code?: string | null;
        edition?: string | null;
        index_status?: string | null;
        ingestion_status?: string | null;
      };
      if (!response.ok || !payload.ok) {
        setUploadPhase('failed');
        setIndexStatus('failed');
        setMessage(`FAILED: ${payload.error || `reingest_failed (${response.status})`}`);
        return;
      }

      await refresh();
      const known =
        docs.find((d) => d.id === documentId)?.title ||
        docs.find((d) => d.id === documentId)?.file_name ||
        payload.code ||
        documentId;
      setUploadPhase('indexed');
      setIndexStatus('indexed');
      setUploadPercent(100);
      setMessage(
        `تمت إعادة الفهرسة بنجاح · ${known} · ingestion_version=${payload.ingestion_version ?? '—'} · pages=${payload.page_count ?? '—'} · chunks=${payload.chunks_after ?? '—'} (was ${payload.chunks_before ?? '—'}) · index=${payload.index_status || '—'} · ingestion=${payload.ingestion_status || '—'} · elapsed=${formatElapsed(operationElapsedMs)}`
      );
    } catch (err) {
      setUploadPhase('failed');
      setIndexStatus('failed');
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (aborted) {
        setMessage(
          'FAILED: Reingest exceeded server execution time; operation status must be checked before retry.'
        );
      } else {
        setMessage(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      window.clearTimeout(timeoutId);
      finishOperation(null);
      setBusy(false);
      setReingestingId(null);
    }
  };

  /**
   * Resume incomplete chunk persistence from existing Storage (no re-upload).
   * Preserves valid chunks; fills missing pages via authenticated session.
   */
  const onResumeChunks = async (d: CodeKnowledgeDocumentMeta) => {
    if (busy || reingestingId) return;
    if (!d.storage_path) {
      setMessage('FAILED: storage_path_missing — cannot resume without Storage object.');
      return;
    }
    if (persistedMode && !authCompany) {
      setMessage('FAILED: no authenticated company UUID — cannot resume.');
      return;
    }
    setBusy(true);
    setMessage(
      `Resuming chunks from Storage (no re-upload)… document_id=${d.id}`
    );
    setUploadPhase('chunking');
    setUploadPercent(0);
    startOperationTimer('RESUME_START');
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
    }, RESUME_CLIENT_TIMEOUT_MS);
    try {
      const result = await resumeIncompleteCodeKnowledgeIngestion({
        companyId: company,
        documentId: d.id,
        storagePath: d.storage_path,
        storageBucket: d.storage_bucket || CODE_KNOWLEDGE_STORAGE_BUCKET,
        code: d.code,
        edition: d.edition,
        title: d.title,
        fileName: d.file_name || undefined,
        mimeType: d.mime_type || d.file_mime || undefined,
        onPhase: (phase) => {
          setUploadPhase(phase);
          setIndexStatus(phase);
        },
      });
      if (timedOut) {
        setUploadPhase('failed');
        setIndexStatus('failed');
        setMessage(
          'FAILED: Reingest exceeded server execution time; operation status must be checked before retry.'
        );
        return;
      }
      await refresh();
      if (result.status === 'failed') {
        setUploadPhase('failed');
        setIndexStatus('failed');
        setMessage(
          `FAILED: ${result.error || 'resume_failed'}. coverage max_page_end=${result.coverage_after?.max_page_end ?? '—'} missing=${(result.missing_pages || []).slice(0, 12).join(',') || '—'}`
        );
        return;
      }
      setUploadPhase('indexed');
      setIndexStatus('indexed');
      setMessage(
        `SUPABASE / RESUMED · document_id=${result.document.id} · chunks=${result.chunk_count} · pages=${result.page_count} · max_page_end=${result.coverage_after?.max_page_end ?? '—'} · missing=${(result.missing_pages || []).length}`
      );
    } catch (err) {
      setUploadPhase('failed');
      setIndexStatus('failed');
      setMessage(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      window.clearTimeout(timeoutId);
      finishOperation(null);
      setBusy(false);
    }
  };

  const confirmDeleteMessage = (d: CodeKnowledgeDocumentMeta, duplicate: boolean) => {
    const title = d.file_name || d.title || d.id;
    if (duplicate) {
      return `Delete duplicate document?\n\n${title}\nID: ${d.id}\n\nRemoves Storage object, chunks, and indexing jobs, then soft-deletes this duplicate. Canonical copy is kept.`;
    }
    return `Delete document?\n\n${title}\nID: ${d.id}\n\nPermanently removes the Storage file and chunks, then soft-deletes the document. This cannot be undone from the UI.`;
  };

  const onDeleteDocument = async (
    d: CodeKnowledgeDocumentMeta,
    duplicateOnly: boolean
  ) => {
    if (!window.confirm(confirmDeleteMessage(d, duplicateOnly))) return;
    setBusy(true);
    setMessage(null);
    try {
      const result: KnowledgeDeleteResult = await deleteKnowledgeDocument({
        documentId: d.id,
        companyId: company,
        duplicateOnly,
        confirmed: true,
      });
      if (!result.ok) {
        if (result.code === 'document_in_use') {
          setMessage(
            'Document is in use — unlink from project adoption / code edition first.'
          );
        } else if (result.code === 'canonical_protected') {
          setMessage(
            'Cannot delete canonical document. Use Delete duplicate on a non-canonical copy.'
          );
        } else if (result.code === 'company_mismatch') {
          setMessage(
            'FAILED: company isolation — cannot delete another company document.'
          );
        } else {
          setMessage(`FAILED: ${result.error}`);
        }
      } else {
        setMessage(
          duplicateOnly
            ? `Duplicate soft-deleted. chunks_removed=${result.chunksRemoved} storage_removed=${result.storageRemoved}`
            : `Document soft-deleted. chunks_removed=${result.chunksRemoved} storage_removed=${result.storageRemoved}`
        );
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSearch = () => {
    const edition = adoption?.edition || uploadEdition || '2025';
    const found = searchCodeKnowledge({
      companyId: company,
      code: uploadCode || 'NFPA-13',
      edition,
      query,
      topK: 6,
    });
    setHits(found);
    setSelectedHit(found[0] || null);
    const explained = explainCodeKnowledgeHits(found);
    setMessage(explained.message);
  };

  const onCompare = () => {
    registerCodeEdition({
      companyId: company,
      code: 'NFPA-13',
      edition: '2028',
      title: 'NFPA 13 (draft future edition — not adopted)',
      status: 'draft',
      platform_verification_status: 'NOT_VERIFIED_OFFICIAL',
      idempotent: true,
    });
    registerEditionRuleShellsForNewEdition({
      code: 'NFPA-13',
      edition: '2028',
      rule_codes: [...NFPA13_PIPELINE_RULE_IDS],
    });
    const result = compareCodeEditions('NFPA-13', '2025', '2028');
    setCompare(result);
    void refresh();
    setMessage(
      `Comparison status=${result.status}. new_edition_activated=${result.new_edition_activated}. Project stays on ${adoption?.edition || '2025'}.`
    );
  };

  const onAdvanceReview = (editionId: string) => {
    const row = advanceCodeEditionStatus(editionId, 'pending_engineer_review');
    void refresh();
    setMessage(row ? `Edition → ${row.status}` : 'Invalid status transition');
  };

  return (
    <div className="space-y-6">
      {isSuperAdminRole(session?.roleCode || profile?.role_code) ? (
        <div className="mb-4">
          <SaudiOnlyKnowledgeCleanupPanel />
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold text-slate-900">Code Knowledge Pipeline</h2>
          <PersistenceBadge persistedMode={persistedMode} docPersisted={persistedMode} />
        </div>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Upload NFPA / code documents into private Supabase Storage (
          <code className="text-xs">{CODE_KNOWLEDGE_STORAGE_BUCKET}</code>
          ), ingest with page-preserving extraction, and search with citations. RAG is advisory —
          it cannot produce PASS. Compliance authority remains{' '}
          <code className="text-xs">lib/projects/compliance</code>.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Mode: {persistedMode ? 'SUPABASE / PERSISTED' : 'LOCAL / NOT SAVED'} · list source=
          {listSource} · company=
          <code className="text-[10px]">{company}</code>
        </p>
        {existingNfpa13 ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            <div className="font-semibold">NFPA 13-2025 موجود في التخزين (مستند مفهرس)</div>
            <div className="mt-1 text-xs break-all">
              document_id=<code>{existingNfpa13.id}</code> · path=
              <code>{existingNfpa13.storage_path}</code> · pages=
              {existingNfpa13.page_count ?? '—'} · chunks={existingNfpa13.chunk_count ?? 0} ·
              ingestion_version={existingNfpa13.ingestion_version ?? '—'}
            </div>
            {canReingest ? (
              <button
                type="button"
                disabled={busy || Boolean(reingestingId)}
                className="mt-2 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                onClick={() => void onReingest(existingNfpa13.id)}
              >
                {reingestingId === existingNfpa13.id
                  ? 'جاري إعادة الفهرسة...'
                  : 'إعادة الفهرسة'}
              </button>
            ) : (
              <p className="mt-2 text-xs text-emerald-900/80">
                إعادة الفهرسة متاحة لمسؤول المستأجر فقط.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            لم يُعثر على مستند NFPA 13-2025 مفهرس لهذا المستأجر في القائمة المحمّلة من قاعدة
            المعرفة. ارفع الملف من لوحة الرفع أدناه إن لزم.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
            onClick={onBootstrap}
          >
            Register + adopt NFPA-13 2025
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={onRegisterSource}
          >
            Index text excerpt
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={onSearch}
          >
            Search code
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            onClick={onCompare}
          >
            Compare 2025 vs 2028
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            onClick={() => {
              resetCodeKnowledgeStore();
              resetInMemoryCodeKnowledgeStorage();
              setHits([]);
              setCompare(null);
              setSelectedHit(null);
              setIndexStatus('—');
              setMessage('In-memory code knowledge + Storage mock cleared.');
              void refresh();
            }}
          >
            Reset session store
          </button>
        </div>
        {message && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              message.startsWith('FAILED')
                ? 'bg-rose-50 text-rose-900'
                : 'bg-white/80 text-slate-700'
            }`}
          >
            {message}
          </p>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-medium text-slate-900">Upload Document</h3>
        <p className="mt-1 text-xs text-slate-500">
          Browser/File → authenticated Storage → {CODE_KNOWLEDGE_STORAGE_BUCKET} →
          di_knowledge_documents → extract/OCR → di_knowledge_chunks → UI refresh from Supabase.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs text-slate-500">
            Code
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={uploadCode}
              onChange={(e) => setUploadCode(e.target.value)}
              placeholder="NFPA-13"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Edition
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={uploadEdition}
              onChange={(e) => setUploadEdition(e.target.value)}
              placeholder="2025"
            />
          </label>
          <label className="block text-xs text-slate-500 sm:col-span-2">
            File
            <input
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              className="mt-1 w-full text-sm"
              onChange={(e) => {
                setUploadFile(e.target.files?.[0] || null);
                setResumeDocumentId(null);
                setLastUploadError(null);
                setUploadPhase('idle');
                setUploadPercent(0);
              }}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-cyan-700 px-3 py-2 text-sm text-white disabled:opacity-50"
            onClick={() => void onUploadAndIndex()}
          >
            {busy ? 'Working…' : uploadLabel}
          </button>
          {uploadHandle && uploadPhase === 'uploading' ? (
            <button
              type="button"
              className="rounded-lg border border-amber-400 px-3 py-2 text-sm text-amber-800"
              onClick={() => uploadHandle.pause()}
            >
              Pause upload
            </button>
          ) : null}
          {uploadHandle && uploadPhase === 'upload_paused' ? (
            <button
              type="button"
              className="rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-800"
              onClick={() => uploadHandle.resume()}
            >
              Resume upload
            </button>
          ) : null}
          {uploadPhase === 'failed' && uploadFile && !busy ? (
            <button
              type="button"
              className="rounded-lg border border-rose-400 px-3 py-2 text-sm text-rose-800"
              onClick={() => void onUploadAndIndex()}
            >
              Retry / Resume
            </button>
          ) : null}
          <span className="self-center text-xs text-slate-500">
            Path: {'{company}'}/code-knowledge/{'{code}'}/{'{edition}'}/{'{documentId}'}/file
            · large files (≥6MB) use resumable TUS
          </span>
        </div>
        {lastUploadError ? (
          <p className="mt-2 text-xs text-rose-700 font-mono break-all">{lastUploadError}</p>
        ) : null}
        {(busy || uploadPercent > 0) && uploadPhase !== 'idle' ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>
                {uploadPhase === 'uploading' || uploadPhase === 'upload_paused'
                  ? `Uploading ${uploadPercent}%`
                  : operationStage
                    ? `${uploadPhase} · ${operationStage}`
                    : uploadPhase}
                {busy ? ` · elapsed ${formatElapsed(operationElapsedMs)}` : ''}
              </span>
              <span className="font-mono">{uploadPercent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-cyan-600 transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.max(0, uploadPercent))}%` }}
                role="progressbar"
                aria-valuenow={uploadPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 overflow-x-auto">
        <h3 className="font-medium text-slate-900">Documents</h3>
        <p className="mt-1 text-xs text-slate-500">
          Last status: {indexStatus} · bucket={CODE_KNOWLEDGE_STORAGE_BUCKET} · source={listSource}
        </p>
        <table className="mt-3 w-full min-w-[1200px] text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-2 pr-2">Persisted</th>
              <th className="py-2 pr-2">Code</th>
              <th className="py-2 pr-2">Edition</th>
              <th className="py-2 pr-2">Document</th>
              <th className="py-2 pr-2">Document ID</th>
              <th className="py-2 pr-2">Storage Path</th>
              <th className="py-2 pr-2">Pages</th>
              <th className="py-2 pr-2">Extracted</th>
              <th className="py-2 pr-2">OCR</th>
              <th className="py-2 pr-2">Chunks</th>
              <th className="py-2 pr-2">Ingestion</th>
              <th className="py-2 pr-2">Index</th>
              <th className="py-2 pr-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const isIndexed =
                d.index_status === 'indexed' &&
                (d.chunk_count || 0) > 0 &&
                Boolean(d.storage_path) &&
                (persistedMode ? d.persisted === true : true);
              const displayIndex = isIndexed ? 'indexed' : d.index_status === 'indexed' && !isIndexed ? 'failed' : d.index_status;
              return (
                <tr key={d.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-semibold">
                      {d.persisted ? 'YES' : 'NO'}
                    </div>
                    <PersistenceBadge
                      persistedMode={persistedMode}
                      docPersisted={d.persisted}
                    />
                  </td>
                  <td className="py-2 pr-2 font-medium">{d.code}</td>
                  <td className="py-2 pr-2">{d.edition}</td>
                  <td className="py-2 pr-2">{d.file_name || d.title}</td>
                  <td className="py-2 pr-2 font-mono text-[10px] break-all">{d.id}</td>
                  <td className="py-2 pr-2 font-mono text-[10px] break-all">
                    {d.storage_path || '—'}
                  </td>
                  <td className="py-2 pr-2">{d.page_count ?? '—'}</td>
                  <td className="py-2 pr-2">{d.pages_extracted ?? '—'}</td>
                  <td className="py-2 pr-2">{d.pages_ocr ?? (d.ocr_used ? 'yes' : '—')}</td>
                  <td className="py-2 pr-2">{d.chunk_count ?? 0}</td>
                  <td className="py-2 pr-2">{d.ingestion_status || '—'}</td>
                  <td className="py-2 pr-2">{displayIndex}</td>
                  <td className="py-2 pr-2 space-y-1">
                    {(d.ingestion_status === 'failed' ||
                      (Boolean(d.storage_path) &&
                        (d.chunk_count || 0) > 0 &&
                        !isIndexed)) &&
                    d.storage_path ? (
                      <button
                        type="button"
                        disabled={busy || Boolean(reingestingId)}
                        className="block text-amber-800 underline font-semibold disabled:opacity-40"
                        onClick={() => void onResumeChunks(d)}
                      >
                        Resume chunks
                      </button>
                    ) : null}
                    {canReingest && isKnowledgeDocumentPresentInStorage(d) ? (
                      <button
                        type="button"
                        disabled={busy || Boolean(reingestingId)}
                        className="block text-cyan-800 underline font-semibold disabled:opacity-40"
                        onClick={() => void onReingest(d.id)}
                      >
                        {reingestingId === d.id ? 'جاري إعادة الفهرسة...' : 'إعادة الفهرسة'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      className="block text-slate-600 underline disabled:opacity-40"
                      onClick={() => {
                        setUploadCode(d.code);
                        setUploadEdition(d.edition);
                        setMessage(
                          isKnowledgeDocumentPresentInStorage(d)
                            ? 'المستند موجود في التخزين. استخدم إعادة الفهرسة بدل رفع ملف جديد، أو اختر ملفاً جديداً فقط لإنشاء إصدار بديل (SHA مختلف).'
                            : 'Select a new file then رفع وفهرسة to Replace / New Version (SHA change required).'
                        );
                      }}
                    >
                      Replace / New Version
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="block text-rose-700 underline disabled:opacity-40"
                      onClick={() => void onDeleteDocument(d, false)}
                    >
                      Delete
                    </button>
                    {documentHasSha256Duplicate(d, company) ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="block text-amber-700 underline disabled:opacity-40"
                        onClick={() => void onDeleteDocument(d, true)}
                      >
                        Delete duplicate
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!docs.length && (
              <tr>
                <td colSpan={13} className="py-4 text-slate-400">
                  No documents yet for this company.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-medium text-slate-900">Available codes</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {codes.length ? codes.map((c) => <li key={c}>{c}</li>) : <li className="text-slate-400">None yet</li>}
          </ul>
          <h3 className="mt-4 font-medium text-slate-900">Editions</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {editions.map((e) => (
              <li key={e.id} className="rounded-lg border border-slate-100 p-2">
                <div className="font-medium">
                  {e.code} · {e.edition}
                </div>
                <div className="text-xs text-slate-500">
                  status={e.status} · adopt={e.adoption_status} · platform=
                  {e.platform_verification_status}
                </div>
                {e.status === 'indexed' || e.status === 'draft' || e.status === 'available' ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-cyan-700 underline"
                    onClick={() => onAdvanceReview(e.id)}
                  >
                    Send to engineer review
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-medium text-slate-900">Project adoption</h3>
          {adoption ? (
            <dl className="mt-2 space-y-1 text-sm text-slate-700">
              <div>
                <dt className="inline text-slate-500">Code: </dt>
                <dd className="inline">{adoption.code}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Edition: </dt>
                <dd className="inline font-medium">{adoption.edition}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Verification: </dt>
                <dd className="inline">{adoption.verification_status}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Platform: </dt>
                <dd className="inline">{adoption.platform_verification_status}</dd>
              </div>
              <div>
                <dt className="inline text-slate-500">Source: </dt>
                <dd className="inline break-all">{adoption.source_document_id}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No adopted edition for this project.</p>
          )}
          <label className="mt-4 block text-xs text-slate-500">
            Optional text excerpt (Demo LOCAL only — not Production)
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"
              rows={5}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-medium text-slate-900">Rule status</h3>
          <ul className="mt-2 max-h-72 space-y-1 overflow-auto text-xs">
            {rules.map((r) => (
              <li key={r.id} className="rounded border border-slate-100 px-2 py-1">
                <span className="font-medium">{r.rule_code}</span>
                <span className="text-slate-500"> · {r.edition} · </span>
                <span
                  className={
                    r.verification_status === 'RULE_NOT_CONFIGURED'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }
                >
                  {r.verification_status}
                </span>
                {r.numeric_value != null || r.numeric_min != null ? (
                  <span className="text-rose-700"> · has numeric</span>
                ) : (
                  <span className="text-slate-400"> · no numeric</span>
                )}
              </li>
            ))}
            {!rules.length && <li className="text-slate-400">No rules registered</li>}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-medium text-slate-900">Code search (RAG)</h3>
        <p className="mt-1 text-xs text-amber-800">
          Filtered by code + edition (+ optional document/section/page). Never returns another edition.
          Cannot produce compliance PASS.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search adopted edition…"
          />
          <button
            type="button"
            className="rounded-lg bg-cyan-700 px-3 py-2 text-sm text-white"
            onClick={onSearch}
          >
            Search
          </button>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ul className="space-y-2 text-sm">
            {hits.map((h) => (
              <li key={h.chunk.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    selectedHit?.chunk.id === h.chunk.id
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-slate-100'
                  }`}
                  onClick={() => setSelectedHit(h)}
                >
                  <div className="font-medium">
                    {h.code} {h.edition} · score {h.relevance_score}
                  </div>
                  <div className="text-xs text-slate-500">
                    section={h.section || '—'} · table={h.table || '—'} · page={h.page ?? '—'} ·{' '}
                    {h.source_verification_status} · {h.document_scope}
                  </div>
                </button>
              </li>
            ))}
            {!hits.length && <li className="text-slate-400">No results</li>}
          </ul>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
            {selectedHit ? (
              <>
                <div className="text-xs text-slate-500">
                  Source: {selectedHit.chunk.source_document_id || '—'} · verification=
                  {selectedHit.source_verification_status} · method=
                  {selectedHit.chunk.extraction_method || '—'} · pages=
                  {selectedHit.chunk.page_start ?? '—'}–{selectedHit.chunk.page_end ?? '—'}
                </div>
                <pre className="mt-2 whitespace-pre-wrap text-slate-800">{selectedHit.chunk.content}</pre>
                <p className="mt-2 text-xs text-amber-800">
                  Advisory excerpt only — cannot produce compliance PASS.
                </p>
              </>
            ) : (
              <p className="text-slate-400">Select a result</p>
            )}
          </div>
        </div>
      </section>

      {compare && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h3 className="font-medium text-slate-900">Edition comparison</h3>
          <p className="mt-1 text-slate-600">
            {compare.code} {compare.old_edition} → {compare.new_edition} · {compare.status} ·
            activated={String(compare.new_edition_activated)}
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <li>Added: {compare.added_rules.length}</li>
            <li>Removed: {compare.removed_rules.length}</li>
            <li>Changed: {compare.changed_rules.length}</li>
            <li>Unchanged: {compare.unchanged_rules.length}</li>
            <li>Needs review: {compare.rules_requiring_engineer_review.length}</li>
            <li>Became NOT_CONFIGURED: {compare.rules_became_not_configured.length}</li>
          </ul>
        </section>
      )}
    </div>
  );
}
