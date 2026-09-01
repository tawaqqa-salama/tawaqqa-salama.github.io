'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import {
  EXPECTED_PRODUCTION_SUPABASE_REF,
  getSupabaseProjectRef,
  getSupabaseRuntimeDiagnostics,
  isSupabaseConfigured,
  SUPABASE_PERSISTENCE_UNAVAILABLE,
  supabase,
} from '@/lib/supabase';
import {
  analyticsSnapshot,
  assertEngineeringDecision,
  createWorkspaceFromClient,
  ensureSeedKnowledgeBase,
  knowledgeCategories,
  listChecklists,
  listIndexingJobs,
  listKnowledgeDocuments,
  listKnowledgeDocumentsSync,
  listLessons,
  listNotifications,
  listTasks,
  listWorkspaces,
  markNotificationRead,
  rescheduleWorkspaceTasks,
  saveChecklist,
  seedSmartNotifications,
  suggestEngineeringSystems,
  timelineHealth,
  updateTask,
  updateWorkspace,
  addWorkspaceNote,
  uploadAndIndexKnowledgeFile,
  KnowledgePersistError,
  buildKnowledgeUploadDiagnostics,
  deleteKnowledgeDocument,
  documentHasSha256Duplicate,
  resumeIncompleteCodeKnowledgeIngestion,
  addLesson,
  type DesignIntelligenceTabId,
  type DiDesignChecklist,
  type DiDesignTask,
  type DiDesignWorkspace,
  type DiKnowledgeDocument,
  type EngineeringFormState,
  type KnowledgeUploadDiagnostics,
  type KnowledgeDeleteResult,
  type RagAnswer,
} from '@/lib/design-intelligence';
import EngineeringRulesPanel from '@/components/design/EngineeringRulesPanel';
import CodeKnowledgePanel from '@/components/design/CodeKnowledgePanel';
import { runBlueprintAiAudit } from '@/lib/compliance/blueprint-audit';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { EngineeringSelection } from '@/lib/design-intelligence/rules-types';
import type { ClientRecord } from '@/lib/types/client';
import type { BlueprintAiAuditResult } from '@/lib/types/project-reports';

const TABS: { id: DesignIntelligenceTabId; labelKey: string; fallback: string }[] = [
  { id: 'knowledge', labelKey: 'design.tab.knowledge', fallback: 'Knowledge Base' },
  { id: 'codes', labelKey: 'design.tab.codes', fallback: 'Code Knowledge' },
  { id: 'rag', labelKey: 'design.tab.rag', fallback: 'AI Knowledge Engine' },
  { id: 'workspace', labelKey: 'design.tab.workspace', fallback: 'Design Workspace' },
  { id: 'rules', labelKey: 'design.tab.rules', fallback: 'Decision Engine' },
  { id: 'planner', labelKey: 'design.tab.planner', fallback: 'AI Design Planner' },
  { id: 'assistant', labelKey: 'design.tab.assistant', fallback: 'Decision Feed' },
  { id: 'drawings', labelKey: 'design.tab.drawings', fallback: 'Drawing Review AI' },
  { id: 'timeline', labelKey: 'design.tab.timeline', fallback: 'Timeline' },
  { id: 'notifications', labelKey: 'design.tab.notifications', fallback: 'Notifications' },
  { id: 'checklist', labelKey: 'design.tab.checklist', fallback: 'Checklists' },
  { id: 'copilot', labelKey: 'design.tab.copilot', fallback: 'Engineering Copilot' },
  { id: 'lessons', labelKey: 'design.tab.lessons', fallback: 'Lessons Learned' },
  { id: 'analytics', labelKey: 'design.tab.analytics', fallback: 'Analytics' },
];

export default function DesignIntelligenceModule() {
  const { t, lang } = useLanguage();
  const { session, profile } = useAuth();
  const tenantCompanyId =
    session?.companyId || profile?.company_id || undefined;
  const [tab, setTab] = useState<DesignIntelligenceTabId>('knowledge');
  const [docs, setDocs] = useState<DiKnowledgeDocument[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<DiDesignWorkspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string>('');
  const [tasks, setTasks] = useState<DiDesignTask[]>([]);
  const [checklists, setChecklists] = useState<DiDesignChecklist[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kbDiag, setKbDiag] = useState<KnowledgeUploadDiagnostics>(() =>
    buildKnowledgeUploadDiagnostics({
      authenticated: Boolean(session),
      company_id_present: Boolean(tenantCompanyId),
    })
  );

  // Knowledge upload form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(knowledgeCategories()[0]);
  const [discipline, setDiscipline] = useState('Fire Protection');
  const [codes, setCodes] = useState('SBC 801, NFPA 13');
  const [revision, setRevision] = useState('A');
  const [author, setAuthor] = useState('');
  const [versionLabel, setVersionLabel] = useState('1.0');
  const [buildingTypeMeta, setBuildingTypeMeta] = useState('');
  const [hazardMeta, setHazardMeta] = useState('');
  const [tagsMeta, setTagsMeta] = useState('');
  const [notesMeta, setNotesMeta] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [kbUploadPercent, setKbUploadPercent] = useState(0);
  const [kbUploadPhase, setKbUploadPhase] = useState<string>('idle');
  const [kbUploadHandle, setKbUploadHandle] = useState<{
    pause: () => void;
    resume: () => void;
    abort: () => void;
  } | null>(null);

  // RAG / Copilot
  const [question, setQuestion] = useState('');
  const [rag, setRag] = useState<RagAnswer | null>(null);

  // Drawing review
  const [audit, setAudit] = useState<BlueprintAiAuditResult | null>(null);

  // Lessons / workspace notes
  const [lessonProblem, setLessonProblem] = useState('');
  const [lessonSolution, setLessonSolution] = useState('');
  const [wsNote, setWsNote] = useState('');
  const [wsReq, setWsReq] = useState('');
  const [rulesSelection, setRulesSelection] = useState<EngineeringSelection>({});
  const [decisionGateOk, setDecisionGateOk] = useState(false);

  const label = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t]
  );

  const refresh = useCallback(() => {
    ensureSeedKnowledgeBase();
    setDocs(listKnowledgeDocumentsSync());
    setWorkspaces(listWorkspaces());
    const wsId = activeWsId || listWorkspaces()[0]?.id || '';
    if (!activeWsId && wsId) setActiveWsId(wsId);
    setTasks(listTasks(wsId || undefined));
    setChecklists(listChecklists(wsId || undefined));
    void listKnowledgeDocuments().then(setDocs);
  }, [activeWsId]);

  useEffect(() => {
    refresh();
    void supabase
      .from('clients')
      .select('id,name,business_name,activity_type,building_area,floors_count,owner_name,assigned_engineer')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setClients((data || []) as ClientRecord[]));
  }, [refresh]);

  useEffect(() => {
    setTasks(listTasks(activeWsId || undefined));
    setChecklists(listChecklists(activeWsId || undefined));
  }, [activeWsId]);

  const activeWs = useMemo(
    () => workspaces.find((w) => w.id === activeWsId) || workspaces[0] || null,
    [workspaces, activeWsId]
  );

  const health = useMemo(() => timelineHealth(tasks), [tasks]);
  const stats = useMemo(() => analyticsSnapshot(), [workspaces, tasks, tab]);
  const indexedKnowledgeDocs = useMemo(
    () => docs.filter((d) => d.index_status === 'indexed' && (d.chunk_count || 0) > 0),
    [docs]
  );
  const ragReady = Boolean(tenantCompanyId && indexedKnowledgeDocs.length);
  const ragPromptSuggestions = [
    lang === 'en' ? 'What NFPA requirements apply to this project?' : 'ما متطلبات NFPA المنطبقة على هذا المشروع؟',
    lang === 'en' ? 'What fire pump requirements are cited in the indexed files?' : 'ما متطلبات مضخة الحريق المذكورة في الملفات المفهرسة؟',
    lang === 'en' ? 'Show the cited sprinkler spacing and coverage references.' : 'اعرض مراجع تباعد وتغطية الرشاشات المذكورة.',
  ];

  const onUpload = async () => {
    if (!file || !title.trim()) {
      setMessage(lang === 'en' ? 'Title and file are required.' : 'العنوان والملف مطلوبان.');
      return;
    }
    setBusy(true);
    setMessage(null);
    setKbUploadPercent(0);
    setKbUploadPhase('uploading');
    setKbUploadHandle(null);
    const authenticated = Boolean(session);
    try {
      if (!isSupabaseConfigured) {
        const d = buildKnowledgeUploadDiagnostics({
          authenticated,
          company_id_present: Boolean(tenantCompanyId),
          error: SUPABASE_PERSISTENCE_UNAVAILABLE,
        });
        setKbDiag(d);
        throw new KnowledgePersistError(SUPABASE_PERSISTENCE_UNAVAILABLE, d);
      }
      const companyUuid = tenantCompanyId;
      if (!companyUuid) {
        const d = buildKnowledgeUploadDiagnostics({
          authenticated,
          company_id_present: false,
          error: 'company_uuid_missing',
        });
        setKbDiag(d);
        throw new KnowledgePersistError(
          'Supabase persistence unavailable: sign in with a company UUID.',
          d
        );
      }

      const doc = await uploadAndIndexKnowledgeFile({
        file,
        companyId: companyUuid,
        authenticated,
        meta: {
          title: title.trim(),
          category,
          discipline,
          revision,
          author_name: author,
          version_label: versionLabel,
          building_type: buildingTypeMeta,
          hazard_classification: hazardMeta,
          tags: tagsMeta.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
          keywords: tagsMeta.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
          notes: notesMeta,
          applicable_codes: codes.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
          company_id: companyUuid,
        },
        onUploadProgress: (percent) => setKbUploadPercent(percent),
        onPhase: (phase) => setKbUploadPhase(phase),
        registerUploadHandle: (handle) => setKbUploadHandle(handle),
      });
      setKbDiag(doc.diagnostics);
      setTitle('');
      setFile(null);
      setNotesMeta('');
      setKbUploadPhase('indexed');
      setKbUploadPercent(100);
      setDocs(await listKnowledgeDocuments());
      if (!doc.persistedToCloud) {
        throw new KnowledgePersistError(
          SUPABASE_PERSISTENCE_UNAVAILABLE,
          doc.diagnostics
        );
      }
      const ref = getSupabaseProjectRef() || 'unknown';
      setMessage(
        `SUPABASE / PERSISTED · project=${ref} · document_id=${doc.id} · path=${doc.storage_path} · chunks=${doc.chunk_count}`
      );
    } catch (e) {
      setKbUploadPhase('failed');
      if (e instanceof KnowledgePersistError) {
        setKbDiag(e.diagnostics);
        setMessage(`FAILED: ${e.message}`);
      } else {
        const raw = e instanceof Error ? e.message : 'Upload failed';
        setKbDiag(
          buildKnowledgeUploadDiagnostics({
            authenticated,
            company_id_present: Boolean(tenantCompanyId),
            error: raw,
          })
        );
        setMessage(
          raw.includes('Supabase persistence unavailable')
            ? `FAILED: ${SUPABASE_PERSISTENCE_UNAVAILABLE}`
            : `FAILED: ${raw}`
        );
      }
    } finally {
      setBusy(false);
      setKbUploadHandle(null);
    }
  };

  const onAsk = async () => {
    const query = question.trim();
    if (!query || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/design/rag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: query, topK: 5 }),
      });
      const payload = (await response.json()) as RagAnswer & { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'RAG query failed');
      }
      setRag(payload);
    } catch (error) {
      setRag({
        answer: 'تعذر تشغيل محرك المعرفة. تحقق من تسجيل الدخول ووجود ملفات مفهرسة للشركة.',
        citations: [],
        confidence: 0,
        reliable: false,
        message: error instanceof Error ? error.message : 'RAG query failed',
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Repair failed large NFPA ingest: dedupe + fill gaps from existing Storage.
   * No re-upload. Works from Knowledge Base table (same document_id).
   */
  const onResumeKnowledgeChunks = async (d: DiKnowledgeDocument) => {
    const companyUuid = tenantCompanyId || '';
    if (!companyUuid) {
      setMessage('FAILED: company_id required to resume');
      return;
    }
    if (!d.storage_path) {
      setMessage('FAILED: storage_path_missing');
      return;
    }
    setBusy(true);
    setMessage(`Resuming / repairing chunks (no re-upload)… ${d.id}`);
    setKbUploadPhase('chunking');
    try {
      const result = await resumeIncompleteCodeKnowledgeIngestion({
        companyId: companyUuid,
        documentId: d.id,
        storagePath: d.storage_path,
        storageBucket: d.storage_bucket || undefined,
        code: d.code || 'NFPA-13',
        edition: d.edition || '2025',
        title: d.title,
        fileName: d.file_name || undefined,
        mimeType: d.mime_type || d.file_mime || undefined,
        onPhase: (phase) => setKbUploadPhase(phase),
      });
      setDocs(await listKnowledgeDocuments());
      if (result.status === 'failed') {
        setKbUploadPhase('failed');
        setMessage(
          `FAILED: ${result.error || 'resume_failed'} · chunks=${result.chunk_count} · max_page_end=${result.coverage_after?.max_page_end ?? '—'} · missing=${(result.missing_pages || []).length}`
        );
        return;
      }
      setKbUploadPhase('indexed');
      setMessage(
        `SUPABASE / REPAIRED · document_id=${d.id} · chunks=${result.chunk_count} · pages=${result.page_count} · max_page_end=${result.coverage_after?.max_page_end ?? '—'} · dups_cleared`
      );
    } catch (err) {
      setKbUploadPhase('failed');
      setMessage(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const onDeleteKnowledgeDoc = async (
    d: DiKnowledgeDocument,
    duplicateOnly: boolean
  ) => {
    const companyUuid = tenantCompanyId || '';
    if (!companyUuid) {
      setMessage('FAILED: company_id required to delete');
      return;
    }
    const titleLabel = d.title || d.file_name || d.id;
    const ok = window.confirm(
      duplicateOnly
        ? `Delete duplicate document?\n\n${titleLabel}\nID: ${d.id}\n\nRemoves Storage, chunks, jobs; soft-deletes this duplicate. Canonical is kept.`
        : `Delete document?\n\n${titleLabel}\nID: ${d.id}\n\nRemoves Storage file and chunks, then soft-deletes the document.`
    );
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const result: KnowledgeDeleteResult = await deleteKnowledgeDocument({
        documentId: d.id,
        companyId: companyUuid,
        duplicateOnly,
        confirmed: true,
      });
      if (!result.ok) {
        if (result.code === 'document_in_use') {
          setMessage(
            'Document is in use — unlink from project adoption / code edition first.'
          );
        } else if (result.code === 'canonical_protected') {
          setMessage('Cannot delete canonical document.');
        } else if (result.code === 'company_mismatch') {
          setMessage('FAILED: cannot delete another company document.');
        } else {
          setMessage(`FAILED: ${result.error}`);
        }
      } else {
        setMessage(
          `Soft-deleted ${duplicateOnly ? 'duplicate' : 'document'} · chunks_removed=${result.chunksRemoved} · storage_removed=${result.storageRemoved}`
        );
      }
      setDocs(await listKnowledgeDocuments());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createWs = (client: ClientRecord) => {
    const { workspace } = createWorkspaceFromClient({
      clientId: client.id,
      projectName: client.business_name || client.name || 'Project',
      occupancy: client.activity_type || '',
      areaM2: client.building_area,
      floors: client.floors_count,
      buildingType: client.activity_type || '',
      ownerName: client.assigned_engineer || '',
    });
    setWorkspaces(listWorkspaces());
    setActiveWsId(workspace.id);
    setWsReq(workspace.requirements || '');
    setTasks(listTasks(workspace.id));
    setChecklists(listChecklists(workspace.id));
    setTab('planner');
    setMessage(lang === 'en' ? 'Design workspace + plan created.' : 'تم إنشاء مساحة التصميم وخطة المهام.');
  };

  const assistant = useMemo(() => {
    const buildingType =
      (rulesSelection.building_type as string) ||
      String(activeWs?.building_info?.building_type || '');
    return suggestEngineeringSystems({
      buildingType,
      occupancy: (rulesSelection.occupancy as string) || activeWs?.occupancy || '',
      risk:
        (rulesSelection.risk_classification as string) || activeWs?.risk_classification || '',
      heightM: activeWs?.building_height_m,
      areaM2: activeWs?.area_m2,
      floors: activeWs?.floors_count,
      codes:
        (rulesSelection.applicable_codes as string[]) || activeWs?.applicable_codes || undefined,
      selection: {
        building_type: buildingType || null,
        occupancy:
          (rulesSelection.occupancy as string) || activeWs?.occupancy || null,
        risk_classification:
          (rulesSelection.risk_classification as string) ||
          activeWs?.risk_classification ||
          null,
        applicable_codes:
          (rulesSelection.applicable_codes as string[]) ||
          activeWs?.applicable_codes ||
          null,
        fire_protection_system: (rulesSelection.fire_protection_system as string) || null,
        sprinkler_type: (rulesSelection.sprinkler_type as string) || null,
        pump_requirement: (rulesSelection.pump_requirement as string) || null,
        alarm_category: (rulesSelection.alarm_category as string) || null,
      },
    });
  }, [activeWs, rulesSelection]);

  const onDrawingFile = async (f: File | null) => {
    if (!f) return;
    setBusy(true);
    const result = await Promise.resolve(
      runBlueprintAiAudit({
        blueprintKind: 'fire_fighting_file',
        fileName: f.name,
        sizeBytes: f.size,
        mimeType: f.type,
      })
    );
    setAudit(result);
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {label('design.title', 'Design Intelligence Center')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {label(
            'design.subtitle',
            'Engineering knowledge base, offline RAG, design workspace, planner & copilot — company files only.'
          )}
        </p>
      </div>

      <ModuleSubNavSlot label={label('subnav.design', 'Design Intelligence')}>
        <ModuleTabBar
          ariaLabel={label('subnav.design', 'Design Intelligence')}
          activeId={tab}
          onChange={(id) => setTab(id as DesignIntelligenceTabId)}
          activeClassName="bg-[#635bdb] text-white shadow-sm"
          idleClassName="bg-white border border-gray-200 text-gray-800"
          items={TABS.map((item) => ({
            id: item.id,
            label: label(item.labelKey, item.fallback),
          }))}
        />
      </ModuleSubNavSlot>

      {message ? (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            message.includes('FAILED') || message.includes('Supabase persistence unavailable')
              ? 'border-rose-200 bg-rose-50 text-rose-900'
              : 'border-emerald-100 bg-emerald-50 text-emerald-900'
          }`}
        >
          {message}
        </div>
      ) : null}

      {tab === 'knowledge' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            {lang === 'en'
              ? 'These Civil Defense / code documents auto-link to Sales quotation scope and Project Design Center compliance (SBC/NFPA + RAG citations).'
              : 'لوائح الدفاع المدني والأكواد المرفوعة هنا تُربط تلقائياً بنطاق عرض السعر في المبيعات وبفحص الامتثال في مركز تصاميم المشروع (SBC/NFPA + مراجع المعرفة).'}
          </div>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 rounded-xl border bg-white p-4 space-y-3">
            <h2 className="font-bold text-gray-900">
              {label('design.kb.upload', 'Upload engineering reference')}
            </h2>
            <p className="text-xs text-gray-500">
              PDF, Word, Excel, Images, DWG/DXF, catalogs, SBC/NFPA — OCR/chunk/embed/index offline.
            </p>
            <Field label={label('design.kb.title', 'Title')} value={title} onChange={setTitle} />
            <label className="block text-sm">
              <span className="text-xs font-semibold text-gray-600 mb-1 block">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              >
                {knowledgeCategories().map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Discipline" value={discipline} onChange={setDiscipline} />
              <Field label="Revision" value={revision} onChange={setRevision} />
              <Field label="Author" value={author} onChange={setAuthor} />
              <Field label="Version" value={versionLabel} onChange={setVersionLabel} />
              <Field label="Building Type" value={buildingTypeMeta} onChange={setBuildingTypeMeta} />
              <Field label="Hazard" value={hazardMeta} onChange={setHazardMeta} />
            </div>
            <Field label="Applicable Codes" value={codes} onChange={setCodes} />
            <Field label="Tags / Keywords" value={tagsMeta} onChange={setTagsMeta} />
            <Field label="Notes" value={notesMeta} onChange={setNotesMeta} />
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.dwg,.dxf,.txt,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpload()}
              className="w-full px-4 py-2.5 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? '…' : label('design.kb.index', 'Upload & Index')}
            </button>
            {kbUploadHandle && kbUploadPhase === 'uploading' ? (
              <button
                type="button"
                className="w-full rounded-xl border border-amber-400 px-3 py-2 text-sm text-amber-900"
                onClick={() => kbUploadHandle.pause()}
              >
                Pause upload
              </button>
            ) : null}
            {kbUploadHandle && kbUploadPhase === 'upload_paused' ? (
              <button
                type="button"
                className="w-full rounded-xl border border-emerald-500 px-3 py-2 text-sm text-emerald-900"
                onClick={() => kbUploadHandle.resume()}
              >
                Resume upload
              </button>
            ) : null}
            {kbUploadPhase === 'failed' && file && !busy ? (
              <button
                type="button"
                className="w-full rounded-xl border border-rose-400 px-3 py-2 text-sm text-rose-800"
                onClick={() => void onUpload()}
              >
                Retry / Resume
              </button>
            ) : null}
            {(busy || kbUploadPercent > 0) && kbUploadPhase !== 'idle' ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    {kbUploadPhase === 'uploading' || kbUploadPhase === 'upload_paused'
                      ? `Uploading ${kbUploadPercent}%`
                      : kbUploadPhase}
                  </span>
                  <span className="font-mono">{kbUploadPercent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[#635bdb] transition-[width] duration-200"
                    style={{
                      width: `${Math.min(100, Math.max(0, kbUploadPercent))}%`,
                    }}
                    role="progressbar"
                    aria-valuenow={kbUploadPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </div>
            ) : null}
            <p className="text-[11px] text-gray-400">
              Pipeline: Storage → DB → OCR/chunk/embed/index · jobs:{' '}
              {listIndexingJobs().filter((j) => j.status === 'queued').length} queued
              · ≥6MB uses resumable TUS
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 space-y-0.5 font-mono">
              {(() => {
                const rt = getSupabaseRuntimeDiagnostics();
                const authYes = Boolean(session);
                const companyYes = Boolean(tenantCompanyId);
                return (
                  <>
                    <div>runtime mode: {rt.runtime_mode}</div>
                    <div>
                      project ref: {rt.project_ref || '—'}
                      {rt.project_ref && !rt.project_ref_matches_expected
                        ? ` (expected ${EXPECTED_PRODUCTION_SUPABASE_REF})`
                        : ''}
                    </div>
                    <div>authenticated: {authYes ? 'YES' : 'NO'}</div>
                    <div>companyId present: {companyYes ? 'YES' : 'NO'}</div>
                    <div>
                      storage upload attempted:{' '}
                      {kbDiag.storage_upload_attempted ? 'YES' : 'NO'}
                    </div>
                    <div>
                      DB insert attempted: {kbDiag.db_insert_attempted ? 'YES' : 'NO'}
                    </div>
                    <div>
                      chunks insert attempted:{' '}
                      {kbDiag.chunks_insert_attempted ? 'YES' : 'NO'}
                    </div>
                    {kbDiag.storage_path ? (
                      <div className="break-all">storage path: {kbDiag.storage_path}</div>
                    ) : null}
                    {kbDiag.document_id ? (
                      <div className="break-all">document id: {kbDiag.document_id}</div>
                    ) : null}
                    {kbDiag.error ? (
                      <div className="text-rose-700 break-all">error: {kbDiag.error}</div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>
          <div className="xl:col-span-3">
            <ResponsiveTable className="bg-white rounded-xl border">
              <table className="w-full text-right text-sm table-as-cards">
                <thead className="bg-gray-50 border-b text-gray-600">
                  <tr>
                    <th className="p-3">Title</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Codes</th>
                    <th className="p-3">Pages</th>
                    <th className="p-3">Extracted</th>
                    <th className="p-3">OCR</th>
                    <th className="p-3">Chunks</th>
                    <th className="p-3">Ingestion</th>
                    <th className="p-3">Index</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-b">
                      <td className="p-3 font-semibold" data-label="Title">
                        {d.title}
                        <div className="text-[11px] text-gray-400 font-normal">{d.file_name}</div>
                      </td>
                      <td className="p-3" data-label="Category">
                        {d.category}
                      </td>
                      <td className="p-3 text-xs" data-label="Codes">
                        {(d.applicable_codes || []).join(', ') || d.code || '—'}
                      </td>
                      <td className="p-3" data-label="Pages">
                        {d.page_count ?? '—'}
                      </td>
                      <td className="p-3" data-label="Extracted">
                        {d.pages_extracted ?? '—'}
                      </td>
                      <td className="p-3" data-label="OCR">
                        {d.pages_ocr ?? (d.ocr_used ? 'yes' : '—')}
                      </td>
                      <td className="p-3" data-label="Chunks">
                        {d.chunk_count || 0}
                      </td>
                      <td className="p-3" data-label="Ingestion">
                        <span className="text-xs">{d.ingestion_status || '—'}</span>
                      </td>
                      <td className="p-3" data-label="Index">
                        <span
                          className={`text-xs font-semibold ${
                            d.index_status === 'indexed'
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {d.index_status}
                        </span>
                      </td>
                      <td className="p-3 space-y-1" data-label="Actions">
                        {(d.ingestion_status === 'failed' ||
                          (d.index_status === 'failed' &&
                            (d.chunk_count || 0) > 0)) &&
                        d.storage_path ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="block text-xs font-semibold text-amber-800 underline disabled:opacity-40"
                            onClick={() => void onResumeKnowledgeChunks(d)}
                          >
                            Resume / Repair
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy}
                          className="block text-xs text-rose-700 underline disabled:opacity-40"
                          onClick={() => void onDeleteKnowledgeDoc(d, false)}
                        >
                          Delete
                        </button>
                        {tenantCompanyId &&
                        documentHasSha256Duplicate(d, tenantCompanyId) ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="block text-xs text-amber-700 underline disabled:opacity-40"
                            onClick={() => void onDeleteKnowledgeDoc(d, true)}
                          >
                            Delete duplicate
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
        </div>
        </div>
      )}

      {tab === 'codes' && (
        <CodeKnowledgePanel
          companyId={tenantCompanyId}
          clientId={activeWs?.client_id || clients[0]?.id || 'demo-client'}
        />
      )}

      {(tab === 'rag' || tab === 'copilot') && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-bold">
            {tab === 'copilot'
              ? label('design.copilot.title', 'Engineering Copilot')
              : label('design.rag.title', 'AI Knowledge Engine (RAG)')}
          </h2>
          <p className="text-xs text-gray-500">
            Answers only from indexed company files — no internet. Citations include file, page, paragraph, code, confidence.
          </p>
          <div className={`rounded-xl border px-3 py-2 text-xs ${
            ragReady ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}>
            {ragReady
              ? `${indexedKnowledgeDocs.length} indexed document${indexedKnowledgeDocs.length === 1 ? '' : 's'} available for this company.`
              : tenantCompanyId
                ? 'No indexed company document is ready yet. Upload and index a source document first.'
                : 'Company context is unavailable. Sign in with a company account before querying RAG.'}
          </div>
          <div className="flex flex-wrap gap-2">
            {ragPromptSuggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:border-[#635bdb] hover:text-[#4f46b8]"
                onClick={() => setQuestion(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              lang === 'en'
                ? 'e.g. What fire pump requirements apply? / SBC sprinkler rules?'
                : 'مثال: ما متطلبات المضخة؟ / اشتراطات الرشاشات في SBC؟'
            }
            className="w-full border rounded-xl px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            disabled={busy || !question.trim()}
            onClick={() => void onAsk()}
            className="px-4 py-2.5 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-50"
          >
            {label('design.rag.ask', 'Ask knowledge base')}
          </button>
          {rag ? (
            <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
              <p className="text-sm whitespace-pre-wrap">{rag.answer}</p>
              <p className="text-xs font-semibold">
                Confidence: {rag.confidence}% — {rag.reliable ? 'Reliable' : 'No reliable reference found.'}
              </p>
              {rag.citations.map((c) => (
                <div key={c.chunkId} className="text-xs border rounded-lg bg-white p-3">
                  <div className="font-bold text-emerald-900">
                    {c.documentTitle} · p.{c.pageNumber ?? '—'} · {c.codeReference || '—'} · {c.confidence}%
                  </div>
                  <p className="mt-1 text-gray-600">{c.paragraph}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {tab === 'workspace' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <h2 className="font-bold">Create from project / client</h2>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => createWs(c)}
                  className="w-full text-right border rounded-xl px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <div className="font-semibold">{c.business_name || c.name}</div>
                  <div className="text-xs text-gray-500">
                    {c.activity_type || '—'} · {c.building_area ?? '—'} m² · {c.floors_count ?? '—'} floors
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-white p-4 space-y-2">
            <h2 className="font-bold">Design workspaces</h2>
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  setActiveWsId(w.id);
                  setWsReq(w.requirements || '');
                }}
                className={`w-full text-right border rounded-xl px-3 py-2 text-sm ${
                  w.id === activeWs?.id ? 'border-emerald-600 bg-emerald-50' : ''
                }`}
              >
                <div className="font-semibold">{w.project_name}</div>
                <div className="text-xs text-gray-500">
                  {w.occupancy || '—'} · {(w.applicable_codes || []).join(', ')}
                </div>
              </button>
            ))}
            {activeWs ? (
              <div className="mt-3 text-xs space-y-2 border-t pt-3">
                <div>Summary: {activeWs.summary}</div>
                <div>Scope: {activeWs.fire_protection_scope}</div>
                <div>
                  Occupancy: {activeWs.occupancy || '—'} · Risk: {activeWs.risk_classification || '—'}
                </div>
                <div>
                  Height: {activeWs.building_height_m ?? '—'} m · Area: {activeWs.area_m2 ?? '—'} m² · Floors:{' '}
                  {activeWs.floors_count ?? '—'}
                </div>
                <div>Codes: {(activeWs.applicable_codes || []).join(', ')}</div>
                <label className="block">
                  <span className="font-semibold">Project requirements</span>
                  <textarea
                    rows={2}
                    className="mt-1 w-full border rounded-lg px-2 py-1.5"
                    value={wsReq}
                    onChange={(e) => setWsReq(e.target.value)}
                    onBlur={() => {
                      updateWorkspace({ ...activeWs, requirements: wsReq });
                      setWorkspaces(listWorkspaces());
                    }}
                  />
                </label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded-lg px-2 py-1.5"
                    placeholder="RFI / client comment"
                    value={wsNote}
                    onChange={(e) => setWsNote(e.target.value)}
                  />
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-slate-800 text-white"
                    onClick={() => {
                      if (!wsNote.trim() || !activeWs) return;
                      addWorkspaceNote(activeWs.id, 'rfi', { body: wsNote.trim() });
                      setWsNote('');
                      setWorkspaces(listWorkspaces());
                    }}
                  >
                    RFI
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg border"
                    onClick={() => {
                      if (!wsNote.trim() || !activeWs) return;
                      addWorkspaceNote(activeWs.id, 'client_comment', {
                        author: 'Client',
                        body: wsNote.trim(),
                      });
                      setWsNote('');
                      setWorkspaces(listWorkspaces());
                    }}
                  >
                    Client
                  </button>
                </div>
                <div>RFIs: {(activeWs.rfis || []).length} · Comments: {(activeWs.client_comments || []).length}</div>
                <div>Revisions: {(activeWs.revision_history || []).map((r) => r.revision).join(', ') || '—'}</div>
                <div>Notes: {activeWs.engineering_notes || '—'}</div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <EngineeringRulesPanel
          gateWorkflows
          initial={
            activeWs
              ? {
                  building_type: String(activeWs.building_info?.building_type || '') || null,
                  occupancy: activeWs.occupancy || null,
                  risk_classification: activeWs.risk_classification || null,
                  applicable_codes: activeWs.applicable_codes || null,
                  ...(typeof activeWs.building_info?.rules_selection === 'object' &&
                  activeWs.building_info.rules_selection
                    ? (activeWs.building_info.rules_selection as EngineeringSelection)
                    : {}),
                }
              : rulesSelection
          }
          onSelectionChange={(selection, form: EngineeringFormState) => {
            setRulesSelection(selection);
            const gate = assertEngineeringDecision(form);
            setDecisionGateOk(gate.ok);
            // Persist only when no rule violations (partial compliant cascade OK).
            // Full gate.ok is required to advance workflows (shown on Decision Feed).
            if (gate.blockingViolations.length > 0) {
              setMessage(
                lang === 'en'
                  ? `Decision Engine blocked save: ${gate.blockingViolations[0]?.message || gate.summary_en}`
                  : `محرك القرار أوقف الحفظ: ${gate.blockingViolations[0]?.message || gate.summary_ar}`
              );
              return;
            }
            if (activeWs) {
              updateWorkspace({
                ...activeWs,
                occupancy: (selection.occupancy as string) || activeWs.occupancy,
                risk_classification:
                  (selection.risk_classification as string) || activeWs.risk_classification,
                applicable_codes:
                  (selection.applicable_codes as string[]) || activeWs.applicable_codes,
                fire_protection_scope:
                  (selection.fire_protection_system as string) || activeWs.fire_protection_scope,
                building_info: {
                  ...(activeWs.building_info || {}),
                  building_type: selection.building_type || activeWs.building_info?.building_type,
                  sprinkler_type: selection.sprinkler_type,
                  pump_requirement: selection.pump_requirement,
                  tank_size: selection.tank_size,
                  sprinkler_density: selection.sprinkler_density,
                  water_demand: selection.water_demand,
                  alarm_category: selection.alarm_category,
                  required_reports: selection.required_reports,
                  required_drawings: selection.required_drawings,
                  rules_selection: selection,
                  decision_gate_ok: gate.ok,
                },
              });
              setWorkspaces(listWorkspaces());
              setMessage(
                gate.ok
                  ? lang === 'en'
                    ? 'Decision Engine: compliant cascade saved to workspace.'
                    : 'محرك القرار: تم حفظ التسلسل المتوافق في مساحة العمل.'
                  : lang === 'en'
                    ? 'Partial cascade saved (no violations). Complete required fields to open the decision gate.'
                    : 'تم حفظ تسلسل جزئي (بدون مخالفات). أكمل الحقول الإلزامية لفتح بوابة القرار.'
              );
            }
          }}
        />
      )}

      {tab === 'planner' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="p-3 border-b flex justify-between items-center gap-2 flex-wrap">
            <h2 className="font-bold text-sm">AI Design Planner — {activeWs?.project_name || '—'}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{tasks.length} tasks</span>
              <button
                type="button"
                disabled={!activeWsId || !decisionGateOk}
                onClick={() => {
                  if (!activeWsId) return;
                  if (!decisionGateOk) {
                    setMessage(
                      lang === 'en'
                        ? 'Decision Engine gate closed — complete compliant cascade before planner actions.'
                        : 'بوابة محرك القرار مغلقة — أكمل التسلسل المتوافق قبل إجراءات المخطط.'
                    );
                    return;
                  }
                  const next = rescheduleWorkspaceTasks(activeWsId);
                  setTasks(next);
                  setMessage(lang === 'en' ? 'Timeline auto-rescheduled.' : 'تمت إعادة جدولة المهام تلقائياً.');
                }}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40"
                title={
                  decisionGateOk
                    ? undefined
                    : 'Blocked until Engineering Decision Engine cascade is compliant'
                }
              >
                Auto-reschedule
              </button>
            </div>
          </div>
          <ResponsiveTable>
            <table className="w-full text-sm table-as-cards">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="p-2">Task</th>
                  <th className="p-2">Owner</th>
                  <th className="p-2">Start</th>
                  <th className="p-2">End</th>
                  <th className="p-2">Priority</th>
                  <th className="p-2">Progress %</th>
                  <th className="p-2">Est.h</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-t">
                    <td className="p-2 font-medium" data-label="Task">
                      {task.title}
                      {task.is_critical ? (
                        <span className="ml-1 text-[10px] text-rose-600 font-bold">CP</span>
                      ) : null}
                    </td>
                    <td className="p-2" data-label="Owner">
                      <input
                        className="border rounded px-1 py-0.5 w-28 text-xs"
                        value={task.owner_name || ''}
                        onChange={(e) => {
                          const next = { ...task, owner_name: e.target.value };
                          updateTask(next);
                          setTasks(listTasks(activeWsId));
                        }}
                      />
                    </td>
                    <td className="p-2 text-xs" data-label="Start">
                      {task.start_date}
                    </td>
                    <td className="p-2 text-xs" data-label="End">
                      {task.end_date}
                    </td>
                    <td className="p-2" data-label="Priority">
                      {task.priority}
                    </td>
                    <td className="p-2" data-label="Progress">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="border rounded w-16 px-1 py-0.5 text-xs"
                        value={task.progress_percent}
                        onChange={(e) => {
                          const progress_percent = Number(e.target.value) || 0;
                          const next = {
                            ...task,
                            progress_percent,
                            status: progress_percent >= 100 ? 'done' : task.status,
                          };
                          updateTask(next);
                          setTasks(listTasks(activeWsId));
                        }}
                      />
                    </td>
                    <td className="p-2 text-xs" data-label="Est">
                      {task.estimated_hours}
                    </td>
                    <td className="p-2 text-xs" data-label="Status">
                      {task.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </div>
      )}

      {tab === 'assistant' && (
        <div className="space-y-3">
          <div
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              decisionGateOk
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {decisionGateOk
              ? label(
                  'design.decision.gateOpen',
                  'Decision gate open — cascade compliant; locked/auto values are engine-controlled.'
                )
              : label(
                  'design.decision.gateClosed',
                  'Decision gate closed — complete compliant selections in Decision Engine before advancing workflows.'
                )}
          </div>
          <p className="text-xs text-gray-500">
            {label(
              'design.assistant.rulesNote',
              'This feed is the Engineering Decision Engine — not a suggestion assistant. Only rule-allowed options exist. Locked and auto-selected fields always include why.'
            )}
          </p>
          {!activeWs && !rulesSelection.building_type ? (
            <p className="text-sm text-gray-500">
              Select values in Decision Engine (or create a design workspace) first.
            </p>
          ) : (
            assistant.map((s) => (
              <div
                key={s.id}
                className={`rounded-xl border p-4 ${
                  s.severity === 'critical'
                    ? 'border-rose-200 bg-rose-50'
                    : s.severity === 'warn'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="font-bold text-sm">{s.title}</div>
                <p className="text-sm text-gray-700 mt-1">{s.detail}</p>
                <p className="text-[11px] text-gray-500 mt-2">{s.code_refs.join(' · ') || '—'}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'drawings' && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h2 className="font-bold">Drawing Review AI</h2>
          <p className="text-xs text-gray-500">
            PDF / DWG / Images — local rule audit. Checks: missing devices, hazard, exits, fire separation,
            coverage, hydraulic warnings, code violations, coordination, notes & symbols — each linked to code refs.
          </p>
          <input
            type="file"
            accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
            onChange={(e) => void onDrawingFile(e.target.files?.[0] || null)}
          />
          {audit ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">
                Score {audit.score} — {audit.summary}
              </p>
              {audit.findings.map((f) => (
                <div key={f.id} className="border rounded-lg px-3 py-2 text-sm">
                  <div className="font-semibold">
                    {f.title}{' '}
                    <span className="text-[11px] text-gray-500">
                      {f.standard} · {f.code} · {f.severity}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{f.detail}</p>
                  {f.refs?.length ? (
                    <p className="text-[10px] text-emerald-800 mt-1">Refs: {f.refs.join(' · ')}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Panel title="Delayed / Critical path risks" items={health.delayed.map((t) => t.title)} />
          <Panel title="Upcoming tasks" items={health.upcoming.map((t) => `${t.title} (${t.start_date})`)} />
          <Panel
            title="Critical path (open)"
            items={health.critical.map((t) => `${t.title}${t.is_critical ? ' ★' : ''}`)}
          />
          <div className="md:col-span-3 rounded-xl border bg-white p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-sm">Gantt + milestones</h3>
              <button
                type="button"
                disabled={!activeWsId}
                onClick={() => {
                  if (!activeWsId) return;
                  setTasks(rescheduleWorkspaceTasks(activeWsId));
                }}
                className="text-xs px-3 py-1.5 rounded-lg border font-semibold"
              >
                Automatic rescheduling
              </button>
            </div>
            <div className="space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="text-xs">
                  <div className="flex justify-between mb-0.5">
                    <span>
                      {task.title}
                      {task.is_critical ? ' · CP' : ''}
                    </span>
                    <span>
                      {task.start_date} → {task.end_date}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded overflow-hidden">
                    <div
                      className={`h-full ${task.is_critical ? 'bg-rose-700' : 'bg-[#635bdb]'}`}
                      style={{ width: `${Math.max(task.progress_percent, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              seedSmartNotifications(activeWsId || undefined);
              refresh();
            }}
            className="px-3 py-1.5 rounded-lg border text-xs font-semibold"
          >
            Seed smart alerts (NFPA / codes / deadlines)
          </button>
          {listNotifications().map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                markNotificationRead(n.id);
                refresh();
              }}
              className={`w-full text-right rounded-xl border px-4 py-3 ${
                n.is_read ? 'bg-white' : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="font-semibold text-sm">{n.title}</div>
              <div className="text-xs text-gray-600">{n.body}</div>
              <div className="text-[10px] text-gray-400 mt-1">
                {n.kind} · {n.created_at}
              </div>
            </button>
          ))}
        </div>
      )}

      {tab === 'checklist' && (
        <div className="space-y-4">
          {checklists.map((cl) => (
            <div key={cl.id} className="rounded-xl border bg-white p-4">
              <div className="flex justify-between mb-2">
                <h3 className="font-bold text-sm">{cl.title}</h3>
                <span className="text-xs font-semibold text-emerald-700">{cl.completion_percent}%</span>
              </div>
              <ul className="space-y-2">
                {cl.items.map((item) => (
                  <li key={item.id}>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => {
                          const next = {
                            ...cl,
                            items: cl.items.map((i) =>
                              i.id === item.id ? { ...i, checked: e.target.checked } : i
                            ),
                          };
                          const saved = saveChecklist(next);
                          setChecklists(listChecklists(activeWsId));
                          void saved;
                        }}
                      />
                      <span>{item.label}</span>
                      <span className="text-[10px] text-gray-400">{item.code_ref}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'lessons' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <h2 className="font-bold">Capture lesson learned</h2>
            <textarea
              rows={3}
              placeholder="Problems"
              value={lessonProblem}
              onChange={(e) => setLessonProblem(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              placeholder="Solutions / recommendations"
              value={lessonSolution}
              onChange={(e) => setLessonSolution(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                addLesson({
                  workspace_id: activeWsId || null,
                  problems: lessonProblem,
                  solutions: lessonSolution,
                  recommendations: lessonSolution,
                  engineer_notes: '',
                });
                setLessonProblem('');
                setLessonSolution('');
                setMessage('Lesson saved — available as future project reference.');
              }}
              className="px-4 py-2 rounded-xl bg-[#635bdb] text-white text-sm font-semibold"
            >
              Save lesson
            </button>
          </div>
          <div className="space-y-2">
            {listLessons().map((l) => (
              <div key={l.id} className="rounded-xl border bg-white p-3 text-sm">
                <div className="font-semibold text-rose-800">{l.problems}</div>
                <div className="text-emerald-800 mt-1">{l.solutions}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Workspaces" value={stats.workspaceCount} />
            <Stat label="Tasks" value={stats.taskCount} />
            <Stat label="Completion rate" value={`${stats.completionRate}%`} />
            <Stat label="Avg design hours" value={stats.avgDesignHours} />
            <Stat label="Actual hours" value={stats.actualHours} />
            <Stat label="Engineer productivity" value={`${stats.engineerProductivity}%`} />
            <Stat label="Design accuracy" value={`${stats.designAccuracy}%`} />
            <Stat label="Lessons / repeated issues" value={stats.lessonsCount} />
            <Stat label="Unread alerts" value={stats.unreadNotifications} />
            <Stat label="KB documents" value={docs.length} />
            <Stat label="AI usage (RAG docs)" value={docs.filter((d) => d.index_status === 'indexed').length} />
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="font-bold text-sm mb-2">Most used codes</h3>
            {(stats.mostUsedCodes || []).length === 0 ? (
              <p className="text-xs text-gray-400">—</p>
            ) : (
              <ul className="text-sm space-y-1">
                {stats.mostUsedCodes.map((c) => (
                  <li key={c.code}>
                    {c.code} · {c.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold text-gray-600 mb-1 block">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-xl px-3 py-2.5 text-sm"
      />
    </label>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-bold text-sm mb-2">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400">—</p>
      ) : (
        <ul className="text-xs space-y-1">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
