/**
 * Knowledge-backed Design Center engine (local).
 * Uses real project form data + company Civil Defense knowledge base / RAG.
 * Does NOT invent CAD geometry or hydraulic pump curves.
 */

import {
  buildProjectKnowledgeContext,
  matchKnowledgeDocuments,
} from '@/lib/design-intelligence/project-knowledge-bridge';
import {
  listKnowledgeDocuments,
  ragQuery,
} from '@/lib/design-intelligence/knowledge-base';
import { createEmptyAnalysisJob, emptyAnalysisSteps } from '@/lib/projects/design-center/state';
import {
  bindingForCalc,
  buildProjectDesignStandardsContext,
  filterCitationsToApplicableCodes,
  resolveApplicableStandards,
  snapshotToArtifactRefs,
  toSystemStandardsSnapshot,
} from '@/lib/projects/design-center/standards';
import { systemDesignInputGate } from '@/lib/projects/design-center/readiness';
import type { CADAnalysisResult } from '@/lib/projects/design-center/vision/types';
import type {
  DesignAnalysisJob,
  DesignAnalysisStep,
  DesignBuildingModel,
  DesignExportJob,
  DesignExportKind,
  DesignSystemGeneration,
  EngineeringCalcKind,
  EngineeringCalcResult,
  FireSystemKind,
} from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

export type KnowledgeEngineContext = {
  client: ClientRecord;
  data: ProjectEngineeringData;
  /** Optional in-browser CAD/PDF vision result (never invent if absent) */
  cadVision?: CADAnalysisResult | null;
};

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** RAG query hints only — codes come from the Applicability Engine catalog */
const SYSTEM_QUERY_AR: Record<FireSystemKind, string> = {
  fire_alarm: 'اشتراطات نظام الإنذار والكشف الدفاع المدني NFPA-72',
  sprinkler: 'اشتراطات المرشات الآلية NFPA-13 الدفاع المدني',
  hose_reel: 'اشتراطات خراطيم الإطفاء NFPA-14',
  fire_extinguisher: 'اشتراطات طفايات الحريق الدفاع المدني',
  fm200: 'اشتراطات أنظمة الغاز النظيف FM200',
  co2: 'اشتراطات نظام ثاني أكسيد الكربون للإطفاء',
  kitchen_hood: 'اشتراطات أنظمة إطفاء مطابخ الشفاطات',
  clean_agent: 'اشتراطات أنظمة العوامل النظيفة للإطفاء',
};


/**
 * Analyze project using uploaded drawings metadata + building plan fields + KB RAG.
 */
export async function runKnowledgeBackedPlanAnalysis(params: {
  projectId: string;
  sheetId?: string | null;
  versionId?: string | null;
  previous?: DesignAnalysisJob | null;
  context: KnowledgeEngineContext;
}): Promise<DesignAnalysisJob> {
  const { client, data } = params.context;
  const vision = params.context.cadVision || null;
  const visionOk =
    !!vision &&
    (vision.status === 'completed' || vision.status === 'partial') &&
    vision.engine === 'local_client';
  const plan = data.building_plan;
  const sheets = data.design_center?.sheets || [];
  const drawings = data.plan_attachments?.engineering_drawings || [];
  const hasDrawing = sheets.length > 0 || drawings.length > 0;
  const ctx = buildProjectKnowledgeContext(client, data);
  const docs = await listKnowledgeDocuments();
  const matched = matchKnowledgeDocuments(docs, ctx);
  const rag = await ragQuery(ctx.query_ar, 8);

  const baseSteps: DesignAnalysisStep[] = emptyAnalysisSteps();
  const byId = new Map<DesignAnalysisStep['id'], DesignAnalysisStep>(
    baseSteps.map((s) => [s.id, s])
  );

  const set = (id: DesignAnalysisStep['id'], status: DesignAnalysisStep['status']) => {
    const prev = byId.get(id)!;
    byId.set(id, { ...prev, status });
  };

  const visionArea =
    visionOk && vision.gross_floor_area_m2 != null && vision.gross_floor_area_m2 > 0
      ? vision.gross_floor_area_m2
      : null;
  const visionOccupancy =
    visionOk && vision.occupancy ? vision.occupancy : null;
  const visionRooms = visionOk ? vision.zones || [] : [];
  const visionWalls = visionOk ? vision.walls || [] : [];
  const visionExits =
    visionOk && vision.exits_count != null
      ? vision.exits_count
      : visionOk && vision.doors_count != null
        ? vision.doors_count
        : null;

  if (visionOk) {
    set('analyze_plan', 'completed');
    set('detect_rooms', visionRooms.length ? 'completed' : 'needs_engineer_review');
    set('detect_walls', visionWalls.length ? 'completed' : 'needs_engineer_review');
  } else if (vision?.status === 'password_protected') {
    set('analyze_plan', 'failed');
    set('detect_rooms', 'not_available');
    set('detect_walls', 'not_available');
  } else if (vision?.status === 'unsupported' || vision?.status === 'failed') {
    set('analyze_plan', vision.status === 'failed' ? 'failed' : 'not_available');
    set('detect_rooms', 'not_available');
    set('detect_walls', 'not_available');
  } else if (!hasDrawing) {
    set('analyze_plan', 'failed');
    set('detect_rooms', 'not_available');
    set('detect_walls', 'not_available');
  } else {
    // Drawing present but vision not run (e.g. server path) — do not fake CAD
    set('analyze_plan', 'pending');
    set('detect_rooms', 'pending');
    set('detect_walls', 'pending');
  }

  const hasDims =
    Boolean(plan.building_height_m || plan.underground_depth_m) ||
    (visionOk && vision.scale.meters_per_pixel != null);
  set(
    'extract_dimensions',
    hasDims ? 'completed' : 'needs_engineer_review'
  );
  set(
    'extract_areas',
    client.building_area || plan.total_site_area_m2 || visionArea
      ? 'completed'
      : 'needs_engineer_review'
  );
  set(
    'occupancy_type',
    ctx.occupancy || ctx.activityType || visionOccupancy
      ? 'completed'
      : 'needs_engineer_review'
  );
  set('detect_stairs', plan.stairs_count ? 'completed' : 'needs_engineer_review');
  set(
    'detect_exits',
    plan.exits_count || plan.emergency_exits_doors || visionExits != null
      ? 'completed'
      : 'needs_engineer_review'
  );
  const spaceNamesFromVision = visionRooms
    .map((z, i) => z.label || `Zone ${i + 1}`)
    .slice(0, 40);
  set(
    'read_space_names',
    plan.floors_description || spaceNamesFromVision.length
      ? 'completed'
      : 'needs_engineer_review'
  );
  // Ceiling / MEP still require specialized engines
  set('ceiling_analysis', 'not_available');
  set('mep_coordination', 'not_available');
  const digitalReady =
    Boolean(ctx.occupancy || ctx.activityType || visionOccupancy) &&
    Boolean(client.building_area || plan.total_site_area_m2 || visionArea) &&
    (hasDrawing || visionOk);
  set(
    'build_digital_model',
    visionOk && visionRooms.length
      ? 'needs_engineer_review'
      : digitalReady
        ? 'needs_engineer_review'
        : 'pending'
  );

  const steps = Array.from(byId.values());
  const done = steps.filter((s) => s.status === 'completed').length;
  const progress = Math.round((done / steps.length) * 100);

  const observations_ar: string[] = [];
  const observations_en: string[] = [];
  const note = (ar: string, en: string) => {
    observations_ar.push(ar);
    observations_en.push(en);
  };

  if (visionOk) {
    note(
      `محرك الرؤية المحلي عالج المخطط (${vision.file_name || 'drawing'}) — ${visionRooms.length} فراغ · ${visionWalls.length} جدار.`,
      `Local vision engine processed the drawing (${vision.file_name || 'drawing'}) — ${visionRooms.length} zones · ${visionWalls.length} walls.`
    );
    const warnAr = vision.warnings_ar || [];
    const warnEn = vision.warnings_en || [];
    const warnN = Math.max(warnAr.length, warnEn.length);
    for (let i = 0; i < warnN; i++) {
      if (warnAr[i] || warnEn[i]) note(warnAr[i] || warnEn[i] || '', warnEn[i] || warnAr[i] || '');
    }
  } else if (vision?.status === 'password_protected') {
    note(
      'ملف PDF محمي بكلمة مرور — أزل الحماية أو أكمل الإدخال اليدوي.',
      'Password-protected PDF — remove protection or enter fields manually.'
    );
  } else if (vision?.status === 'unsupported') {
    note(
      'صيغة الملف غير مدعومة للمحرك المحلي — صدّر PDF/صورة.',
      'File format unsupported by local vision — export PDF/image.'
    );
  } else if (!hasDrawing) {
    note(
      'لم يُرفع مخطط هندسي بعد — ارفع PDF أو صورة من تبويب إدارة المخططات.',
      'No engineering drawing uploaded yet — upload PDF/image from Plan Management.'
    );
  } else {
    note(
      'لم يُشغَّل محرك الرؤية المحلي بعد — اضغط «تحليل بيانات المشروع» من المتصفح.',
      'Local vision engine has not run yet — click Analyze project data in the browser.'
    );
  }

  if (!(plan.building_height_m || plan.underground_depth_m) && !(visionOk && vision.scale.meters_per_pixel)) {
    note(
      'الأبعاد: أدخل ارتفاع المبنى أو تأكد من وجود مقياس الرسم على اللوحة.',
      'Dimensions: enter building height or ensure a drawing scale is present on the sheet.'
    );
  }
  if (!(client.building_area || plan.total_site_area_m2 || visionArea)) {
    note(
      'المساحات: أكمل مساحة المبنى أو أعد التحليل بعد اكتشاف المقياس.',
      'Areas: fill building area or re-analyze after scale detection.'
    );
  }
  if (!plan.stairs_count) {
    note(
      'السلالم: لا يوجد عدد سلالم مستخرج — Needs Engineer Input.',
      'Stairs: no stair count extracted — Needs Engineer Input.'
    );
  }
  if (!(plan.exits_count || plan.emergency_exits_doors || visionExits != null)) {
    note(
      'المخارج: لا يوجد عدد مخارج/أبواب — Needs Engineer Input.',
      'Exits: no exit/door count — Needs Engineer Input.'
    );
  }
  if (!plan.floors_description && !spaceNamesFromVision.length) {
    note(
      'أسماء الفراغات: أضف وصف الأدوار أو اعتمد الفراغات المكتشفة بعد المراجعة.',
      'Space names: add floor description or accept detected zones after review.'
    );
  }

  const occupancyOut = ctx.occupancy || visionOccupancy || ctx.activityType;
  const areaOut = num(client.building_area) ?? visionArea;

  const model: DesignBuildingModel = {
    occupancy: occupancyOut,
    areas: {
      building_area_m2: areaOut,
      site_area_m2: num(plan.total_site_area_m2) ?? num(client.land_area),
      floors_count: num(client.floors_count),
      height_m: num(plan.building_height_m),
      vision_gross_floor_area_m2: visionArea,
    },
    dimensions: {
      building_height_m: plan.building_height_m || null,
      underground_depth_m: plan.underground_depth_m || null,
      basement_floors: plan.basement_floors_count || null,
      scale_ratio: visionOk ? vision.scale.ratio_text : null,
      meters_per_pixel: visionOk ? vision.scale.meters_per_pixel : null,
    },
    stairs: plan.stairs_count
      ? [{ count: plan.stairs_count, source: 'building_plan' }]
      : [],
    exits: plan.exits_count
      ? [{ count: plan.exits_count, source: 'building_plan' }]
      : plan.emergency_exits_doors
        ? [{ doors: plan.emergency_exits_doors, source: 'building_plan' }]
        : visionExits != null
          ? [{ count: visionExits, source: 'local_cad_vision' }]
          : [],
    space_names: plan.floors_description
      ? String(plan.floors_description)
          .split(/[\n,،;/|]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 40)
      : spaceNamesFromVision,
    rooms: visionRooms,
    walls: visionWalls,
    raw: {
      source: visionOk ? 'local_cad_vision+knowledge' : 'project_knowledge_bridge',
      projectId: params.projectId,
      projectName: ctx.projectName,
      applicable_codes: ctx.applicable_codes,
      sales_services: ctx.services,
      drawings_count: sheets.length + drawings.length,
      sheet_titles: sheets.map((s) => s.title),
      systems_declared: {
        fire_alarm: plan.fire_alarm_system || null,
        sprinkler: plan.sprinkler_system || null,
      },
      knowledge_documents: matched.slice(0, 12).map((d) => ({
        id: d.id,
        title: d.title,
        codes: d.applicable_codes,
      })),
      knowledge_citations: (rag.citations || []).slice(0, 8).map((c) => ({
        documentTitle: c.documentTitle,
        codeReference: c.codeReference,
        paragraph: c.paragraph.slice(0, 280),
        confidence: c.confidence,
      })),
      rag_confidence: rag.confidence,
      rag_reliable: rag.reliable,
      cad_vision: visionOk ? 'local_client' : vision?.status || 'not_run',
      cad_vision_result: visionOk
        ? {
            status: vision.status,
            scale: vision.scale,
            title_block: vision.title_block,
            zones_count: visionRooms.length,
            walls_count: visionWalls.length,
            gross_floor_area_m2: visionArea,
            occupancy: visionOccupancy,
            exits_count: vision.exits_count,
            doors_count: vision.doors_count,
            privacy: vision.privacy,
            warnings_ar: vision.warnings_ar,
            warnings_en: vision.warnings_en,
          }
        : vision
          ? {
              status: vision.status,
              error: vision.error,
              error_code: vision.error_code,
              warnings_ar: vision.warnings_ar,
              warnings_en: vision.warnings_en,
            }
          : null,
      project_references: ctx.applicable_codes,
      knowledge_docs_available: matched.length,
      applicable_standards_count: null,
      observations_ar,
      observations_en,
      note_ar: visionOk
        ? 'تحليل محلي للمخطط (Canvas) + حقول المشروع + مراجع متاحة في قاعدة المعرفة. الأسقف/MEP غير متاحة.'
        : 'تحليل من حقول المشروع + مراجع متاحة في قاعدة المعرفة. شغّل محرك الرؤية المحلي من المتصفح على PDF/صورة.',
      note_en: visionOk
        ? 'Local Canvas drawing analysis + project fields + knowledge-base references. Ceiling/MEP not available.'
        : 'Project fields + knowledge-base references. Run the local vision engine in the browser on a PDF/image.',
    },
  };

  const missingCritical = !hasDrawing && !ctx.occupancy && !ctx.activityType && !visionOccupancy;
  if (missingCritical) {
    return createEmptyAnalysisJob({
      id: params.previous?.id || createEmptyAnalysisJob().id,
      status: 'failed',
      progress: 0,
      steps: steps.map((s) =>
        s.id === 'analyze_plan' || s.id === 'occupancy_type'
          ? { ...s, status: 'failed' }
          : s
      ),
      sourceSheetId: params.sheetId ?? null,
      sourceVersionId: params.versionId ?? null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error:
        'أرفق مخططاً أو أكمل تصنيف الإشغال/النشاط في بيانات المشروع ثم أعد التحليل.',
      error_code: 'PROJECT_CONTEXT_INCOMPLETE',
      result: null,
    });
  }

  const jobStatus =
    done === 0
      ? 'failed'
      : steps.some((s) => s.status === 'needs_engineer_review')
        ? 'needs_engineer_review'
        : 'completed';

  return createEmptyAnalysisJob({
    id: params.previous?.id || createEmptyAnalysisJob().id,
    status: jobStatus,
    progress,
    steps,
    sourceSheetId: params.sheetId ?? sheets[0]?.id ?? null,
    sourceVersionId: params.versionId ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error:
      vision?.status === 'password_protected'
        ? 'PDF محمي بكلمة مرور'
        : vision?.status === 'failed'
          ? vision.error
          : null,
    error_code:
      vision?.status === 'password_protected'
        ? 'PDF_PASSWORD_PROTECTED'
        : vision?.status === 'failed'
          ? vision.error_code
          : null,
    result: model,
  });
}

export async function runKnowledgeBackedSystemDesign(params: {
  projectId: string;
  kind: FireSystemKind;
  context?: KnowledgeEngineContext | null;
}): Promise<DesignSystemGeneration> {
  const queryAr = SYSTEM_QUERY_AR[params.kind];

  if (!params.context?.client || !params.context?.data) {
    return {
      kind: params.kind,
      status: 'failed',
      generatedAt: new Date().toISOString(),
      designId: null,
      error: 'مطلوب سياق المشروع لتحديد المراجع المنطبقة — لا تُعرض أكواد ثابتة بدون سياق.',
      error_code: 'PROJECT_CONTEXT_REQUIRED',
      artifactRefs: [],
      standards: null,
    };
  }

  const gate = systemDesignInputGate(params.kind, params.context.client, params.context.data);
  if (!gate.ok) {
    const missingAr = gate.missing.map((m) => m.label_ar).join(' · ');
    const missingEn = gate.missing.map((m) => m.label_en).join(' · ');
    return {
      kind: params.kind,
      status: 'failed',
      generatedAt: new Date().toISOString(),
      designId: null,
      error: `لا يمكن إنشاء/تحديد تصميم ${params.kind} — بيانات ناقصة: ${missingAr} / Missing: ${missingEn}`,
      error_code: 'SYSTEM_INPUTS_INCOMPLETE',
      artifactRefs: [],
      standards: null,
    };
  }

  const standardsCtx = buildProjectDesignStandardsContext(
    params.context.client,
    params.context.data
  );
  // Resolve for THIS system only — never merge other systems' primary codes
  const resolved = resolveApplicableStandards(standardsCtx, params.kind);
  const snapshot = toSystemStandardsSnapshot(params.kind, resolved);
  const artifactRefs = snapshotToArtifactRefs(snapshot);

  // RAG may explain requirements but cannot invent standards outside the snapshot
  const rag = await ragQuery(queryAr, 5);
  const kbLines = filterCitationsToApplicableCodes(rag.citations || [], snapshot);

  return {
    kind: params.kind,
    status: 'completed',
    generatedAt: new Date().toISOString(),
    designId: `std-${params.kind}-${Date.now().toString(36)}`,
    error: null,
    error_code: null,
    artifactRefs: [...artifactRefs, ...kbLines].slice(0, 12),
    standards: snapshot,
  };
}

export async function runKnowledgeBackedCalculation(params: {
  projectId: string;
  kind: EngineeringCalcKind;
  context?: KnowledgeEngineContext | null;
}): Promise<EngineeringCalcResult> {
  const binding = bindingForCalc(params.kind);

  if (!params.context?.client || !params.context?.data) {
    return {
      kind: params.kind,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      error: 'مطلوب سياق المشروع لتحديد مراجع الحساب — لا تُعرض قائمة أكواد ثابتة لكل البطاقات.',
      error_code: 'PROJECT_CONTEXT_REQUIRED',
      values: null,
      standards: null,
    };
  }

  const client = params.context.client;
  const plan = params.context.data.building_plan;
  const area = num(client.building_area);
  const floors = num(client.floors_count);
  const height = num(plan.building_height_m);

  // Resolve standards for the linked system only (Battery → fire_alarm, Hydraulic → sprinkler, …)
  const baseCtx = buildProjectDesignStandardsContext(client, params.context.data);
  const standardsCtx = {
    ...baseCtx,
    hasFirePump: binding.forceFirePump ? true : baseCtx.hasFirePump,
    hasStandpipe: binding.forceStandpipe ? true : baseCtx.hasStandpipe,
  };
  const resolved = resolveApplicableStandards(standardsCtx, binding.system);
  const snapshot = toSystemStandardsSnapshot(binding.system, resolved);

  const rag = await ragQuery(binding.query_ar, 4);
  const kbLines = filterCitationsToApplicableCodes(rag.citations || [], snapshot);

  const values: Record<string, number | string> = {
    source: 'standards_applicability_engine',
    kind: params.kind,
    linked_system: binding.system,
    // Only codes that apply to THIS calc’s system — never the full project dump
    codes: [
      ...snapshot.primary.map((r) => r.code),
      ...snapshot.saudiCode.map((r) => r.code),
      ...snapshot.conditional.map((r) => r.code),
    ].join(', '),
    building_area_m2: area ?? '',
    floors_count: floors ?? '',
    building_height_m: height ?? '',
    sprinkler_declared: plan.sprinkler_system || '',
    fire_alarm_declared: plan.fire_alarm_system || '',
    knowledge_hits_count: kbLines.length,
    note_ar:
      'المراجع من محرك الانطباق حسب نظام الحساب فقط. النتائج العددية النهائية تُعتمد بعد برنامج حساب معتمد من المهندس.',
    review_status: snapshot.requirementsSummary.reviewStatus,
  };

  // Deterministic planning estimates only (clearly labeled) — not pump selection
  if (params.kind === 'water_demand' && area && area > 0) {
    values.estimate_density_lpm_per_m2 = 0.2;
    values.estimated_demand_lpm = Math.round(area * 0.2 * 10) / 10;
    values.estimate_label_ar = 'تقدير أولي للكثافة — يُراجع وفق NFPA-13 hazard class';
  }
  if (params.kind === 'tank_size' && area && area > 0) {
    const demand = area * 0.2;
    values.estimate_duration_min = 30;
    values.estimated_volume_m3 = Math.round(((demand * 30) / 1000) * 100) / 100;
    values.estimate_label_ar = 'تقدير حجم خزاني أولي — يُراجع وفق اشتراطات الدفاع المدني';
  }

  return {
    kind: params.kind,
    status: 'completed',
    updatedAt: new Date().toISOString(),
    error: null,
    error_code: null,
    values,
    standards: snapshot,
  };
}

export async function runKnowledgeBackedExport(params: {
  projectId: string;
  kind: DesignExportKind;
  context?: KnowledgeEngineContext | null;
}): Promise<DesignExportJob> {
  const client = params.context?.client;
  const data = params.context?.data;
  const ctx = client && data ? buildProjectKnowledgeContext(client, data) : null;
  const compliance = data?.design_center?.compliance;
  const analysis = data?.design_center?.analysis;

  const lines = [
    `Design Center Export — ${params.kind}`,
    `Project: ${ctx?.projectName || params.projectId}`,
    `Codes: ${(ctx?.applicable_codes || []).join(', ')}`,
    `Occupancy: ${ctx?.occupancy || ctx?.activityType || '—'}`,
    `Analysis: ${analysis?.status || 'idle'} (${analysis?.progress ?? 0}%)`,
    `Compliance: ${compliance?.status || 'idle'} match=${compliance?.matchPercent ?? '—'}%`,
    `Findings: ${compliance?.findings?.length ?? 0}`,
    `KB citations: ${compliance?.knowledge_citations?.length ?? 0}`,
    '',
    ...(compliance?.findings || []).slice(0, 20).map(
      (f) => `- [${f.severity}] ${f.code}: ${f.message_ar || f.message_en}`
    ),
  ];
  const text = lines.join('\n');
  const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;

  return {
    kind: params.kind,
    status: 'completed',
    file: {
      id: `export-${params.kind}-${Date.now()}`,
      fileName: `${params.kind}-${params.projectId.slice(0, 8)}.txt`,
      format: 'txt',
      sizeBytes: text.length,
      mimeType: 'text/plain',
      dataUrl,
      uploadedAt: new Date().toISOString(),
      kind: 'engineering_drawing',
      storagePath: null,
    },
    error: null,
    error_code: null,
    updatedAt: new Date().toISOString(),
  };
}
