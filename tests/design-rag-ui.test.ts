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

  it('keeps company identity server-controlled', () => {
    expect(routeSource).toContain("withTenantApi(req, { module: 'design' })");
    expect(routeSource).toContain('gated.ctx.tenantId');
    expect(routeSource).toContain('// Ignore client-supplied company_id');
  });
});
