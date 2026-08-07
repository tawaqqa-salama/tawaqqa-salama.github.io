/**
 * Bridge: Design Intelligence knowledge base ↔ Sales ↔ Projects / Design Center.
 * Uses real indexed Civil Defense docs + SBC/NFPA compliance — no fabricated citations.
 */

import { validateCompliance } from '@/lib/compliance/engine';
import type { ComplianceFinding as PlatformFinding } from '@/lib/compliance/types';
import {
  getQuotationServiceLabel,
  normalizeQuotationServices,
  type QuotationServiceId,
} from '@/lib/constants/quotation-services';
import {
  listKnowledgeDocuments,
  listKnowledgeDocumentsSync,
  ragQuery,
} from '@/lib/design-intelligence/knowledge-base';
import type { DiKnowledgeDocument, RagCitation } from '@/lib/design-intelligence/types';
import type {
  ComplianceFinding,
  ComplianceRecommendation,
  DesignCenterState,
  DesignComplianceState,
  DesignKnowledgeCitation,
  DesignKnowledgeLinks,
} from '@/lib/projects/design-center/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

/** Map sales quotation line items → codes / search tags for company KB */
export const QUOTATION_SERVICE_KNOWLEDGE_MAP: Record<
  QuotationServiceId,
  { codes: string[]; tags: string[]; query_ar: string; query_en: string }
> = {
  site_visits: {
    codes: ['SBC-801'],
    tags: ['inspection', 'site', 'معاينة'],
    query_ar: 'اشتراطات الزيارة الميدانية والدفاع المدني',
    query_en: 'civil defense site inspection requirements',
  },
  firefighting_plans: {
    codes: ['NFPA-13', 'NFPA-14', 'SBC-801'],
    tags: ['sprinkler', 'firefighting', 'hose', 'إطفاء', 'مرشات'],
    query_ar: 'اشتراطات مخططات أنظمة الإطفاء والمرشات والدفاع المدني',
    query_en: 'firefighting and sprinkler design requirements civil defense',
  },
  alarm_plans: {
    codes: ['NFPA-72', 'SBC-801'],
    tags: ['alarm', 'detection', 'إنذار', 'كشف'],
    query_ar: 'اشتراطات أنظمة الإنذار والكشف الدفاع المدني',
    query_en: 'fire alarm and detection civil defense requirements',
  },
  life_safety_plans: {
    codes: ['NFPA-101', 'SBC-801'],
    tags: ['egress', 'exits', 'life safety', 'مخارج', 'سلامة'],
    query_ar: 'اشتراطات سلامة الأرواح ومخارج الطوارئ الدفاع المدني',
    query_en: 'life safety egress and emergency exits civil defense',
  },
  hydraulic_calculations: {
    codes: ['NFPA-13', 'NFPA-20'],
    tags: ['hydraulic', 'pump', 'هيدروليك', 'مضخات'],
    query_ar: 'اشتراطات الحسابات الهيدروليكية ومضخات الإطفاء',
    query_en: 'hydraulic calculation and fire pump requirements',
  },
  technical_study_report: {
    codes: ['SBC-801', 'NFPA'],
    tags: ['study', 'report', 'دراسة', 'تقرير'],
    query_ar: 'متطلبات الدراسة الفنية وتقرير السلامة الدفاع المدني',
    query_en: 'technical fire safety study report requirements',
  },
  bill_of_quantities: {
    codes: ['SBC-801'],
    tags: ['boq', 'كميات'],
    query_ar: 'بنود أنظمة السلامة في جداول الكميات',
    query_en: 'fire safety bill of quantities items',
  },
  building_plan_info_report: {
    codes: ['SBC-801'],
    tags: ['occupancy', 'building', 'إشغال', 'مخطط'],
    query_ar: 'تصنيف الإشغال واشتراطات معلومات المخطط الدفاع المدني',
    query_en: 'occupancy classification and building plan civil defense',
  },
  study_delivery_report: {
    codes: ['SBC-801'],
    tags: ['delivery', 'transmittal', 'تسليم'],
    query_ar: 'متطلبات تسليم الدراسة للدفاع المدني',
    query_en: 'civil defense study delivery requirements',
  },
  completion_certificate: {
    codes: ['SBC-801'],
    tags: ['completion', 'certificate', 'شهادة'],
    query_ar: 'اشتراطات شهادة إنهاء أعمال السلامة الدفاع المدني',
    query_en: 'fire safety completion certificate requirements',
  },
};

export type ProjectKnowledgeContext = {
  projectId: string;
  projectName: string;
  activityType: string | null;
  occupancy: string | null;
  services: QuotationServiceId[];
  applicable_codes: string[];
  query_ar: string;
  query_en: string;
  tags: string[];
};

export function codesFromQuotationServices(services: unknown): string[] {
  const ids = normalizeQuotationServices(services);
  const codes = new Set<string>();
  for (const id of ids) {
    for (const c of QUOTATION_SERVICE_KNOWLEDGE_MAP[id]?.codes || []) codes.add(c);
  }
  if (!codes.size) {
    codes.add('SBC-801');
    codes.add('NFPA');
  }
  return Array.from(codes);
}

export function buildProjectKnowledgeContext(
  client: Pick<
    ClientRecord,
    | 'id'
    | 'name'
    | 'business_name'
    | 'activity_type'
    | 'quotation_services'
    | 'building_area'
    | 'floors_count'
  >,
  data?: ProjectEngineeringData | null
): ProjectKnowledgeContext {
  const services = normalizeQuotationServices(client.quotation_services);
  const tags = new Set<string>();
  const queriesAr: string[] = [];
  const queriesEn: string[] = [];
  for (const id of services) {
    const m = QUOTATION_SERVICE_KNOWLEDGE_MAP[id];
    if (!m) continue;
    m.tags.forEach((t) => tags.add(t));
    queriesAr.push(m.query_ar);
    queriesEn.push(m.query_en);
  }

  const occupancy =
    data?.building_plan?.occupancy_classification ||
    data?.technical_report?.building_classification ||
    null;
  const activity = client.activity_type || null;

  if (occupancy) {
    tags.add(occupancy);
    queriesAr.unshift(`اشتراطات الدفاع المدني لتصنيف الإشغال ${occupancy}`);
  }
  if (activity) {
    tags.add(activity);
    queriesAr.unshift(`اشتراطات ومتطلبات الدفاع المدني لنشاط ${activity}`);
  }

  const fromLinks = data?.design_center?.knowledge_links?.applicable_codes || [];
  const codes = Array.from(
    new Set([...codesFromQuotationServices(services), ...fromLinks])
  );

  return {
    projectId: client.id,
    projectName: client.business_name || client.name || client.id,
    activityType: activity,
    occupancy,
    services,
    applicable_codes: codes,
    query_ar:
      queriesAr.slice(0, 3).join(' — ') ||
      'اشتراطات ومتطلبات الدفاع المدني للسلامة من الحريق',
    query_en:
      queriesEn.slice(0, 3).join(' — ') ||
      'civil defense fire safety requirements',
    tags: Array.from(tags),
  };
}

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

export function matchKnowledgeDocuments(
  docs: DiKnowledgeDocument[],
  ctx: ProjectKnowledgeContext
): DiKnowledgeDocument[] {
  const codeSet = new Set(ctx.applicable_codes.map(norm));
  const tags = ctx.tags.map(norm);
  const scored = docs
    .filter((d) => d.status !== 'archived' && d.index_status !== 'failed')
    .map((doc) => {
      let score = 0;
      for (const c of doc.applicable_codes || []) {
        const nc = norm(c);
        if (codeSet.has(nc) || [...codeSet].some((x) => nc.includes(x) || x.includes(nc))) {
          score += 3;
        }
      }
      const hay = norm(
        [doc.title, doc.category, doc.discipline, ...(doc.tags || []), ...(doc.keywords || [])].join(
          ' '
        )
      );
      for (const t of tags) {
        if (t.length > 2 && hay.includes(t)) score += 1;
      }
      // Civil defense / safety uploads should surface for fire projects
      if (/دفاع|مدني|سلامة|حريق|civil.?defense|fire|sbc|nfpa/i.test(hay)) score += 1;
      return { doc, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.doc);
}

export function citationFromRag(c: RagCitation): DesignKnowledgeCitation {
  return {
    document_id: c.documentId,
    title: c.documentTitle,
    excerpt: c.paragraph,
    code_reference: c.codeReference,
    confidence: c.confidence,
    page_number: c.pageNumber,
  };
}

function mapPlatformSeverity(
  s: PlatformFinding['severity']
): ComplianceFinding['severity'] {
  if (s === 'fail') return 'error';
  if (s === 'warning') return 'warning';
  if (s === 'pass') return 'info';
  return 'info';
}

function mapPlatformFinding(f: PlatformFinding): ComplianceFinding {
  const isSbc = f.standard === 'SBC';
  return {
    id: f.id,
    severity: mapPlatformSeverity(f.severity),
    code: f.code,
    category: isSbc ? 'sbc' : 'nfpa',
    message_ar: `${f.title} — ${f.detail}`,
    message_en: `${f.title} — ${f.detail}`,
  };
}

/**
 * Sync sales services + matched KB docs into design_center.knowledge_links
 * (metadata only — no mock engineering values).
 */
export async function syncKnowledgeLinksToDesignCenter(
  client: ClientRecord,
  data: ProjectEngineeringData
): Promise<ProjectEngineeringData> {
  const ctx = buildProjectKnowledgeContext(client, data);
  const docs = await listKnowledgeDocuments().catch(() => listKnowledgeDocumentsSync());
  const matched = matchKnowledgeDocuments(docs, ctx).slice(0, 40);

  const prev = data.design_center?.knowledge_links;
  const links: DesignKnowledgeLinks = {
    applicable_codes: ctx.applicable_codes,
    sales_services: ctx.services,
    linked_document_ids: matched.map((d) => d.id),
    linked_document_titles: matched.map((d) => d.title),
    citations: prev?.citations || [],
    last_synced_at: new Date().toISOString(),
    source: 'sales_projects_bridge',
  };

  return {
    ...data,
    design_center: {
      ...data.design_center,
      knowledge_links: links,
      updated_at: new Date().toISOString(),
    },
  };
}

export function syncKnowledgeLinksToDesignCenterSync(
  client: ClientRecord,
  data: ProjectEngineeringData
): ProjectEngineeringData {
  const ctx = buildProjectKnowledgeContext(client, data);
  const docs = listKnowledgeDocumentsSync();
  const matched = matchKnowledgeDocuments(docs, ctx).slice(0, 40);
  const prev = data.design_center?.knowledge_links;

  return {
    ...data,
    design_center: {
      ...data.design_center,
      knowledge_links: {
        applicable_codes: ctx.applicable_codes,
        sales_services: ctx.services,
        linked_document_ids: matched.map((d) => d.id),
        linked_document_titles: matched.map((d) => d.title),
        citations: prev?.citations || [],
        last_synced_at: new Date().toISOString(),
        source: 'sales_projects_bridge',
      },
      updated_at: new Date().toISOString(),
    },
  };
}

/**
 * Real Design Center compliance: platform SBC/NFPA rules + RAG over company KB uploads.
 */
export async function runProjectKnowledgeCompliance(params: {
  client: ClientRecord;
  data: ProjectEngineeringData;
}): Promise<DesignComplianceState> {
  const { client, data } = params;
  const ctx = buildProjectKnowledgeContext(client, data);
  const plan = data.building_plan;
  const hasSprinklers =
    plan.sprinkler_system === 'نعم' ||
    data.design_center?.systems?.some((s) => s.kind === 'sprinkler' && s.status === 'completed');
  const hasFireAlarm =
    plan.fire_alarm_system === 'نعم' ||
    data.design_center?.systems?.some((s) => s.kind === 'fire_alarm' && s.status === 'completed');

  const platform = validateCompliance({
    activityType: client.activity_type,
    floorsCount: client.floors_count,
    buildingArea: client.building_area,
    landArea: client.land_area,
    hasSprinklers: Boolean(hasSprinklers),
    hasFireAlarm: Boolean(hasFireAlarm),
    hasDetection: Boolean(hasFireAlarm),
    notes: [
      ctx.occupancy ? `occupancy:${ctx.occupancy}` : '',
      `services:${ctx.services.join(',')}`,
      `codes:${ctx.applicable_codes.join(',')}`,
    ]
      .filter(Boolean)
      .join(' | '),
  });

  const findings: ComplianceFinding[] = platform.findings.map(mapPlatformFinding);
  const recommendations: ComplianceRecommendation[] = [];
  const citations: DesignKnowledgeCitation[] = [];

  const rag = await ragQuery(ctx.query_ar, 6);
  if (rag.reliable && rag.citations.length) {
    for (const c of rag.citations) {
      citations.push(citationFromRag(c));
      findings.push({
        id: `kb-${c.chunkId}`,
        severity: c.confidence >= 40 ? 'warning' : 'info',
        code: c.codeReference || 'CD-KB',
        category: 'other',
        message_ar: `مرجع معرفة: ${c.documentTitle} — ${c.paragraph.slice(0, 220)}`,
        message_en: `Knowledge ref: ${c.documentTitle} — ${c.paragraph.slice(0, 220)}`,
      });
    }
    recommendations.push({
      id: 'kb-rag-primary',
      text_ar: `راجع الاشتراطات المرتبطة من قاعدة المعرفة (${rag.citations.length} مرجع، ثقة ${rag.confidence}%).`,
      text_en: `Review linked knowledge-base requirements (${rag.citations.length} citations, ${rag.confidence}% confidence).`,
    });
  } else {
    recommendations.push({
      id: 'kb-rag-empty',
      text_ar:
        'لم تُعثر على مقاطع مفهرسة مطابقة بقوة كافية. ارفع/فهرس لوائح الدفاع المدني في مركز الذكاء التصميمي ثم أعد الفحص.',
      text_en:
        'No strong indexed KB matches. Upload/index Civil Defense regs in Design Intelligence, then re-run.',
    });
  }

  for (const hint of platform.ekbHints || []) {
    recommendations.push({
      id: `ekb-${hint}`,
      text_ar: `مرجع EKB: ${hint}`,
      text_en: `EKB hint: ${hint}`,
    });
  }

  if (ctx.services.length) {
    recommendations.push({
      id: 'sales-scope',
      text_ar: `نطاق المبيعات المرتبط: ${ctx.services.map(getQuotationServiceLabel).join(' · ')}`,
      text_en: `Linked sales scope: ${ctx.services.join(', ')}`,
    });
  }

  const fails = findings.filter((f) => f.severity === 'error' || f.severity === 'critical').length;
  const warns = findings.filter((f) => f.severity === 'warning').length;
  const matchPercent = Math.max(
    0,
    Math.min(100, Math.round(platform.score - fails * 8 - warns * 2))
  );

  return {
    status: 'completed',
    matchPercent,
    findings,
    recommendations,
    standards: ['NFPA', 'SBC'],
    checkedAt: new Date().toISOString(),
    error: null,
    error_code: null,
    knowledge_citations: citations,
  };
}

export function describeSalesKnowledgePreview(services: unknown): {
  codes: string[];
  serviceLabels: string[];
  hint_ar: string;
} {
  const ids = normalizeQuotationServices(services);
  return {
    codes: codesFromQuotationServices(ids),
    serviceLabels: ids.map(getQuotationServiceLabel),
    hint_ar:
      ids.length > 0
        ? 'عند الحفظ تُربط بنود العرض بأكواد SBC/NFPA وقاعدة معرفة الدفاع المدني في مرحلة التصاميم.'
        : 'اختر بنود العرض لربطها تلقائياً بمركز التصاميم وقاعدة المعرفة.',
  };
}

export function emptyKnowledgeLinks(): DesignKnowledgeLinks {
  return {
    applicable_codes: [],
    sales_services: [],
    linked_document_ids: [],
    linked_document_titles: [],
    citations: [],
    last_synced_at: null,
    source: null,
  };
}

/** Helper for Design Center UI — merge compliance result citations into knowledge_links */
export function mergeComplianceIntoDesignCenter(
  design: DesignCenterState,
  compliance: DesignComplianceState
): DesignCenterState {
  return {
    ...design,
    compliance,
    knowledge_links: {
      ...(design.knowledge_links || emptyKnowledgeLinks()),
      citations: compliance.knowledge_citations || design.knowledge_links?.citations || [],
      last_synced_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };
}
