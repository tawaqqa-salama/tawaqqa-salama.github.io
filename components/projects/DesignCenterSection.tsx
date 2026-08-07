'use client';

import {
  DESIGN_CENTER_TABS,
  DESIGN_EXPORT_DEFS,
  ENGINEERING_CALC_DEFS,
  FIRE_SYSTEM_DEFS,
  addDrawingVersion,
  emptyAnalysisSteps,
  getActiveVersion,
  removeDrawingSheet,
  setActiveDrawingVersion,
  startDesignAnalysis,
  generateFireSystemDesign,
  runEngineeringCalculation,
  runComplianceCheck,
  requestDesignExport,
  type DesignCenterState,
  type DesignCenterTabId,
  type DesignDrawingFormat,
  type DesignDrawingSheet,
} from '@/lib/projects/design-center';
import { syncKnowledgeLinksToDesignCenterSync } from '@/lib/design-intelligence/project-knowledge-bridge';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { uploadPlanAttachmentDetailed, getPlanFileUrl } from '@/lib/storage/project-files';
import { isDemoMode } from '@/lib/supabase';
import { humanizeFetchError } from '@/lib/api/safe-json';
import BuildingPlanReportSection from '@/components/projects/BuildingPlanReportSection';
import PlanAttachmentsUpload from '@/components/projects/PlanAttachmentsUpload';
import SafetyBlueprintsUpload from '@/components/projects/SafetyBlueprintsUpload';
import { useEffect, useMemo, useState } from 'react';
import { EMPTY_PLAN_ATTACHMENTS, EMPTY_SAFETY_BLUEPRINTS } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import type {
  BuildingPlanReport,
  PlanAttachmentsState,
  ProjectEngineeringData,
  SafetyBlueprintsState,
} from '@/lib/types/project-reports';

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  saving: boolean;
  onPatch: (partial: Partial<ProjectEngineeringData>) => void;
  onSaveBuildingPlan: (building_plan: BuildingPlanReport, successText: string) => void;
  onPersistBlueprints: (safety_blueprints: SafetyBlueprintsState) => Promise<void>;
  /** Persist design_center (and optional plan_attachments) to Supabase after upload */
  onPersistDesignCenter: (
    design_center: DesignCenterState,
    extra?: Partial<ProjectEngineeringData>
  ) => Promise<void>;
};

const FORMAT_ACCEPT: Record<DesignDrawingFormat | 'all', string> = {
  pdf: '.pdf,application/pdf',
  dwg: '.dwg',
  dxf: '.dxf',
  ifc: '.ifc',
  rvt: '.rvt,.rfa',
  other: '.pdf,.dwg,.dxf,.ifc,.rvt',
  all: '.pdf,.dwg,.dxf,.ifc,.rvt,.rfa',
};

function statusTone(status: string | undefined, dark: boolean) {
  const s = status || 'idle';
  if (s === 'completed' || s === 'ready')
    return dark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-800';
  if (s === 'running' || s === 'queued' || s === 'generating')
    return dark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-50 text-sky-800';
  if (s === 'failed') return dark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-50 text-rose-800';
  if (s === 'unavailable')
    return dark ? 'bg-amber-500/20 text-amber-200' : 'bg-amber-50 text-amber-900';
  return dark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700';
}

function apiFailMessage(
  result: { ok: true } | { ok: false; message: string; message_ar?: string },
  preferAr: boolean
): string {
  if (result.ok) return preferAr ? 'تم' : 'Done';
  const raw = (preferAr ? result.message_ar : undefined) || result.message;
  return humanizeFetchError(raw);
}

function apiFailCode(
  result: { ok: true } | { ok: false; code: string }
): string | null {
  return result.ok ? null : result.code;
}

export default function DesignCenterSection({
  client,
  data,
  saving,
  onPatch,
  onSaveBuildingPlan,
  onPersistBlueprints,
  onPersistDesignCenter,
}: Props) {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const design = data.design_center;
  const dark = Boolean(design.ui?.dark_mode);
  const tab = (design.ui?.active_tab || 'drawings') as DesignCenterTabId;
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const shell = dark
    ? 'rounded-2xl border border-slate-700 bg-slate-950 text-slate-100'
    : 'rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 text-slate-900';
  const card = dark
    ? 'rounded-xl border border-slate-700 bg-slate-900/80'
    : 'rounded-xl border border-slate-200 bg-white shadow-sm';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const tabIdle = dark
    ? 'border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-600'
    : 'border-slate-200 bg-white text-slate-700 hover:border-sky-400';
  const tabActive = dark
    ? 'border-sky-500 bg-sky-500/15 text-sky-200'
    : 'border-sky-600 bg-sky-50 text-sky-900';

  const setDesign = (next: DesignCenterState) => onPatch({ design_center: next });

  const setTab = (id: DesignCenterTabId) =>
    setDesign({ ...design, ui: { ...design.ui, active_tab: id } });

  const toggleDark = () =>
    setDesign({ ...design, ui: { ...design.ui, dark_mode: !design.ui?.dark_mode } });

  useEffect(() => {
    const linked = design.knowledge_links?.linked_document_ids?.length || 0;
    const services = (client.quotation_services || []).length;
    if (linked > 0 && design.knowledge_links?.last_synced_at) return;
    if (!services && !client.activity_type) return;
    const next = syncKnowledgeLinksToDesignCenterSync(client, data);
    if (
      JSON.stringify(next.design_center.knowledge_links) !==
      JSON.stringify(design.knowledge_links)
    ) {
      onPatch({ design_center: next.design_center });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const knowledge = design.knowledge_links;

  const uploadFormat = async (files: FileList | null, format: DesignDrawingFormat) => {
    if (!files?.length) return;
    setBusy('upload');
    setHint(null);
    try {
      let next = design;
      const warnings: string[] = [];
      let cloudCount = 0;
      for (const file of Array.from(files)) {
        const outcome = await uploadPlanAttachmentDetailed(file, 'engineering_drawing', {
          clientId: client.id,
        });
        if (outcome.cloudPersisted) cloudCount += 1;
        if (outcome.warning) warnings.push(outcome.warning);
        next = addDrawingVersion(next, outcome.file, {
          title: `${format.toUpperCase()} · ${file.name}`,
        });
      }
      setDesign(next);
      await onPersistDesignCenter(next);
      if (warnings.length && !cloudCount) {
        setHint(warnings[0]);
      } else if (ar) {
        setHint(
          cloudCount
            ? `تم رفع ${cloudCount} ملف إلى السحابة وحفظه في المشروع — سيظهر من أي جهاز.`
            : isDemoMode
              ? 'تم الحفظ محلياً (وضع تجريبي) — لن يظهر من جهاز آخر.'
              : 'تم الحفظ في بيانات المشروع.'
        );
      } else {
        setHint(
          cloudCount
            ? `${cloudCount} file(s) uploaded to cloud and saved on the project — visible on any device.`
            : 'Saved on the project record.'
        );
      }
    } catch (e) {
      setHint(
        humanizeFetchError(
          e instanceof Error ? e.message : ar ? 'فشل رفع الملف' : 'Upload failed'
        )
      );
    } finally {
      setBusy(null);
    }
  };

  const openViewer = async (sheet: DesignDrawingSheet) => {
    const ver = getActiveVersion(sheet);
    if (!ver) return;
    setDesign({
      ...design,
      ui: { ...design.ui, viewer_sheet_id: sheet.id },
    });
    const url = await getPlanFileUrl(ver.file);
    setViewerUrl(url);
  };

  const onAnalyze = async () => {
    setBusy('analyze');
    setHint(null);
    setDesign({
      ...design,
      analysis: {
        id: design.analysis?.id || `analysis-${Date.now()}`,
        status: 'queued',
        progress: 5,
        steps: emptyAnalysisSteps().map((s, i) =>
          i === 0 ? { ...s, status: 'queued' } : s
        ),
        sourceSheetId: design.ui?.viewer_sheet_id || design.sheets[0]?.id || null,
        sourceVersionId: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
        error_code: null,
        result: null,
      },
    });
    const result = await startDesignAnalysis({
      projectId: client.id,
      sheetId: design.ui?.viewer_sheet_id || design.sheets[0]?.id,
    });
    const analysis =
      result.data?.analysis ||
      ({
        ...(design.analysis || {
          id: `analysis-${Date.now()}`,
          steps: emptyAnalysisSteps(),
          progress: 0,
          status: 'unavailable' as const,
        }),
        status: 'unavailable' as const,
        progress: 0,
        error: apiFailMessage(result, true),
        error_code: apiFailCode(result),
        finishedAt: new Date().toISOString(),
        result: null,
      } as DesignCenterState['analysis']);
    setDesign({ ...design, analysis });
    setHint(result.ok ? (ar ? 'اكتمل التحليل' : 'Analysis complete') : apiFailMessage(result, ar));
    setBusy(null);
  };

  const onGenerateSystem = async (kind: (typeof FIRE_SYSTEM_DEFS)[number]['kind']) => {
    setBusy(`sys-${kind}`);
    const result = await generateFireSystemDesign({
      projectId: client.id,
      kind,
      analysisId: design.analysis?.id,
    });
    const system = result.data?.system;
    setDesign({
      ...design,
      systems: design.systems.map((s) =>
        s.kind === kind
          ? system || {
              ...s,
              status: 'unavailable',
              error: apiFailMessage(result, true),
              error_code: apiFailCode(result),
              generatedAt: new Date().toISOString(),
            }
          : s
      ),
    });
    setHint(result.ok ? (ar ? 'تم التوليد' : 'Generated') : apiFailMessage(result, ar));
    setBusy(null);
  };

  const onCalc = async (kind: (typeof ENGINEERING_CALC_DEFS)[number]['kind']) => {
    setBusy(`calc-${kind}`);
    const result = await runEngineeringCalculation({ projectId: client.id, kind });
    const calculation = result.data?.calculation;
    setDesign({
      ...design,
      calculations: design.calculations.map((c) =>
        c.kind === kind
          ? calculation || {
              ...c,
              status: 'unavailable',
              error: apiFailMessage(result, true),
              error_code: apiFailCode(result),
              updatedAt: new Date().toISOString(),
              values: null,
            }
          : c
      ),
    });
    setHint(apiFailMessage(result, ar));
    setBusy(null);
  };

  const onCompliance = async () => {
    setBusy('compliance');
    setDesign({
      ...design,
      compliance: { ...design.compliance, status: 'running' },
    });
    const result = await runComplianceCheck({
      projectId: client.id,
      client,
      data,
    });
    const compliance =
      result.data?.compliance || {
        ...design.compliance,
        status: 'unavailable' as const,
        matchPercent: null,
        findings: [],
        recommendations: [],
        checkedAt: new Date().toISOString(),
        error: apiFailMessage(result, true),
        error_code: apiFailCode(result),
        knowledge_citations: [],
      };
    setDesign({
      ...design,
      compliance,
      knowledge_links: {
        ...(design.knowledge_links || {
          applicable_codes: [],
          sales_services: [],
          linked_document_ids: [],
          linked_document_titles: [],
          citations: [],
        }),
        citations: compliance.knowledge_citations || design.knowledge_links?.citations || [],
        last_synced_at: new Date().toISOString(),
      },
    });
    setHint(
      result.ok
        ? ar
          ? `تم فحص الامتثال وربط قاعدة المعرفة (${compliance.knowledge_citations?.length || 0} مرجع)`
          : `Compliance done with knowledge links (${compliance.knowledge_citations?.length || 0} citations)`
        : apiFailMessage(result, ar)
    );
    setBusy(null);
  };

  const onExport = async (kind: (typeof DESIGN_EXPORT_DEFS)[number]['kind']) => {
    setBusy(`export-${kind}`);
    const result = await requestDesignExport({ projectId: client.id, kind });
    const exportJob = result.data?.exportJob;
    setDesign({
      ...design,
      exports: design.exports.map((e) =>
        e.kind === kind
          ? exportJob || {
              ...e,
              status: 'unavailable',
              error: apiFailMessage(result, true),
              error_code: apiFailCode(result),
              updatedAt: new Date().toISOString(),
              file: null,
            }
          : e
      ),
    });
    setHint(apiFailMessage(result, ar));
    setBusy(null);
  };

  const compareA = useMemo(() => {
    const id = design.ui?.compare_version_a;
    for (const s of design.sheets) {
      const v = s.versions.find((x) => x.id === id);
      if (v) return { sheet: s, version: v };
    }
    return null;
  }, [design.sheets, design.ui?.compare_version_a]);

  const compareB = useMemo(() => {
    const id = design.ui?.compare_version_b;
    for (const s of design.sheets) {
      const v = s.versions.find((x) => x.id === id);
      if (v) return { sheet: s, version: v };
    }
    return null;
  }, [design.sheets, design.ui?.compare_version_b]);

  const allVersions = design.sheets.flatMap((s) =>
    s.versions.map((v) => ({
      id: v.id,
      label: `${s.title} · ${v.label}`,
    }))
  );

  const analysisProgress = design.analysis?.progress ?? 0;

  return (
    <div className={`${shell} overflow-hidden`} data-design-center data-theme={dark ? 'dark' : 'light'}>
      <header className={`px-4 py-5 sm:px-6 border-b ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={`text-[11px] uppercase tracking-[0.2em] font-semibold ${muted}`}>
              Design Center
            </p>
            <h2 className="text-xl sm:text-2xl font-bold mt-1">
              {ar ? 'مركز الذكاء التصميمي' : 'AI Design Intelligence Center'}
            </h2>
            <p className={`text-sm mt-1 ${muted}`}>
              {ar
                ? `مرتبط بالمشروع · Project ID: ${client.id}`
                : `Bound to project · Project ID: ${client.id}`}
            </p>
            {knowledge?.linked_document_ids?.length ? (
              <p className="text-xs text-emerald-600 mt-1 font-semibold">
                {ar
                  ? `مرتبط بقاعدة المعرفة: ${knowledge.linked_document_ids.length} مستند · أكواد: ${(knowledge.applicable_codes || []).join(', ')}`
                  : `Linked KB: ${knowledge.linked_document_ids.length} docs · codes: ${(knowledge.applicable_codes || []).join(', ')}`}
              </p>
            ) : (
              <p className={`text-xs mt-1 ${muted}`}>
                {ar
                  ? 'ارفع لوائح الدفاع المدني في /design ثم اختر بنود العرض في المبيعات للربط التلقائي.'
                  : 'Upload Civil Defense docs in /design and select sales quotation services to auto-link.'}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusTone(design.status, dark)}`}>
              {design.status || 'مسودة'}
            </span>
            <button
              type="button"
              onClick={toggleDark}
              className={`text-xs px-3 py-1.5 rounded-lg border ${
                dark ? 'border-slate-600 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'
              }`}
            >
              {dark ? (ar ? 'وضع نهاري' : 'Light') : ar ? 'وضع ليلي' : 'Dark'}
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {DESIGN_CENTER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                tab === t.id ? tabActive : tabIdle
              }`}
            >
              {ar ? t.label_ar : t.label_en}
            </button>
          ))}
        </div>
      </header>

      <div className="p-4 sm:p-6 space-y-5">
        {hint ? (
          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              dark ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-amber-50 text-amber-950 border border-amber-100'
            }`}
          >
            {hint}
          </div>
        ) : null}

        {tab === 'drawings' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(
                [
                  ['pdf', 'رفع PDF', 'Upload PDF'],
                  ['dwg', 'رفع DWG', 'Upload DWG'],
                  ['dxf', 'رفع DXF', 'Upload DXF'],
                  ['ifc', 'رفع IFC', 'Upload IFC'],
                  ['rvt', 'رفع Revit', 'Upload Revit'],
                ] as const
              ).map(([fmt, arLabel, enLabel]) => (
                <label
                  key={fmt}
                  className={`${card} p-4 cursor-pointer hover:border-sky-500 transition block`}
                >
                  <div className="text-sm font-bold">{ar ? arLabel : enLabel}</div>
                  <p className={`text-xs mt-1 ${muted}`}>{fmt.toUpperCase()}</p>
                  <input
                    type="file"
                    className="mt-3 w-full text-xs"
                    accept={FORMAT_ACCEPT[fmt]}
                    disabled={busy === 'upload'}
                    onChange={(e) => void uploadFormat(e.target.files, fmt)}
                  />
                </label>
              ))}
            </div>

            <section className={`${card} p-4 space-y-3`}>
              <h3 className="text-sm font-bold">
                {ar ? 'إدارة إصدارات المخططات' : 'Drawing version control'}
              </h3>
              {!design.sheets.length ? (
                <p className={`text-xs ${muted}`}>
                  {ar
                    ? 'لا توجد مخططات بعد — ارفع ملفاً ليُحفظ داخل المشروع مع رقم إصدار.'
                    : 'No drawings yet — upload a file to version it on this project.'}
                </p>
              ) : (
                <ul className="space-y-3">
                  {design.sheets.map((sheet) => (
                    <li
                      key={sheet.id}
                      className={`rounded-lg border p-3 ${dark ? 'border-slate-700' : 'border-slate-200'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{sheet.title}</div>
                          <div className={`text-[11px] ${muted}`}>
                            {sheet.format.toUpperCase()} · {sheet.versions.length}{' '}
                            {ar ? 'إصدار' : 'versions'}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border border-sky-500 text-sky-600"
                            onClick={() => void openViewer(sheet)}
                          >
                            {ar ? 'عرض' : 'View'}
                          </button>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border border-rose-400 text-rose-600"
                            onClick={() => setDesign(removeDrawingSheet(design, sheet.id))}
                          >
                            {ar ? 'حذف' : 'Delete'}
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {sheet.versions.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() =>
                              setDesign(setActiveDrawingVersion(design, sheet.id, v.id))
                            }
                            className={`text-[11px] px-2 py-1 rounded-full border ${
                              sheet.activeVersionId === v.id
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                                : dark
                                  ? 'border-slate-600'
                                  : 'border-slate-300'
                            }`}
                          >
                            {v.label} · {v.file.fileName}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${card} p-4 space-y-3`}>
              <h3 className="text-sm font-bold">
                {ar ? 'مقارنة الإصدارات' : 'Compare versions'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  className={`rounded-lg border px-3 py-2 text-sm ${dark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'}`}
                  value={design.ui?.compare_version_a || ''}
                  onChange={(e) =>
                    setDesign({
                      ...design,
                      ui: { ...design.ui, compare_version_a: e.target.value || null },
                    })
                  }
                >
                  <option value="">{ar ? 'الإصدار أ' : 'Version A'}</option>
                  {allVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <select
                  className={`rounded-lg border px-3 py-2 text-sm ${dark ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'}`}
                  value={design.ui?.compare_version_b || ''}
                  onChange={(e) =>
                    setDesign({
                      ...design,
                      ui: { ...design.ui, compare_version_b: e.target.value || null },
                    })
                  }
                >
                  <option value="">{ar ? 'الإصدار ب' : 'Version B'}</option>
                  {allVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              {compareA && compareB ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className={`rounded-lg p-3 ${dark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                    <div className="font-semibold">{compareA.version.label}</div>
                    <div className={muted}>{compareA.version.file.fileName}</div>
                    <div className={muted}>
                      {(compareA.version.file.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                      {compareA.version.uploadedAt.slice(0, 19)}
                    </div>
                  </div>
                  <div className={`rounded-lg p-3 ${dark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                    <div className="font-semibold">{compareB.version.label}</div>
                    <div className={muted}>{compareB.version.file.fileName}</div>
                    <div className={muted}>
                      {(compareB.version.file.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                      {compareB.version.uploadedAt.slice(0, 19)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className={`text-xs ${muted}`}>
                  {ar
                    ? 'اختر إصدارين لمقارنة البيانات الوصفية المحفوظة في المشروع.'
                    : 'Pick two versions to compare stored metadata on this project.'}
                </p>
              )}
            </section>

            <section className={`${card} p-4 space-y-3`}>
              <h3 className="text-sm font-bold">
                {ar ? 'عرض المخطط داخل المتصفح' : 'In-browser drawing viewer'}
              </h3>
              {viewerUrl ? (
                viewerUrl.startsWith('data:application/pdf') ||
                viewerUrl.includes('.pdf') ||
                viewerUrl.startsWith('blob:') ||
                /pdf/i.test(viewerUrl) ? (
                  <iframe title="drawing-viewer" src={viewerUrl} className="w-full h-80 rounded-lg border" />
                ) : (
                  <p className={`text-xs ${muted}`}>
                    {ar
                      ? 'المعاينة المباشرة متاحة لملفات PDF. ملفات DWG/DXF/IFC/Revit محفوظة مع بيانات الإصدار للربط بمحرك العرض لاحقاً.'
                      : 'Inline preview is available for PDF. CAD/BIM files are versioned for a future viewer engine.'}
                    <a className="ms-2 text-sky-500 underline" href={viewerUrl} target="_blank" rel="noreferrer">
                      {ar ? 'فتح الملف' : 'Open file'}
                    </a>
                  </p>
                )
              ) : (
                <p className={`text-xs ${muted}`}>
                  {ar ? 'اختر مخططاً واضغط «عرض».' : 'Select a sheet and click View.'}
                </p>
              )}
            </section>

            <section className={`${card} p-4 space-y-4`}>
              <h3 className="text-sm font-bold">
                {ar ? 'بيانات المبنى وتصنيف الإشغال' : 'Building data & occupancy'}
              </h3>
              <BuildingPlanReportSection
                client={client}
                report={data.building_plan}
                saving={saving}
                onChange={(building_plan) =>
                  onPatch({
                    building_plan,
                    technical_report: {
                      ...data.technical_report,
                      building_permit_number:
                        building_plan.building_permit_number ||
                        data.technical_report.building_permit_number,
                      building_permit_date:
                        building_plan.building_permit_date ||
                        data.technical_report.building_permit_date,
                    },
                  })
                }
                onSave={(building_plan, successText) => onSaveBuildingPlan(building_plan, successText)}
              />
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-bold">
                  {ar ? 'مرفقات إضافية وحسابات هيدروليكية' : 'Legacy attachments & hydraulics'}
                </h4>
                <PlanAttachmentsUpload
                  value={data.plan_attachments || EMPTY_PLAN_ATTACHMENTS}
                  onChange={(plan_attachments: PlanAttachmentsState) => {
                    onPatch({ plan_attachments });
                    void onPersistDesignCenter(design, { plan_attachments });
                  }}
                  clientId={client.id}
                />
                <h4 className="text-sm font-bold">
                  {ar ? 'مخططات السلامة' : 'Safety blueprints'}
                </h4>
                <SafetyBlueprintsUpload
                  client={client}
                  buildingPlan={data.building_plan}
                  value={data.safety_blueprints || EMPTY_SAFETY_BLUEPRINTS}
                  onChange={(safety_blueprints) => onPatch({ safety_blueprints })}
                  onPersist={onPersistBlueprints}
                />
              </div>
            </section>
          </div>
        )}

        {tab === 'ai_center' && (
          <div className="space-y-5">
            <div className={`${card} p-6 text-center space-y-4`}>
              <p className={`text-sm ${muted}`}>
                {ar
                  ? 'يشغّل خط تحليل المخطط عبر API قابل للربط بمحرك الذكاء التصميمي الحقيقي.'
                  : 'Runs the plan-analysis pipeline via an API ready for a real design AI engine.'}
              </p>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void onAnalyze()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold px-6 py-3 text-sm shadow-lg shadow-sky-600/20 disabled:opacity-60"
              >
                ✨ {ar ? 'إنشاء تصميم بالذكاء الاصطناعي' : 'Generate design with AI'}
              </button>
            </div>

            <section className={`${card} p-4 space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{ar ? 'شريط التقدم' : 'Progress'}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${statusTone(design.analysis?.status, dark)}`}>
                  {design.analysis?.status || 'idle'} · {analysisProgress}%
                </span>
              </div>
              <div className={`h-2.5 rounded-full overflow-hidden ${dark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <div
                  className="h-full bg-sky-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, analysisProgress))}%` }}
                />
              </div>
              <ol className="space-y-2">
                {(design.analysis?.steps?.length
                  ? design.analysis.steps
                  : emptyAnalysisSteps()
                ).map((step, idx) => (
                  <li
                    key={step.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs ${
                      dark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-50 border border-slate-100'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${statusTone(step.status, dark)}`}>
                      {idx + 1}
                    </span>
                    <span className="flex-1 font-medium">{ar ? step.label_ar : step.label_en}</span>
                    <span className={muted}>{step.status}</span>
                  </li>
                ))}
              </ol>
              {design.analysis?.error ? (
                <p className="text-xs text-amber-600">{design.analysis.error}</p>
              ) : null}
            </section>
          </div>
        )}

        {tab === 'smart_design' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIRE_SYSTEM_DEFS.map((sys) => {
              const row = design.systems.find((s) => s.kind === sys.kind);
              return (
                <div key={sys.kind} className={`${card} p-4 space-y-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">{ar ? sys.label_ar : sys.label_en}</h3>
                      <p className={`text-[11px] mt-1 ${muted}`}>{sys.kind}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full ${statusTone(row?.status, dark)}`}>
                      {row?.status || 'idle'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void onGenerateSystem(sys.kind)}
                    className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 disabled:opacity-60"
                  >
                    Generate Design
                  </button>
                  {row?.error ? <p className="text-[11px] text-amber-600">{row.error}</p> : null}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'calculations' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ENGINEERING_CALC_DEFS.map((calc) => {
              const row = design.calculations.find((c) => c.kind === calc.kind);
              return (
                <div key={calc.kind} className={`${card} p-4 space-y-3`}>
                  <div className="flex justify-between gap-2">
                    <h3 className="text-sm font-bold">{ar ? calc.label_ar : calc.label_en}</h3>
                    <span className={`text-[10px] px-2 py-1 rounded-full ${statusTone(row?.status, dark)}`}>
                      {row?.status || 'idle'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void onCalc(calc.kind)}
                    className={`w-full rounded-lg border text-xs font-semibold py-2 ${
                      dark ? 'border-slate-600 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {ar ? 'تشغيل الحساب' : 'Run calculation'}
                  </button>
                  {row?.values ? (
                    <pre className={`text-[10px] overflow-auto p-2 rounded ${dark ? 'bg-slate-950' : 'bg-slate-50'}`}>
                      {JSON.stringify(row.values, null, 2)}
                    </pre>
                  ) : row?.error ? (
                    <p className="text-[11px] text-amber-600">{row.error}</p>
                  ) : (
                    <p className={`text-[11px] ${muted}`}>
                      {ar
                        ? 'النتائج تُملأ تلقائياً عند ربط محرك الحسابات.'
                        : 'Results populate automatically once the calc engine is connected.'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'review' && (
          <div className="space-y-4">
            <div className={`${card} p-4 space-y-2`}>
              <h3 className="text-sm font-bold">
                {ar ? 'اشتراطات مرتبطة من المبيعات وقاعدة المعرفة' : 'Linked sales & knowledge requirements'}
              </h3>
              <p className={`text-xs ${muted}`}>
                {(knowledge?.applicable_codes || []).join(' · ') || '—'}
              </p>
              {(knowledge?.linked_document_titles || []).length ? (
                <ul className="text-xs space-y-1 list-disc ps-5">
                  {knowledge!.linked_document_titles!.slice(0, 12).map((title, i) => (
                    <li key={`${title}-${i}`}>{title}</li>
                  ))}
                </ul>
              ) : (
                <p className={`text-xs ${muted}`}>
                  {ar
                    ? 'لا مستندات مطابقة بعد — فهرس اللوائح في مركز الذكاء التصميمي.'
                    : 'No matched documents yet — index regs in Design Intelligence.'}
                </p>
              )}
            </div>
            <div className={`${card} p-5 space-y-4`}>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void onCompliance()}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-3 text-sm disabled:opacity-60"
              >
                Run Compliance Check
              </button>
              <p className={`text-xs ${muted}`}>
                {ar
                  ? 'يفحص SBC/NFPA ويربط مقاطع من لوائح الدفاع المدني المرفوعة في قاعدة المعرفة.'
                  : 'Runs SBC/NFPA checks and cites your uploaded Civil Defense knowledge docs.'}
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className={`px-2 py-1 rounded-full ${statusTone(design.compliance.status, dark)}`}>
                  {design.compliance.status}
                </span>
                <span className={muted}>
                  {ar ? 'نسبة المطابقة' : 'Match %'}:{' '}
                  {design.compliance.matchPercent == null
                    ? '—'
                    : `${design.compliance.matchPercent}%`}
                </span>
                <span className={muted}>{design.compliance.standards.join(' · ')}</span>
              </div>
              {design.compliance.error ? (
                <p className="text-xs text-amber-600">{design.compliance.error}</p>
              ) : null}
            </div>
            <section className={`${card} p-4`}>
              <h3 className="text-sm font-bold mb-2">{ar ? 'قائمة الملاحظات' : 'Findings'}</h3>
              {!design.compliance.findings.length ? (
                <p className={`text-xs ${muted}`}>
                  {ar
                    ? 'لا ملاحظات بعد — الفحص يمر عبر API ويحفظ النتائج في المشروع عند توفر المحرك.'
                    : 'No findings yet — checks run via API and persist on the project when the engine is live.'}
                </p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {design.compliance.findings.map((f) => (
                    <li key={f.id} className={`rounded-lg border px-3 py-2 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
                      <span className="font-semibold">{f.code}</span> · {ar ? f.message_ar : f.message_en}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={`${card} p-4`}>
              <h3 className="text-sm font-bold mb-2">{ar ? 'التوصيات' : 'Recommendations'}</h3>
              {!design.compliance.recommendations.length ? (
                <p className={`text-xs ${muted}`}>—</p>
              ) : (
                <ul className="list-disc ps-5 text-xs space-y-1">
                  {design.compliance.recommendations.map((r) => (
                    <li key={r.id}>{ar ? r.text_ar : r.text_en}</li>
                  ))}
                </ul>
              )}
            </section>
            {(design.compliance.knowledge_citations || []).length ? (
              <section className={`${card} p-4`}>
                <h3 className="text-sm font-bold mb-2">
                  {ar ? 'مراجع قاعدة المعرفة (دفاع مدني)' : 'Knowledge-base citations'}
                </h3>
                <ul className="space-y-2 text-xs">
                  {design.compliance.knowledge_citations!.map((c) => (
                    <li
                      key={`${c.document_id}-${c.excerpt.slice(0, 12)}`}
                      className={`rounded-lg border px-3 py-2 ${dark ? 'border-slate-700' : 'border-slate-200'}`}
                    >
                      <div className="font-semibold">{c.title}</div>
                      <div className={muted}>
                        {c.code_reference || '—'}
                        {c.confidence != null ? ` · ${c.confidence}%` : ''}
                      </div>
                      <p className="mt-1">{c.excerpt}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}

        {tab === 'exports' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DESIGN_EXPORT_DEFS.map((ex) => {
              const row = design.exports.find((e) => e.kind === ex.kind);
              return (
                <div key={ex.kind} className={`${card} p-4 space-y-3`}>
                  <div className="flex justify-between gap-2">
                    <h3 className="text-sm font-bold">{ar ? ex.label_ar : ex.label_en}</h3>
                    <span className={`text-[10px] px-2 py-1 rounded-full ${statusTone(row?.status, dark)}`}>
                      {row?.status || 'idle'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void onExport(ex.kind)}
                    className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2.5 disabled:opacity-60"
                  >
                    {ar ? 'استخراج' : 'Export'}
                  </button>
                  {row?.error ? <p className="text-[11px] text-amber-600">{row.error}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
