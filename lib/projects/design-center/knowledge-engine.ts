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
};

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const SYSTEM_KB: Record<
  FireSystemKind,
  { codes: string[]; query_ar: string; label_ar: string }
> = {
  fire_alarm: {
    codes: ['NFPA-72', 'SBC-801'],
    query_ar: 'اشتراطات نظام الإنذار والكشف الدفاع المدني NFPA-72',
    label_ar: 'نظام الإنذار',
  },
  sprinkler: {
    codes: ['NFPA-13', 'SBC-801'],
    query_ar: 'اشتراطات المرشات الآلية NFPA-13 الدفاع المدني',
    label_ar: 'المرشات',
  },
  hose_reel: {
    codes: ['NFPA-14', 'SBC-801'],
    query_ar: 'اشتراطات خراطيم الإطفاء NFPA-14',
    label_ar: 'خراطيم الإطفاء',
  },
  fire_extinguisher: {
    codes: ['NFPA-10', 'SBC-801'],
    query_ar: 'اشتراطات طفايات الحريق الدفاع المدني',
    label_ar: 'طفايات الحريق',
  },
  fm200: {
    codes: ['NFPA-2001', 'SBC-801'],
    query_ar: 'اشتراطات أنظمة الغاز النظيف FM200',
    label_ar: 'FM-200',
  },
  co2: {
    codes: ['NFPA-12', 'SBC-801'],
    query_ar: 'اشتراطات نظام ثاني أكسيد الكربون للإطفاء',
    label_ar: 'CO2',
  },
  kitchen_hood: {
    codes: ['NFPA-96', 'SBC-801'],
    query_ar: 'اشتراطات أنظمة إطفاء مطابخ الشفاطات',
    label_ar: 'شفاط المطبخ',
  },
  clean_agent: {
    codes: ['NFPA-2001', 'SBC-801'],
    query_ar: 'اشتراطات أنظمة العوامل النظيفة للإطفاء',
    label_ar: 'عامل نظيف',
  },
};

const CALC_KB: Record<
  EngineeringCalcKind,
  { codes: string[]; query_ar: string; label_ar: string }
> = {
  hydraulic: {
    codes: ['NFPA-13'],
    query_ar: 'الحسابات الهيدروليكية للمرشات NFPA-13',
    label_ar: 'هيدروليك',
  },
  battery: {
    codes: ['NFPA-72'],
    query_ar: 'بطاريات أنظمة الإنذار NFPA-72 مدة الاحتياطي',
    label_ar: 'بطاريات',
  },
  voltage_drop: {
    codes: ['NFPA-72'],
    query_ar: 'هبوط الجهد دوائر الإنذار',
    label_ar: 'هبوط الجهد',
  },
  pipe_sizing: {
    codes: ['NFPA-13', 'NFPA-14'],
    query_ar: 'أقطار أنابيب الإطفاء NFPA-13',
    label_ar: 'أقطار الأنابيب',
  },
  water_demand: {
    codes: ['NFPA-13'],
    query_ar: 'طلب المياه لأنظمة المرشات',
    label_ar: 'طلب المياه',
  },
  pump: {
    codes: ['NFPA-20'],
    query_ar: 'مضخات الإطفاء NFPA-20',
    label_ar: 'المضخة',
  },
  tank_size: {
    codes: ['NFPA-22', 'SBC-801'],
    query_ar: 'خزانات مياه الإطفاء',
    label_ar: 'الخزان',
  },
  pressure_loss: {
    codes: ['NFPA-13'],
    query_ar: 'فاقد الضغط في شبكات الإطفاء',
    label_ar: 'فاقد الضغط',
  },
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

  set('analyze_plan', hasDrawing ? 'completed' : 'failed');
  set('detect_rooms', 'unavailable'); // needs CAD/vision engine
  set('detect_walls', 'unavailable');
  set(
    'extract_dimensions',
    plan.building_height_m || plan.underground_depth_m ? 'completed' : 'unavailable'
  );
  set(
    'extract_areas',
    client.building_area || plan.total_site_area_m2 ? 'completed' : 'unavailable'
  );
  set(
    'occupancy_type',
    ctx.occupancy || ctx.activityType ? 'completed' : 'failed'
  );
  set('detect_stairs', plan.stairs_count ? 'completed' : 'unavailable');
  set('detect_exits', plan.exits_count || plan.emergency_exits_doors ? 'completed' : 'unavailable');
  set(
    'read_space_names',
    plan.floors_description ? 'completed' : 'unavailable'
  );
  set('build_digital_model', 'completed');

  const steps = Array.from(byId.values());
  const done = steps.filter((s) => s.status === 'completed').length;
  const progress = Math.round((done / steps.length) * 100);

  const model: DesignBuildingModel = {
    occupancy: ctx.occupancy || ctx.activityType,
    areas: {
      building_area_m2: num(client.building_area),
      site_area_m2: num(plan.total_site_area_m2) ?? num(client.land_area),
      floors_count: num(client.floors_count),
      height_m: num(plan.building_height_m),
    },
    dimensions: {
      building_height_m: plan.building_height_m || null,
      underground_depth_m: plan.underground_depth_m || null,
      basement_floors: plan.basement_floors_count || null,
    },
    stairs: plan.stairs_count
      ? [{ count: plan.stairs_count, source: 'building_plan' }]
      : [],
    exits: plan.exits_count
      ? [{ count: plan.exits_count, source: 'building_plan' }]
      : plan.emergency_exits_doors
        ? [{ doors: plan.emergency_exits_doors, source: 'building_plan' }]
        : [],
    space_names: plan.floors_description
      ? String(plan.floors_description)
          .split(/[\n,،;/|]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 40)
      : [],
    rooms: [],
    walls: [],
    raw: {
      source: 'project_knowledge_bridge',
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
      cad_vision: 'not_configured',
      note_ar:
        'التحليل مبني على بيانات المشروع الفعلية + قاعدة المعرفة المفهرسة. كشف الغرف/الجدران من CAD يحتاج محرك رؤية منفصل.',
      note_en:
        'Analysis uses real project fields + indexed knowledge base. CAD room/wall detection needs a separate vision engine.',
    },
  };

  const missingCritical = !hasDrawing && !ctx.occupancy && !ctx.activityType;
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

  return createEmptyAnalysisJob({
    id: params.previous?.id || createEmptyAnalysisJob().id,
    status: 'completed',
    progress,
    steps,
    sourceSheetId: params.sheetId ?? sheets[0]?.id ?? null,
    sourceVersionId: params.versionId ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: null,
    error_code: null,
    result: model,
  });
}

export async function runKnowledgeBackedSystemDesign(params: {
  projectId: string;
  kind: FireSystemKind;
  context?: KnowledgeEngineContext | null;
}): Promise<DesignSystemGeneration> {
  const meta = SYSTEM_KB[params.kind];
  const citations: string[] = [];
  if (params.context) {
    const ctx = buildProjectKnowledgeContext(params.context.client, params.context.data);
    const rag = await ragQuery(`${meta.query_ar} — ${ctx.query_ar}`, 5);
    for (const c of rag.citations || []) {
      citations.push(
        `${c.documentTitle}${c.codeReference ? ` (${c.codeReference})` : ''}: ${c.paragraph.slice(0, 160)}`
      );
    }
    citations.unshift(
      `نطاق المشروع: ${ctx.projectName} · إشغال: ${ctx.occupancy || ctx.activityType || '—'} · أكواد: ${[...meta.codes, ...ctx.applicable_codes].join(', ')}`
    );
  } else {
    citations.push(`أكواد مرجعية: ${meta.codes.join(', ')}`);
  }

  return {
    kind: params.kind,
    status: 'completed',
    generatedAt: new Date().toISOString(),
    designId: `kb-${params.kind}-${Date.now().toString(36)}`,
    error: null,
    error_code: null,
    artifactRefs: citations.slice(0, 8),
  };
}

export async function runKnowledgeBackedCalculation(params: {
  projectId: string;
  kind: EngineeringCalcKind;
  context?: KnowledgeEngineContext | null;
}): Promise<EngineeringCalcResult> {
  const meta = CALC_KB[params.kind];
  const client = params.context?.client;
  const plan = params.context?.data.building_plan;
  const area = num(client?.building_area);
  const floors = num(client?.floors_count);
  const height = num(plan?.building_height_m);
  const rag = await ragQuery(meta.query_ar, 4);

  const values: Record<string, number | string> = {
    source: 'project_knowledge_bridge',
    kind: params.kind,
    codes: meta.codes.join(', '),
    building_area_m2: area ?? '',
    floors_count: floors ?? '',
    building_height_m: height ?? '',
    sprinkler_declared: plan?.sprinkler_system || '',
    fire_alarm_declared: plan?.fire_alarm_system || '',
    knowledge_hits_json: JSON.stringify(
      (rag.citations || []).slice(0, 4).map((c) => ({
        title: c.documentTitle,
        code: c.codeReference,
        excerpt: c.paragraph.slice(0, 180),
        confidence: c.confidence,
      }))
    ),
    note_ar:
      'المدخلات من بيانات المشروع الحقيقية والمراجع من قاعدة المعرفة. النتائج العددية النهائية للهيدروليك/المضخات تُعتمد بعد برنامج حساب معتمد من المهندس.',
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
