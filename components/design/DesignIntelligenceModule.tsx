'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ModuleSubNavSlot from '@/components/layout/ModuleSubNavSlot';
import ModuleTabBar from '@/components/layout/ModuleTabBar';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { supabase } from '@/lib/supabase';
import {
  analyticsSnapshot,
  createWorkspaceFromClient,
  ensureSeedKnowledgeBase,
  knowledgeCategories,
  listChecklists,
  listIndexingJobs,
  listKnowledgeDocumentsSync,
  listLessons,
  listNotifications,
  listTasks,
  listWorkspaces,
  markNotificationRead,
  ragQuery,
  rescheduleWorkspaceTasks,
  saveChecklist,
  seedSmartNotifications,
  suggestEngineeringSystems,
  timelineHealth,
  updateTask,
  updateWorkspace,
  addWorkspaceNote,
  uploadAndIndexKnowledgeFile,
  addLesson,
  type DesignIntelligenceTabId,
  type DiDesignChecklist,
  type DiDesignTask,
  type DiDesignWorkspace,
  type DiKnowledgeDocument,
  type RagAnswer,
} from '@/lib/design-intelligence';
import { runBlueprintAiAudit } from '@/lib/compliance/blueprint-audit';
import type { ClientRecord } from '@/lib/types/client';
import type { BlueprintAiAuditResult } from '@/lib/types/project-reports';

const TABS: { id: DesignIntelligenceTabId; labelKey: string; fallback: string }[] = [
  { id: 'knowledge', labelKey: 'design.tab.knowledge', fallback: 'Knowledge Base' },
  { id: 'rag', labelKey: 'design.tab.rag', fallback: 'AI Knowledge Engine' },
  { id: 'workspace', labelKey: 'design.tab.workspace', fallback: 'Design Workspace' },
  { id: 'planner', labelKey: 'design.tab.planner', fallback: 'AI Design Planner' },
  { id: 'assistant', labelKey: 'design.tab.assistant', fallback: 'Smart Assistant' },
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
  const [tab, setTab] = useState<DesignIntelligenceTabId>('knowledge');
  const [docs, setDocs] = useState<DiKnowledgeDocument[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<DiDesignWorkspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string>('');
  const [tasks, setTasks] = useState<DiDesignTask[]>([]);
  const [checklists, setChecklists] = useState<DiDesignChecklist[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const onUpload = async () => {
    if (!file || !title.trim()) {
      setMessage(lang === 'en' ? 'Title and file are required.' : 'العنوان والملف مطلوبان.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await uploadAndIndexKnowledgeFile({
        file,
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
        },
      });
      setTitle('');
      setFile(null);
      setNotesMeta('');
      setDocs(listKnowledgeDocumentsSync());
      setMessage(lang === 'en' ? 'Document uploaded, chunked, and indexed offline.' : 'تم الرفع والتجزئة والفهرسة دون اتصال.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const onAsk = async () => {
    setBusy(true);
    const answer = await ragQuery(question);
    setRag(answer);
    setBusy(false);
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
    if (!activeWs) return [];
    return suggestEngineeringSystems({
      buildingType: String(activeWs.building_info?.building_type || ''),
      occupancy: activeWs.occupancy || '',
      risk: activeWs.risk_classification || '',
      heightM: activeWs.building_height_m,
      areaM2: activeWs.area_m2,
      floors: activeWs.floors_count,
      codes: activeWs.applicable_codes,
    });
  }, [activeWs]);

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
          activeClassName="bg-[#1f4d3a] text-white shadow-sm"
          idleClassName="bg-white border border-gray-200 text-gray-800"
          items={TABS.map((item) => ({
            id: item.id,
            label: label(item.labelKey, item.fallback),
          }))}
        />
      </ModuleSubNavSlot>

      {message ? (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {tab === 'knowledge' && (
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
              className="w-full px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? '…' : label('design.kb.index', 'Upload & Index')}
            </button>
            <p className="text-[11px] text-gray-400">
              Pipeline: OCR → extract → chunk → embed → index · jobs: {listIndexingJobs().filter((j) => j.status === 'queued').length} queued
            </p>
          </div>
          <div className="xl:col-span-3">
            <ResponsiveTable className="bg-white rounded-xl border">
              <table className="w-full text-right text-sm table-as-cards">
                <thead className="bg-gray-50 border-b text-gray-600">
                  <tr>
                    <th className="p-3">Title</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Codes</th>
                    <th className="p-3">Chunks</th>
                    <th className="p-3">Index</th>
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
                        {(d.applicable_codes || []).join(', ') || '—'}
                      </td>
                      <td className="p-3" data-label="Chunks">
                        {d.chunk_count || 0}
                      </td>
                      <td className="p-3" data-label="Index">
                        <span className="text-xs font-semibold text-emerald-700">{d.index_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
        </div>
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
            className="px-4 py-2.5 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold disabled:opacity-50"
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

      {tab === 'planner' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="p-3 border-b flex justify-between items-center gap-2 flex-wrap">
            <h2 className="font-bold text-sm">AI Design Planner — {activeWs?.project_name || '—'}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{tasks.length} tasks</span>
              <button
                type="button"
                disabled={!activeWsId}
                onClick={() => {
                  if (!activeWsId) return;
                  const next = rescheduleWorkspaceTasks(activeWsId);
                  setTasks(next);
                  setMessage(lang === 'en' ? 'Timeline auto-rescheduled.' : 'تمت إعادة جدولة المهام تلقائياً.');
                }}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40"
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
          {!activeWs ? (
            <p className="text-sm text-gray-500">Create a design workspace first.</p>
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
                      className={`h-full ${task.is_critical ? 'bg-rose-700' : 'bg-[#1f4d3a]'}`}
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
              className="px-4 py-2 rounded-xl bg-[#1f4d3a] text-white text-sm font-semibold"
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
