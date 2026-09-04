import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const moduleSource = readFileSync(
  new URL('../components/design/DesignIntelligenceModule.tsx', import.meta.url),
  'utf8'
);
const routeSource = readFileSync(
  new URL('../app/api/design/rag/route.ts', import.meta.url),
  'utf8'
);

describe('design RAG UI integration', () => {
  it('uses the tenant-gated RAG endpoint from the browser', () => {
    expect(moduleSource).toContain("fetch('/api/design/rag'");
    expect(moduleSource).toContain("body: JSON.stringify({ question: query, topK: 5 })");
    expect(moduleSource).not.toContain('const answer = await ragQuery(question)');
  });

  it('renders retrieved evidence with RTL/bidi isolation and confidence bands', () => {
    expect(moduleSource).toContain("dir={lang === 'ar' ? 'rtl' : 'ltr'}");
    expect(moduleSource).toContain('الأدلة المسترجعة');
    expect(moduleSource).toContain('unicodeBidi: \'plaintext\'');
    expect(moduleSource).toContain('whitespace-pre-wrap');
    expect(moduleSource).toContain('<bdi dir="ltr">');
    expect(moduleSource).toContain('مطابقة قوية');
    expect(moduleSource).toContain('مطابقة ضعيفة · تحتاج مراجعة');
    expect(moduleSource).toContain('لا يوجد مرجع موثوق كافٍ');
    expect(moduleSource).toContain('أفضل نتيجة مطابقة');
    expect(moduleSource).toContain('أقوى دليل مطابق');
    // Weak results must not use the old "موثوق · الثقة" badge pattern
    expect(moduleSource).not.toContain('موثوق · الثقة');
    expect(moduleSource).not.toContain('${rag.reliable ? \'موثوق\'');
  });

  it('falls back to tenant-scoped direct RAG on static GitHub Pages', () => {
    expect(moduleSource).toContain("response.status === 404 || response.status === 405");
    expect(moduleSource).toContain('ragQuery(query, 5, { companyId: tenantCompanyId })');
    expect(moduleSource).toContain('GitHub Pages is a static export');
  });

  it('shows indexed-document readiness and non-applicability prompt suggestions', () => {
    expect(moduleSource).toContain('indexedKnowledgeDocs');
    expect(moduleSource).toContain('No indexed company document is ready yet');
    expect(moduleSource).toContain('ragPromptSuggestions');
    expect(moduleSource).toContain('ما متطلبات NFPA المذكورة في الملفات المفهرسة؟');
    expect(moduleSource).not.toContain('ما متطلبات NFPA المنطبقة على هذا المشروع؟');
    expect(moduleSource).toContain('setQuestion(prompt)');
  });

  it('keeps company identity server-controlled and accepts additive filters', () => {
    expect(routeSource).toContain("withTenantApi(req, { module: 'design' })");
    expect(routeSource).toContain('gated.ctx.tenantId');
    expect(routeSource).toContain('// Ignore client-supplied company_id');
    expect(routeSource).toContain('codeFamilies');
    expect(routeSource).toContain('documentIds');
    expect(routeSource).toContain('projectId');
  });

  it('warns when indexed source is not engineering-verified', () => {
    expect(moduleSource).toContain(
      'المصدر مفهرس، لكنه غير مُعتمد كقاعدة هندسية موثقة.'
    );
  });
});
