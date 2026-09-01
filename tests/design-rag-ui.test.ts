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

  it('renders retrieved evidence with an explicit RTL layout and one confidence badge', () => {
    expect(moduleSource).toContain('dir="rtl"');
    expect(moduleSource).toContain('الأدلة المسترجعة');
    expect(moduleSource).toContain('أقوى دليل مسترجع');
    expect(moduleSource).toContain('الثقة ${rag.confidence}%');
    expect(moduleSource).not.toContain('Confidence: {rag.confidence}% —');
  });

  it('falls back to tenant-scoped direct RAG on static GitHub Pages', () => {
    expect(moduleSource).toContain("response.status === 404 || response.status === 405");
    expect(moduleSource).toContain('ragQuery(query, 5, { companyId: tenantCompanyId })');
    expect(moduleSource).toContain('GitHub Pages is a static export');
  });

  it('shows indexed-document readiness and query suggestions in the design center', () => {
    expect(moduleSource).toContain('indexedKnowledgeDocs');
    expect(moduleSource).toContain('No indexed company document is ready yet');
    expect(moduleSource).toContain('ragPromptSuggestions');
    expect(moduleSource).toContain('setQuestion(prompt)');
  });

  it('keeps company identity server-controlled', () => {
    expect(routeSource).toContain("withTenantApi(req, { module: 'design' })");
    expect(routeSource).toContain('gated.ctx.tenantId');
    expect(routeSource).toContain('// Ignore client-supplied company_id');
  });
});
