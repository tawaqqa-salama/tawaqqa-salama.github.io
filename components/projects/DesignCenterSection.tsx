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
  extractAnalysisNotes,
  jobStatusLabel,
  reviewStatusLabel,
  standardsObservationLines,
  computeDesignReadiness,
  knowledgeAvailabilityLabel,
  canCreateSystemDesign,
  systemDesignInputGate,
  formatUnknownValue,
  analyzeCadDrawing,
  resolveDrawingBlobForVision,
  applyZoneOverridesToCadResult,
  cadResultFromAnalysisJob,
  buildPreDesignAuditHtml,
  downloadPreDesignAuditHtml,
  openPreDesignAuditPrint,
  inspectDrawing,
  type CADAnalysisResult,
  type DesignCenterState,
  type DesignCenterTabId,
  type DesignDrawingFormat,
  type DesignDrawingSheet,
  type DrawingInspectionReport,
  type ZoneManualOverride,
} from '@/lib/projects/design-center';
import { syncKnowledgeLinksToDesignCenterSync } from '@/lib/design-intelligence/project-knowledge-bridge';
import { useLanguage } from '@/lib/i18n/LanguageProvider';
import { uploadPlanAttachmentDetailed, getPlanFileUrl } from '@/lib/storage/project-files';
import { isDemoMode } from '@/lib/supabase';
import { humanizeFetchError } from '@/lib/api/safe-json';
import SafetyBlueprintsUpload from '@/components/projects/SafetyBlueprintsUpload';
import CadZoneOverlay from '@/components/projects/CadZoneOverlay';
import DrawingInspectionCard from '@/components/projects/DrawingInspectionCard';
import DesignSpaceSafetySection from '@/components/projects/DesignSpaceSafetySection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_SAFETY_BLUEPRINTS } from '@/lib/types/project-reports';
import { seedSpaceSafetyFromClient } from '@/lib/projects/design-center/space-safety';
import type { ClientRecord } from '@/lib/types/client';
import type {
  ProjectEngineeringData,
  SafetyBlueprintsState,
} from '@/lib/types/project-reports';

type Props = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  saving: boolean;
  onPatch: (partial: Partial<ProjectEngineeringData>) => void;
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
  onPersistBlueprints,
  onPersistDesignCenter,
}: Props) {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const design = data.design_center;
  const dark = Boolean(design.ui?.dark_mode);
  const tab = (design.ui?.active_tab || 'space_safety') as DesignCenterTabId;
  const [busy, setBusy] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintTone, setHintTone] = useState<'ok' | 'warn' | 'error'>('warn');
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [drawingFormat, setDrawingFormat] = useState<DesignDrawingFormat>('pdf');
  const fileInputRefs = useRef<Partial<Record<DesignDrawingFormat, HTMLInputElement | null>>>({});

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
  const spaceSafety = useMemo(
    () => seedSpaceSafetyFromClient(client, design.space_safety),
    [client, design.space_safety]
  );

  const uploadFormat = async (files: FileList | null, format: DesignDrawingFormat) => {
    if (!files?.length) return;
    setBusy('upload');
    setHint(null);
    setHintTone('warn');
    const inputEl = fileInputRefs.current[format];
    try {
      let next = design;
      const warnings: string[] = [];
      let cloudCount = 0;
      let visionFile: File | null = null;
      for (const file of Array.from(files)) {
        const outcome = await uploadPlanAttachmentDetailed(file, 'engineering_drawing', {
          clientId: client.id,
        });
        if (outcome.cloudPersisted) cloudCount += 1;
        if (outcome.warning) warnings.push(outcome.warning);
        next = addDrawingVersion(next, outcome.file, {
          title: `${format.toUpperCase()} · ${file.name}`,
        });
        const lower = file.name.toLowerCase();
        if (
          format === 'pdf' ||
          file.type.startsWith('image/') ||
          /\.(png|jpe?g|webp)$/i.test(lower)
        ) {
          visionFile = file;
        }
      }
      setDesign(next);
      await onPersistDesignCenter(next);

      if (visionFile) {
        setBusy('analyze');
        setHintTone('warn');
        setHint(
          ar
            ? 'جاري التحليل المحلي للمخطط بعد الرفع...'
            : 'Running local drawing analysis after upload...'
        );
        const hasSprinkler =
          data.building_plan?.sprinkler_system === 'نعم' ||
          /sprinkler|مرش|firefighting/i.test(String(client.quotation_services || ''));
        const hasFireAlarm =
          data.building_plan?.fire_alarm_system === 'نعم' ||
          /alarm|إنذار/i.test(String(client.quotation_services || ''));
        const cadVision = await analyzeCadDrawing(visionFile, {
          dpi: 300,
          enableOcr: true,
          hasSprinkler,
          hasFireAlarm,
          onProgress: (message_ar, message_en) => {
            setHint(ar ? message_ar : message_en);
          },
        });
        const engData = { ...data, design_center: next };
        const result = await startDesignAnalysis({
          projectId: client.id,
          sheetId: next.sheets[0]?.id,
          client,
          data: engData,
          cadVision,
        });
        const analysis = result.data?.analysis || null;
        if (analysis) {
          const readiness = computeDesignReadiness(client, {
            ...engData,
            design_center: { ...next, analysis },
          });
          next = {
            ...next,
            analysis,
            readiness: {
              level: readiness.level,
              updatedAt: new Date().toISOString(),
              reasons_ar: readiness.reasons_ar,
              reasons_en: readiness.reasons_en,
            },
          };
          setDesign(next);
          await onPersistDesignCenter(next);
        }
        setHintTone(
          cadVision.status === 'completed' || cadVision.status === 'partial' ? 'ok' : 'warn'
        );
        setHint(
          ar
            ? cadVision.status === 'password_protected'
              ? 'PDF محمي بكلمة مرور — أزل الحماية أو أكمل الإدخال اليدوي'
              : `تم الرفع والتحليل المحلي: ${cadVision.zones.length} فراغ · مقياس ${cadVision.scale.ratio_text || 'غير معروف'}`
            : cadVision.status === 'password_protected'
              ? 'Password-protected PDF — remove protection or enter fields manually'
              : `Uploaded & locally analyzed: ${cadVision.zones.length} zones · scale ${cadVision.scale.ratio_text || 'unknown'}`
        );
      } else if (warnings.length && !cloudCount) {
        setHintTone('warn');
        setHint(warnings[0]);
      } else if (ar) {
        setHintTone('ok');
        setHint(
          cloudCount
            ? `تم رفع ${cloudCount} ملف. لتحليل DWG صدّره كـ PDF ثم ارفع للتحليل المحلي.`
            : isDemoMode
              ? 'تم الحفظ محلياً (وضع تجريبي) — لن يظهر من جهاز آخر.'
              : 'تم الحفظ. لتحليل DWG صدّر PDF وشغّل التحليل.'
        );
      } else {
        setHintTone('ok');
        setHint(
          cloudCount
            ? `${cloudCount} file(s) uploaded. Export DWG to PDF for local vision.`
            : 'Saved on the project record. Export DWG to PDF for local vision.'
        );
      }
      if (inputEl) inputEl.value = '';
    } catch (e) {
      setHintTone('error');
      setHint(
        humanizeFetchError(
          e instanceof Error ? e.message : ar ? 'فشل رفع الملف' : 'Upload failed'
        )
      );
      // Clear native filename so it doesn't look like a successful upload
      if (inputEl) inputEl.value = '';
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

  const runLocalCadVision = async (
    preferredSheetId?: string | null
  ): Promise<CADAnalysisResult | null> => {
    const sheetId = preferredSheetId || design.ui?.viewer_sheet_id || design.sheets[0]?.id;
    const sheet = design.sheets.find((s) => s.id === sheetId) || design.sheets[0];
    const ver = sheet ? getActiveVersion(sheet) : null;
    const attachment =
      ver?.file ||
      data.plan_attachments?.engineering_drawings?.[0] ||
      null;
    if (!attachment) return null;

    const remoteUrl = await getPlanFileUrl(attachment);
    const resolved = await resolveDrawingBlobForVision({
      dataUrl: attachment.dataUrl,
      remoteUrl,
      fileName: attachment.fileName,
    });
    if (!resolved) {
      return {
        status: 'failed',
        engine: 'local_client',
        source_kind: 'unsupported',
        file_name: attachment.fileName || null,
        processed_at: new Date().toISOString(),
        width_px: 0,
        height_px: 0,
        dpi: 300,
        scale: {
          ratio_text: null,
          scale_denominator: null,
          meters_per_pixel: null,
          source: 'unknown',
          dpi: 300,
        },
        title_block: {
          project_name: null,
          sheet_number: null,
          drawing_title: null,
          occupancy: null,
          area_m2: null,
          scale_text: null,
          revision: null,
          raw_text: '',
          source: 'none',
        },
        zones: [],
        walls: [],
        text_anchors: [],
        preview_data_url: null,
        egress: null,
        zone_system_requirements: [],
        coverage: null,
        pre_calculations: null,
        compliance_report: null,
        gross_floor_area_m2: null,
        exits_count: null,
        doors_count: null,
        occupancy: null,
        extracted_text: '',
        warnings_ar: ['تعذر تحميل المخطط للتحليل المحلي'],
        warnings_en: ['Could not load drawing for local analysis'],
        error: 'DRAWING_UNREADABLE',
        error_code: 'DRAWING_UNREADABLE',
        privacy: 'local_only',
      };
    }

    const hasSprinkler =
      data.building_plan?.sprinkler_system === 'نعم' ||
      /sprinkler|مرش|firefighting/i.test(String(client.quotation_services || ''));
    const hasFireAlarm =
      data.building_plan?.fire_alarm_system === 'نعم' ||
      /alarm|إنذار/i.test(String(client.quotation_services || ''));

    return analyzeCadDrawing(resolved.blob, {
      dpi: 300,
      enableOcr: true,
      hasSprinkler,
      hasFireAlarm,
      onProgress: (message_ar, message_en) => {
        setHintTone('warn');
        setHint(ar ? message_ar : message_en);
      },
    }).then((result) => ({
      ...result,
      file_name: result.file_name || resolved.fileName,
    }));
  };

  const onZoneOverride = (override: ZoneManualOverride) => {
    const base = cadResultFromAnalysisJob(design.analysis);
    if (!base || !design.analysis) return;
    const hasSprinkler =
      data.building_plan?.sprinkler_system === 'نعم' ||
      /sprinkler|مرش|firefighting/i.test(String(client.quotation_services || ''));
    const hasFireAlarm =
      data.building_plan?.fire_alarm_system === 'نعم' ||
      /alarm|إنذار/i.test(String(client.quotation_services || ''));
    const nextCad = applyZoneOverridesToCadResult(base, [override], {
      hasSprinkler,
      hasFireAlarm,
    });
    const prevRaw = (design.analysis.result?.raw || {}) as Record<string, unknown>;
    const prevMeta = (prevRaw.cad_vision_result || {}) as Record<string, unknown>;
    const analysis = {
      ...design.analysis,
      result: {
        ...design.analysis.result,
        rooms: nextCad.zones,
        occupancy: nextCad.occupancy || design.analysis.result?.occupancy,
        areas: {
          ...((design.analysis.result?.areas as object) || {}),
          vision_gross_floor_area_m2: nextCad.gross_floor_area_m2,
        },
        raw: {
          ...prevRaw,
          cad_vision: 'local_client',
          cad_vision_result: {
            ...prevMeta,
            zones_count: nextCad.zones.length,
            gross_floor_area_m2: nextCad.gross_floor_area_m2,
            occupancy: nextCad.occupancy,
            egress: nextCad.egress,
            zone_system_requirements: nextCad.zone_system_requirements,
            coverage: nextCad.coverage,
            pre_calculations: nextCad.pre_calculations,
            compliance_report: nextCad.compliance_report,
            preview_data_url: nextCad.preview_data_url,
            width_px: nextCad.width_px,
            height_px: nextCad.height_px,
            scale: nextCad.scale,
          },
        },
      },
    };
    const readiness = computeDesignReadiness(client, {
      ...data,
      design_center: { ...design, analysis },
    });
    const nextDesign = {
      ...design,
      analysis,
      readiness: {
        level: readiness.level,
        updatedAt: new Date().toISOString(),
        reasons_ar: readiness.reasons_ar,
        reasons_en: readiness.reasons_en,
      },
    };
    setDesign(nextDesign);
    void onPersistDesignCenter(nextDesign);
    setHintTone('ok');
    setHint(
      ar
        ? 'تم تحديث تسمية/أبعاد الفراغ وإعادة حساب مسافة الإخلاء محليًا'
        : 'Zone label/dimensions updated and travel distance recomputed locally'
    );
  };

  const onAnalyze = async () => {
    setBusy('analyze');
    setHint(null);
    setDesign({
      ...design,
      analysis: {
        id: design.analysis?.id || `analysis-${Date.now()}`,
        status: 'running',
        progress: 8,
        steps: emptyAnalysisSteps().map((s, i) =>
          i === 0 ? { ...s, status: 'running' } : s
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

    let cadVision: CADAnalysisResult | null = null;
    try {
      cadVision = await runLocalCadVision();
    } catch {
      cadVision = null;
    }

    const result = await startDesignAnalysis({
      projectId: client.id,
      sheetId: design.ui?.viewer_sheet_id || design.sheets[0]?.id,
      client,
      data,
      cadVision,
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
    const readiness = computeDesignReadiness(client, {
      ...data,
      design_center: { ...design, analysis },
    });
    setDesign({
      ...design,
      analysis,
      readiness: {
        level: readiness.level,
        updatedAt: new Date().toISOString(),
        reasons_ar: readiness.reasons_ar,
        reasons_en: readiness.reasons_en,
      },
    });
    if (
      result.ok &&
      (analysis?.status === 'completed' || analysis?.status === 'needs_engineer_review')
    ) {
      const raw = analysis.result?.raw as
        | {
            knowledge_docs_available?: number;
            knowledge_citations?: unknown[];
            cad_vision?: string;
          }
        | undefined;
      const kbCount =
        typeof raw?.knowledge_docs_available === 'number'
          ? raw.knowledge_docs_available
          : Array.isArray(raw?.knowledge_citations)
            ? raw.knowledge_citations.length
            : 0;
      const localCad = raw?.cad_vision === 'local_client';
      setHintTone(
        cadVision?.status === 'password_protected' || cadVision?.status === 'failed'
          ? 'warn'
          : 'ok'
      );
      setHint(
        ar
          ? localCad
            ? `اكتمل التحليل المحلي للمخطط. ${knowledgeAvailabilityLabel(kbCount, true)}. راجع System Applicable Standards داخل بطاقة النظام.`
            : `تحليل من بيانات المشروع. ${knowledgeAvailabilityLabel(kbCount, true)}. ${
                cadVision?.warnings_ar?.[0] || 'ارفع PDF/صورة لتشغيل محرك الرؤية المحلي.'
              }`
          : localCad
            ? `Local drawing analysis finished. ${knowledgeAvailabilityLabel(kbCount, false)}. Resolve System Applicable Standards inside the system card.`
            : `Project-field analysis. ${knowledgeAvailabilityLabel(kbCount, false)}. ${
                cadVision?.warnings_en?.[0] || 'Upload a PDF/image to run the local vision engine.'
              }`
      );
    } else {
      setHintTone('error');
      setHint(apiFailMessage(result, ar));
    }
    setBusy(null);
  };

  const onGenerateSystem = async (kind: (typeof FIRE_SYSTEM_DEFS)[number]['kind']) => {
    const gate = systemDesignInputGate(kind, client, data);
    if (!gate.ok) {
      setHint(
        ar
          ? `لا يمكن إنشاء التصميم لـ ${kind} — بيانات ناقصة: ${gate.missing.map((m) => m.label_ar).join(' · ')}`
          : `Cannot create design for ${kind} — missing: ${gate.missing.map((m) => m.label_en).join(' · ')}`
      );
      setHintTone('error');
      return;
    }
    setBusy(`sys-${kind}`);
    const result = await generateFireSystemDesign({
      projectId: client.id,
      kind,
      analysisId: design.analysis?.id,
      client,
      data,
    });
    const system = result.data?.system;
    const nextSystems = design.systems.map((s) =>
      s.kind === kind
        ? system || {
            ...s,
            status: 'unavailable' as const,
            error: apiFailMessage(result, true),
            error_code: apiFailCode(result),
            generatedAt: new Date().toISOString(),
          }
        : s
    );
    const nextDesign = { ...design, systems: nextSystems };
    const readiness = computeDesignReadiness(client, {
      ...data,
      design_center: nextDesign,
    });
    setDesign({
      ...nextDesign,
      readiness: {
        level: readiness.level,
        updatedAt: new Date().toISOString(),
        reasons_ar: readiness.reasons_ar,
        reasons_en: readiness.reasons_en,
      },
    });
    setHint(
      result.ok
        ? ar
          ? `System Applicable Standards لـ ${kind} (Primary / Conditional / Engineer-Verified) — ليست قائمة كل الأنظمة`
          : `System Applicable Standards for ${kind} (Primary / Conditional / Engineer-Verified) — not an all-systems dump`
        : apiFailMessage(result, ar)
    );
    setBusy(null);
  };

  const onCalc = async (kind: (typeof ENGINEERING_CALC_DEFS)[number]['kind']) => {
    setBusy(`calc-${kind}`);
    const result = await runEngineeringCalculation({
      projectId: client.id,
      kind,
      client,
      data,
    });
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
    setHint(
      result.ok
        ? ar
          ? `مراجع ${kind} حسب النظام المرتبط فقط (${calculation?.standards?.system || '—'}) — ليست قائمة موحّدة`
          : `${kind} standards for linked system only (${calculation?.standards?.system || '—'}) — not a shared dump`
        : apiFailMessage(result, ar)
    );
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
    const result = await requestDesignExport({
      projectId: client.id,
      kind,
      client,
      data,
    });
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
  const readinessLive = useMemo(
    () => computeDesignReadiness(client, { ...data, design_center: design }),
    [client, data, design]
  );
  const projectRefs = knowledge?.project_references?.length
    ? knowledge.project_references
    : knowledge?.applicable_codes || [];
  const kbDocCount = knowledge?.linked_document_ids?.length || 0;
  const cadVisionMeta = useMemo(() => {
    const raw = design.analysis?.result?.raw as
      | {
          cad_vision?: string;
          cad_vision_result?: {
            status?: string;
            zones_count?: number;
            walls_count?: number;
            gross_floor_area_m2?: number | null;
            occupancy?: string | null;
            scale?: { ratio_text?: string | null };
            warnings_ar?: string[];
            warnings_en?: string[];
            error?: string | null;
            error_code?: string | null;
            preview_data_url?: string | null;
            width_px?: number;
            height_px?: number;
            egress?: CADAnalysisResult['egress'];
            zone_system_requirements?: CADAnalysisResult['zone_system_requirements'];
            drawing_inspection?: DrawingInspectionReport | null;
          } | null;
        }
      | undefined;
    const snapshot = cadResultFromAnalysisJob(design.analysis);
    const persisted = raw?.cad_vision_result?.drawing_inspection || null;
    const inspection =
      persisted ||
      (snapshot
        ? inspectDrawing({
            ...snapshot,
            // Prefer title-block corpus when full PDF text was not persisted
            extracted_text: snapshot.extracted_text || snapshot.title_block?.raw_text || '',
          })
        : null);
    return {
      active: raw?.cad_vision === 'local_client',
      result: raw?.cad_vision_result || null,
      status: raw?.cad_vision || 'not_run',
      snapshot,
      inspection,
    };
  }, [design.analysis]);

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
            <p className="text-xs mt-2 font-bold text-sky-700 dark:text-sky-300">
              Design Readiness:{' '}
              {ar ? readinessLive.label_ar : readinessLive.label_en}{' '}
              <span className={`font-semibold ${muted}`}>({readinessLive.level})</span>
            </p>
            {kbDocCount > 0 ? (
              <p className="text-xs text-emerald-600 mt-1 font-semibold">
                {knowledgeAvailabilityLabel(kbDocCount, ar)}
              </p>
            ) : (
              <p className={`text-xs mt-1 ${muted}`}>
                {ar
                  ? 'ارفع لوائح الدفاع المدني في /design لربط مراجع متاحة في قاعدة المعرفة (ليست معايير منطبقة تلقائياً).'
                  : 'Upload Civil Defense docs in /design to link knowledge-base references (not auto-applicable standards).'}
              </p>
            )}
            {projectRefs.length ? (
              <p className={`text-xs mt-1 ${muted}`}>
                <span className="font-semibold text-sky-700 dark:text-sky-300">
                  {ar ? 'مراجع المشروع المكتشفة' : 'Project References'}
                </span>
                {': '}
                {projectRefs.slice(0, 8).join(', ')}
                {projectRefs.length > 8 ? '…' : ''}
              </p>
            ) : (
              <p className={`text-xs mt-1 ${muted}`}>
                {ar
                  ? 'اختر بنود العرض في المبيعات لاكتشاف مراجع المشروع (Project References).'
                  : 'Select sales quote services to discover Project References.'}
              </p>
            )}
            {readinessLive.reasons_ar.length ? (
              <p className={`text-[11px] mt-1 ${muted}`}>
                {(ar ? readinessLive.reasons_ar : readinessLive.reasons_en).slice(0, 2).join(' · ')}
              </p>
            ) : null}
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
            className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
              hintTone === 'error'
                ? dark
                  ? 'bg-rose-950/50 text-rose-100 border border-rose-800'
                  : 'bg-rose-50 text-rose-950 border border-rose-200'
                : hintTone === 'ok'
                  ? dark
                    ? 'bg-emerald-950/40 text-emerald-100 border border-emerald-800'
                    : 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                  : dark
                    ? 'bg-slate-800 text-slate-200 border border-slate-700'
                    : 'bg-amber-50 text-amber-950 border border-amber-100'
            }`}
          >
            {hint}
          </div>
        ) : null}

        {tab === 'space_safety' && (
          <DesignSpaceSafetySection
            client={client}
            value={spaceSafety}
            saving={saving}
            onChange={(space_safety) =>
              setDesign({
                ...design,
                space_safety: { ...space_safety, source: 'project_engineering' },
              })
            }
          />
        )}

        {tab === 'drawings' && (
          <section className={`${card} p-4 space-y-3`}>
            <h3 className="text-sm font-bold">{ar ? 'مخططات السلامة' : 'Safety blueprints'}</h3>
            <SafetyBlueprintsUpload
              client={client}
              buildingPlan={data.building_plan}
              value={data.safety_blueprints || EMPTY_SAFETY_BLUEPRINTS}
              onChange={(safety_blueprints) => onPatch({ safety_blueprints })}
              onPersist={onPersistBlueprints}
              planAttachments={data.plan_attachments}
              onPlanAttachmentsChange={(plan_attachments) => {
                onPatch({ plan_attachments });
                return onPersistDesignCenter(design, { plan_attachments });
              }}
            />
          </section>
        )}

        {tab === 'ai_center' && (
          <div className="space-y-5">
            <DrawingInspectionCard
              report={cadVisionMeta.inspection}
              preferAr={ar}
              dark={dark}
              busy={saving}
            />

            {cadVisionMeta.active ? (
              <div
                className={`rounded-xl px-4 py-3 text-sm border ${
                  dark
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-100'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <p className="font-bold">
                  {ar
                    ? 'محرك الرؤية المحلي نشط (Canvas — داخل المتصفح)'
                    : 'Local CAD vision engine active (in-browser Canvas)'}
                </p>
                <p className={`text-xs mt-1 ${muted}`}>
                  {ar
                    ? `فراغات مكتشفة: ${cadVisionMeta.result?.zones_count ?? 0} · جدران: ${cadVisionMeta.result?.walls_count ?? 0} · مقياس: ${cadVisionMeta.result?.scale?.ratio_text || 'غير معروف'} · مساحة: ${cadVisionMeta.result?.gross_floor_area_m2 ?? 'Needs Engineer Input'} m²`
                    : `Zones: ${cadVisionMeta.result?.zones_count ?? 0} · Walls: ${cadVisionMeta.result?.walls_count ?? 0} · Scale: ${cadVisionMeta.result?.scale?.ratio_text || 'Unknown'} · Area: ${cadVisionMeta.result?.gross_floor_area_m2 ?? 'Needs Engineer Input'} m²`}
                </p>
                <p className={`text-[11px] mt-1 ${muted}`}>
                  {ar
                    ? 'المعالجة 100% محلية في الذاكرة. الأسقف/MEP ما زالت غير متاحة.'
                    : 'Processing is 100% local in memory. Ceiling/MEP still not available.'}
                </p>
                <button
                  type="button"
                  onClick={() => setTab('drawings')}
                  className="mt-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2"
                >
                  {ar ? 'رفع/تحديث المخطط' : 'Upload / update drawing'}
                </button>
              </div>
            ) : (
              <div
                className={`rounded-xl px-4 py-3 text-sm border ${
                  dark
                    ? 'bg-amber-950/40 border-amber-800 text-amber-100'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}
              >
                <p className="font-bold">
                  {ar
                    ? 'محرك الرؤية المحلي جاهز — بانتظار PDF/صورة'
                    : 'Local vision engine ready — waiting for PDF/image'}
                </p>
                <p className={`text-xs mt-1 ${muted}`}>
                  {ar
                    ? 'ارفع مخطط PDF أو صورة ثم اضغط «تحليل بيانات المشروع». المعالجة تتم داخل المتصفح بدون إرسال الرسم لخادم خارجي. DWG يحتاج تصدير PDF.'
                    : 'Upload a PDF/image then click Analyze project data. Processing stays in the browser — no external vision API. DWG needs PDF export.'}
                </p>
                <button
                  type="button"
                  onClick={() => setTab('drawings')}
                  className="mt-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2"
                >
                  {ar ? 'رفع/تحديث المخطط' : 'Upload / update drawing'}
                </button>
              </div>
            )}

            {cadVisionMeta.snapshot && cadVisionMeta.snapshot.zones.length ? (
              <section className={`${card} p-4`}>
                <CadZoneOverlay
                  preferAr={ar}
                  dark={dark}
                  widthPx={cadVisionMeta.snapshot.width_px}
                  heightPx={cadVisionMeta.snapshot.height_px}
                  previewDataUrl={cadVisionMeta.snapshot.preview_data_url}
                  zones={cadVisionMeta.snapshot.zones}
                  egress={cadVisionMeta.snapshot.egress}
                  zoneRequirements={cadVisionMeta.snapshot.zone_system_requirements}
                  coverage={cadVisionMeta.snapshot.coverage}
                  onApplyOverride={onZoneOverride}
                />
              </section>
            ) : null}

            <div className={`${card} p-6 text-center space-y-4`}>
              <p className={`text-sm ${muted}`}>
                {ar
                  ? 'يشغّل محرك الرؤية المحلي على المخطط + الحقول الفعلية. مراجع قاعدة المعرفة «متاحة» وليست «منطبقة» حتى يعمل Applicability Engine داخل بطاقة النظام.'
                  : 'Runs the local vision engine on the drawing + real fields. Knowledge-base refs are “available”, not “applicable”, until Applicability Engine runs inside a system card.'}
              </p>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void onAnalyze()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold px-6 py-3 text-sm shadow-lg shadow-sky-600/20 disabled:opacity-60"
              >
                ✨ {ar ? 'تحليل بيانات المشروع' : 'Analyze project data'}
              </button>
            </div>

            <section className={`${card} p-4 space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{ar ? 'شريط التقدم' : 'Progress'}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${statusTone(design.analysis?.status, dark)}`}>
                  {jobStatusLabel(design.analysis?.status, ar)} · {analysisProgress}%
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
                    <span className={muted}>{jobStatusLabel(step.status, ar)}</span>
                  </li>
                ))}
              </ol>
              {design.analysis?.error ? (
                <p className="text-xs text-amber-600">{design.analysis.error}</p>
              ) : null}
              {(design.analysis?.status === 'completed' ||
                design.analysis?.status === 'needs_engineer_review') &&
              design.analysis.result
                ? (() => {
                    const notes = extractAnalysisNotes(
                      design.analysis.result,
                      ar,
                      design.analysis.steps
                    );
                    const areas = design.analysis.result.areas as
                      | { building_area_m2?: number | null }
                      | undefined;
                    return (
                      <div className="space-y-3">
                        <div
                          className={`rounded-lg px-3 py-2 text-xs space-y-1 ${
                            dark
                              ? 'bg-slate-900 border border-slate-700'
                              : 'bg-emerald-50 border border-emerald-100 text-emerald-950'
                          }`}
                        >
                          <p className="font-bold">
                            {ar ? 'نتائج من بيانات المشروع' : 'Results from project data'}
                          </p>
                          <p>
                            {ar ? 'الإشغال' : 'Occupancy'}:{' '}
                            {formatUnknownValue(
                              design.analysis.result.occupancy,
                              ar,
                              'needs_engineer_input'
                            )}
                          </p>
                          <p>
                            {ar ? 'المساحة' : 'Area'}:{' '}
                            {formatUnknownValue(areas?.building_area_m2, ar, 'needs_engineer_input')}{' '}
                            m²
                          </p>
                          <p>
                            {ar ? 'مخططات مرفوعة' : 'Drawings'}: {notes.drawingsCount}
                          </p>
                          {notes.applicableCodes.length ? (
                            <p>
                              {ar ? 'مراجع المشروع المكتشفة' : 'Project References'}:{' '}
                              {notes.applicableCodes.join(' · ')}
                            </p>
                          ) : null}
                          {notes.spaceNames.length ? (
                            <p>
                              {ar ? 'فراغات' : 'Spaces'}:{' '}
                              {notes.spaceNames.slice(0, 12).join(' · ')}
                              {notes.spaceNames.length > 12
                                ? ` (+${notes.spaceNames.length - 12})`
                                : ''}
                            </p>
                          ) : null}
                          {notes.summary ? (
                            <p className={`pt-1 ${muted}`}>{notes.summary}</p>
                          ) : null}
                        </div>

                        {(notes.observations.length > 0 || notes.citations.length > 0) && (
                          <div
                            className={`rounded-lg px-3 py-2 text-xs space-y-2 ${
                              dark
                                ? 'bg-amber-950/40 border border-amber-800/50'
                                : 'bg-amber-50 border border-amber-200 text-amber-950'
                            }`}
                          >
                            <p className="font-bold">
                              {ar ? 'الملاحظات' : 'Observations'} (
                              {notes.observations.length + notes.citations.length})
                            </p>
                            {notes.observations.length ? (
                              <ul className="list-disc ps-4 space-y-1.5">
                                {notes.observations.map((line, i) => (
                                  <li key={`an-obs-${i}`}>{line}</li>
                                ))}
                              </ul>
                            ) : null}
                            {notes.citations.length ? (
                              <div className="space-y-2 pt-1">
                                <p className="font-semibold">
                                  {ar
                                    ? 'مراجع قاعدة المعرفة'
                                    : 'Knowledge-base citations'}{' '}
                                  ({notes.citations.length})
                                </p>
                                <ul className="space-y-2">
                                  {notes.citations.map((c, i) => (
                                    <li
                                      key={`an-cite-${i}`}
                                      className={`rounded-md px-2 py-1.5 ${
                                        dark
                                          ? 'bg-slate-950/50 border border-slate-800'
                                          : 'bg-white/80 border border-amber-100'
                                      }`}
                                    >
                                      <p className="font-semibold">
                                        {c.documentTitle || (ar ? 'مستند' : 'Document')}
                                        {c.codeReference ? ` · ${c.codeReference}` : ''}
                                      </p>
                                      {c.paragraph ? (
                                        <p className={`mt-0.5 ${muted}`}>{c.paragraph}</p>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })()
                : null}
            </section>
          </div>
        )}

        {tab === 'smart_design' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIRE_SYSTEM_DEFS.map((sys) => {
              const row = design.systems.find((s) => s.kind === sys.kind);
              const std = row?.standards;
              const review = std?.requirementsSummary;
              const observations = std ? standardsObservationLines(std, ar) : [];
              const zoneHints = (cadVisionMeta.result?.zone_system_requirements || []).filter(
                (r) => r.systems?.includes(sys.kind)
              );
              return (
                <div key={sys.kind} className={`${card} p-4 space-y-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">{ar ? sys.label_ar : sys.label_en}</h3>
                      <p className={`text-[11px] mt-1 ${muted}`}>{sys.kind}</p>
                      {zoneHints.length ? (
                        <p className="text-[10px] mt-1 text-amber-700 dark:text-amber-300">
                          {ar ? 'متطلبات فراغات مكتشفة' : 'Detected zone requirements'}:{' '}
                          {zoneHints
                            .map((h) => `${h.zone_label || h.zone_id} → ${h.primary_codes.join('/')}`)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full ${statusTone(row?.status, dark)}`}>
                      {row?.status || 'idle'}
                    </span>
                  </div>

                  {std ? (
                    <div className={`text-[11px] space-y-2 rounded-lg px-2.5 py-2 ${dark ? 'bg-slate-950/60 border border-slate-800' : 'bg-slate-50 border border-slate-100'}`}>
                      <p className="font-bold">
                        {ar ? 'System Applicable Standards' : 'System Applicable Standards'}
                      </p>
                      <div>
                        <p className="font-semibold text-sky-700 dark:text-sky-300">
                          {ar ? 'أساسية (Primary)' : 'Primary'}
                        </p>
                        {std.primary.length ? (
                          std.primary.map((r) => (
                            <p key={`p-${sys.kind}-${r.code}`} className={muted}>
                              {r.code} · {r.editionLabel}
                            </p>
                          ))
                        ) : (
                          <p className={muted}>{ar ? 'لا يوجد' : 'None'}</p>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                          {ar ? 'الكود السعودي' : 'Saudi Code'}
                        </p>
                        {std.saudiCode.length ? (
                          std.saudiCode.map((r) => (
                            <p key={`s-${sys.kind}-${r.code}`} className={muted}>
                              {r.code} · {r.editionLabel}
                            </p>
                          ))
                        ) : (
                          <p className={muted}>{ar ? 'لا يوجد' : 'None'}</p>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">{ar ? 'Related' : 'Related'}</p>
                        {std.related.length ? (
                          std.related.map((r) => (
                            <p key={`r-${sys.kind}-${r.code}`} className={muted}>
                              {r.code} · {r.editionLabel}
                            </p>
                          ))
                        ) : (
                          <p className={muted}>{ar ? 'لا يوجد' : 'None'}</p>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-amber-700 dark:text-amber-300">
                          Conditional Standards
                        </p>
                        <p className={muted}>
                          {std.conditional.length
                            ? std.conditional.map((r) => r.code).join(', ')
                            : ar
                              ? 'لا يوجد'
                              : 'None'}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-violet-700 dark:text-violet-300">
                          Engineer-Verified Standards
                        </p>
                        <p className={muted}>
                          {[...std.primary, ...std.saudiCode, ...std.related, ...std.conditional]
                            .filter((r) => r.status === 'verified')
                            .map((r) => r.code)
                            .join(', ') || (ar ? 'لا يوجد بعد — بانتظار تحقق المهندس' : 'None yet — awaiting engineer verification')}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold">{ar ? 'لماذا ينطبق؟' : 'Why applicable?'}</p>
                        <p className={muted}>{ar ? std.whyApplicable_ar : std.whyApplicable_en}</p>
                      </div>
                      <div>
                        <p className="font-semibold">{ar ? 'فحص المتطلبات' : 'Requirements check'}</p>
                        <p className={muted}>
                          {ar ? 'عدد المتطلبات' : 'Total'}: {review?.total ?? 0} ·{' '}
                          {ar ? 'تم التحقق' : 'Verified'}: {review?.verified ?? 0} ·{' '}
                          {ar ? 'الملاحظات' : 'Notes'}:{' '}
                          {Math.max(review?.notes ?? 0, observations.length)}
                        </p>
                        <p className="text-amber-700 dark:text-amber-300 font-medium">
                          {reviewStatusLabel(review?.reviewStatus, ar)}
                        </p>
                      </div>
                      {observations.length ? (
                        <details className="rounded-md border border-amber-300/50 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-700/40 px-2 py-1.5 open:pb-2" open>
                          <summary className="cursor-pointer font-semibold text-amber-900 dark:text-amber-200 list-none flex items-center justify-between gap-2">
                            <span>
                              {ar ? 'الملاحظات' : 'Observations'} ({observations.length})
                            </span>
                            <span className={`text-[10px] font-normal ${muted}`}>
                              {ar ? 'اضغط للطي/الفتح' : 'Toggle'}
                            </span>
                          </summary>
                          <ul className="mt-2 space-y-1.5 list-disc ps-4 text-amber-950 dark:text-amber-100">
                            {observations.map((note, i) => (
                              <li key={`${sys.kind}-note-${i}`}>{note}</li>
                            ))}
                          </ul>
                        </details>
                      ) : (review?.notes ?? 0) > 0 ? (
                        <p className={`text-[10px] ${muted}`}>
                          {ar
                            ? 'عدد الملاحظات موجود لكن النص غير محفوظ — أعد «تحديد المراجع المنطبقة» لعرض التفاصيل.'
                            : 'Notes count exists but text was not saved — re-run Resolve applicable standards.'}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!canCreateSystemDesign(sys.kind, client, data) ? (
                    <p className={`text-[10px] ${muted}`}>
                      {ar
                        ? `مدخلات ناقصة: ${systemDesignInputGate(sys.kind, client, data)
                            .missing.map((m) => m.label_ar)
                            .join(' · ')}`
                        : `Missing inputs: ${systemDesignInputGate(sys.kind, client, data)
                            .missing.map((m) => m.label_en)
                            .join(' · ')}`}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={!!busy || !canCreateSystemDesign(sys.kind, client, data)}
                    onClick={() => void onGenerateSystem(sys.kind)}
                    className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 disabled:opacity-60"
                  >
                    {std
                      ? ar
                        ? 'تحديث المراجع المنطبقة للنظام'
                        : 'Refresh system applicable standards'
                      : ar
                        ? 'تشغيل Applicability Engine'
                        : 'Run Applicability Engine'}
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
              const std = row?.standards;
              const observations = std ? standardsObservationLines(std, ar) : [];
              return (
                <div key={calc.kind} className={`${card} p-4 space-y-3`}>
                  <div className="flex justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">{ar ? calc.label_ar : calc.label_en}</h3>
                      {std ? (
                        <p className={`text-[10px] mt-0.5 ${muted}`}>
                          {ar ? 'نظام مرتبط' : 'Linked system'}: {std.system}
                        </p>
                      ) : null}
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full ${statusTone(row?.status, dark)}`}>
                      {row?.status || 'idle'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void onCalc(calc.kind)}
                    className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 disabled:opacity-60"
                  >
                    {ar ? 'تحليل مراجع الحساب' : 'Resolve calc standards'}
                  </button>
                  {std ? (
                    <div
                      className={`text-[11px] space-y-1.5 rounded-lg px-2.5 py-2 ${
                        dark ? 'bg-slate-950/60 border border-slate-800' : 'bg-slate-50 border border-slate-100'
                      }`}
                    >
                      <p>
                        <span className="font-semibold text-sky-700 dark:text-sky-300">Primary: </span>
                        {std.primary.map((r) => r.code).join(', ') || '—'}
                      </p>
                      <p>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          {ar ? 'كود سعودي' : 'Saudi'}:{' '}
                        </span>
                        {std.saudiCode.map((r) => r.code).join(', ') || '—'}
                      </p>
                      <p>
                        <span className="font-semibold">Related: </span>
                        {std.related.map((r) => r.code).join(', ') || '—'}
                      </p>
                      <p>
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          Conditional:{' '}
                        </span>
                        {std.conditional.map((r) => r.code).join(', ') || '—'}
                      </p>
                      <p className={`text-[10px] ${muted}`}>
                        {ar ? std.whyApplicable_ar : std.whyApplicable_en}
                      </p>
                      <p className="text-amber-700 dark:text-amber-300 font-medium">
                        {reviewStatusLabel(std.requirementsSummary.reviewStatus, ar)}
                      </p>
                      {observations.length ? (
                        <details className="rounded-md border border-amber-300/50 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-700/40 px-2 py-1.5" open>
                          <summary className="cursor-pointer font-semibold text-amber-900 dark:text-amber-200">
                            {ar ? 'الملاحظات' : 'Observations'} ({observations.length})
                          </summary>
                          <ul className="mt-2 space-y-1.5 list-disc ps-4 text-amber-950 dark:text-amber-100">
                            {observations.map((note, i) => (
                              <li key={`${calc.kind}-note-${i}`}>{note}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : row?.error ? (
                    <p className="text-[11px] text-amber-600">{row.error}</p>
                  ) : (
                    <p className={`text-[11px] ${muted}`}>
                      {ar
                        ? 'اضغط لتحليل المراجع المنطبقة على هذا الحساب فقط — بدون قائمة أكواد موحّدة لكل البطاقات.'
                        : 'Resolve standards that apply to this calculation only — not one shared code list.'}
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
                {ar ? 'مراجع المشروع المكتشفة (Project References)' : 'Project References (discovered)'}
              </h3>
              <p className={`text-[11px] ${muted}`}>
                {ar
                  ? 'من نطاق العرض/المبيعات — ليست System Applicable Standards'
                  : 'From sales/quote scope — not System Applicable Standards'}
              </p>
              <p className={`text-xs ${muted}`}>
                {(knowledge?.project_references?.length
                  ? knowledge.project_references
                  : knowledge?.applicable_codes || []
                ).join(' · ') || '—'}
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

        {tab === 'audit' && (
          <div className="space-y-4">
            {!cadVisionMeta.snapshot ? (
              <div className={`${card} p-5 text-sm ${muted}`}>
                {ar
                  ? 'شغّل التحليل المحلي للمخطط أولًا من مركز الذكاء التصميمي لتوليد تفريغ الحسابات والمطابقة.'
                  : 'Run local drawing analysis from the AI Design Center first to generate the pre-design audit.'}
              </div>
            ) : (
              <>
                <div className={`${card} p-4 space-y-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold">
                        {ar ? 'تفريغ الحسابات والمطابقة' : 'Pre-Design Calculations & Compliance'}
                      </h3>
                      <p className={`text-xs mt-1 ${muted}`}>
                        {ar ? 'الحالة العامة' : 'Overall'}:{' '}
                        <span className="font-bold">
                          {cadVisionMeta.snapshot.compliance_report?.overall_status ||
                            'NEEDS_ENGINEER_REVIEW'}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-2"
                        onClick={() => {
                          const snap = cadVisionMeta.snapshot;
                          if (!snap) return;
                          const html = buildPreDesignAuditHtml(snap, {
                            projectName: client.business_name || client.name || client.id,
                            projectId: client.id,
                            preferAr: ar,
                          });
                          downloadPreDesignAuditHtml(
                            html,
                            `pre-design-audit-${client.id.slice(0, 8)}.html`
                          );
                          setHintTone('ok');
                          setHint(
                            ar
                              ? 'تم تنزيل تقرير التدقيق HTML — استخدم طباعة المتصفح لحفظ PDF'
                              : 'Audit HTML downloaded — use browser Print to save PDF'
                          );
                        }}
                      >
                        {ar
                          ? 'تصدير تدقيق ما قبل التصميم (PDF/HTML)'
                          : 'Export Pre-Design Engineering Audit PDF'}
                      </button>
                      <button
                        type="button"
                        className={`rounded-lg border text-xs font-bold px-3 py-2 ${
                          dark ? 'border-slate-600 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'
                        }`}
                        onClick={() => {
                          const snap = cadVisionMeta.snapshot;
                          if (!snap) return;
                          openPreDesignAuditPrint(
                            buildPreDesignAuditHtml(snap, {
                              projectName: client.business_name || client.name || client.id,
                              projectId: client.id,
                              preferAr: ar,
                            })
                          );
                        }}
                      >
                        {ar ? 'فتح للطباعة' : 'Open for print'}
                      </button>
                    </div>
                  </div>
                  <p className={`text-[11px] ${muted}`}>
                    {ar
                      ? cadVisionMeta.snapshot.coverage?.summary_ar
                      : cadVisionMeta.snapshot.coverage?.summary_en}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className={`${card} p-4 space-y-2`}>
                    <h4 className="text-xs font-bold">
                      {ar ? 'تقدير هيدروليكي أولي' : 'Hydraulic pre-estimate'}
                    </h4>
                    <p className={`text-[11px] ${muted}`}>
                      {ar
                        ? cadVisionMeta.snapshot.pre_calculations?.hydraulic.note_ar
                        : cadVisionMeta.snapshot.pre_calculations?.hydraulic.note_en}
                    </p>
                    <p className="text-xs">
                      GPM:{' '}
                      {cadVisionMeta.snapshot.pre_calculations?.hydraulic.estimated_flow_gpm ??
                        '—'}{' '}
                      · min:{' '}
                      {cadVisionMeta.snapshot.pre_calculations?.hydraulic.estimated_duration_min ??
                        '—'}
                    </p>
                  </div>
                  <div className={`${card} p-4 space-y-2`}>
                    <h4 className="text-xs font-bold">
                      {ar ? 'تقدير بطارية الإنذار' : 'Alarm battery pre-estimate'}
                    </h4>
                    <p className={`text-[11px] ${muted}`}>
                      {ar
                        ? cadVisionMeta.snapshot.pre_calculations?.alarm_battery.note_ar
                        : cadVisionMeta.snapshot.pre_calculations?.alarm_battery.note_en}
                    </p>
                    <p className="text-xs">
                      Ah:{' '}
                      {cadVisionMeta.snapshot.pre_calculations?.alarm_battery.estimated_ah ?? '—'} ·
                      SD:{' '}
                      {cadVisionMeta.snapshot.pre_calculations?.alarm_battery.smoke_count ?? 0} ·
                      MCP:{' '}
                      {cadVisionMeta.snapshot.pre_calculations?.alarm_battery.mcp_count ?? 0}
                    </p>
                  </div>
                </div>

                <div className={`${card} p-4 space-y-2`}>
                  <h4 className="text-xs font-bold">
                    {ar ? 'قائمة المطابقة' : 'Compliance checklist'}
                  </h4>
                  <ul className="space-y-2">
                    {(cadVisionMeta.snapshot.compliance_report?.items || []).map((it) => (
                      <li
                        key={it.id}
                        className={`rounded-lg px-3 py-2 text-xs border ${
                          it.status === 'CRITICAL_NON_COMPLIANCE'
                            ? dark
                              ? 'border-red-800 bg-red-950/40'
                              : 'border-red-200 bg-red-50'
                            : it.status === 'COMPLIANT'
                              ? dark
                                ? 'border-emerald-800 bg-emerald-950/30'
                                : 'border-emerald-200 bg-emerald-50'
                              : dark
                                ? 'border-amber-800 bg-amber-950/30'
                                : 'border-amber-200 bg-amber-50'
                        }`}
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-bold">{ar ? it.title_ar : it.title_en}</span>
                          <span className="font-semibold">{it.status}</span>
                        </div>
                        <p className={`mt-1 ${muted}`}>{ar ? it.detail_ar : it.detail_en}</p>
                        <p className={`mt-0.5 text-[10px] ${muted}`}>{it.code_refs.join(' · ')}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {cadVisionMeta.snapshot.zones.length ? (
                  <section className={`${card} p-4`}>
                    <CadZoneOverlay
                      preferAr={ar}
                      dark={dark}
                      widthPx={cadVisionMeta.snapshot.width_px}
                      heightPx={cadVisionMeta.snapshot.height_px}
                      previewDataUrl={cadVisionMeta.snapshot.preview_data_url}
                      zones={cadVisionMeta.snapshot.zones}
                      egress={cadVisionMeta.snapshot.egress}
                      zoneRequirements={cadVisionMeta.snapshot.zone_system_requirements}
                      coverage={cadVisionMeta.snapshot.coverage}
                      onApplyOverride={onZoneOverride}
                    />
                  </section>
                ) : null}
              </>
            )}
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
