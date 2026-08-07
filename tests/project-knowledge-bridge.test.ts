import { describe, expect, it } from 'vitest';
import {
  buildProjectKnowledgeContext,
  codesFromQuotationServices,
  matchKnowledgeDocuments,
  syncKnowledgeLinksToDesignCenterSync,
} from '@/lib/design-intelligence/project-knowledge-bridge';
import type { DiKnowledgeDocument } from '@/lib/design-intelligence/types';
import { EMPTY_PROJECT_ENGINEERING_DATA } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import { mergeDesignCenterDefaults } from '@/lib/projects/design-center/state';

function client(partial?: Partial<ClientRecord>): ClientRecord {
  return Object.assign(
    {
      id: 'c1',
      name: 'عميل',
      business_name: 'منشأة',
      activity_type: 'معامل ومختبرات',
      quotation_services: ['firefighting_plans', 'alarm_plans'],
    },
    partial
  ) as ClientRecord;
}

describe('project knowledge bridge', () => {
  it('maps sales quotation services to SBC/NFPA codes', () => {
    const codes = codesFromQuotationServices(['firefighting_plans', 'alarm_plans', 'life_safety_plans']);
    expect(codes).toEqual(expect.arrayContaining(['NFPA-13', 'NFPA-72', 'NFPA-101', 'SBC-801']));
  });

  it('builds context from client + building plan occupancy', () => {
    const data = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
      building_plan: {
        ...EMPTY_PROJECT_ENGINEERING_DATA.building_plan,
        occupancy_classification: 'Mercantile',
      },
    };
    const ctx = buildProjectKnowledgeContext(client(), data);
    expect(ctx.applicable_codes.length).toBeGreaterThan(0);
    expect(ctx.query_ar).toMatch(/دفاع مدني|إشغال|نشاط/);
    expect(ctx.services).toContain('firefighting_plans');
  });

  it('matches uploaded civil defense docs by codes and keywords', () => {
    const docs: DiKnowledgeDocument[] = [
      {
        id: 'd1',
        title: 'شروط السلامة والحماية من الحريق في المعامل',
        status: 'active',
        index_status: 'indexed',
        applicable_codes: ['SBC-801', 'NFPA-13'],
        tags: ['دفاع مدني', 'إطفاء'],
        keywords: ['مرشات'],
      },
      {
        id: 'd2',
        title: 'Unrelated HR policy',
        status: 'active',
        index_status: 'indexed',
        applicable_codes: [],
        tags: ['hr'],
      },
    ];
    const ctx = buildProjectKnowledgeContext(client(), {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
    });
    const matched = matchKnowledgeDocuments(docs, ctx);
    expect(matched.map((d) => d.id)).toContain('d1');
    expect(matched.map((d) => d.id)).not.toContain('d2');
  });

  it('writes knowledge_links into design_center on sync', () => {
    const data = {
      ...EMPTY_PROJECT_ENGINEERING_DATA,
      design_center: mergeDesignCenterDefaults(null),
    };
    const next = syncKnowledgeLinksToDesignCenterSync(client(), data);
    expect(next.design_center.knowledge_links?.sales_services).toEqual(
      expect.arrayContaining(['firefighting_plans', 'alarm_plans'])
    );
    expect(next.design_center.knowledge_links?.applicable_codes?.length).toBeGreaterThan(0);
    expect(next.design_center.knowledge_links?.source).toBe('sales_projects_bridge');
  });
});
