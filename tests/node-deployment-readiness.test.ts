import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nextConfig = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
const deployNode = readFileSync(
  new URL('../.github/workflows/deploy-node.yml', import.meta.url),
  'utf8'
);
const deployPages = readFileSync(
  new URL('../.github/workflows/deploy-pages.yml', import.meta.url),
  'utf8'
);
const modeSource = readFileSync(new URL('../lib/runtime/mode.ts', import.meta.url), 'utf8');
const reingestRoute = readFileSync(
  new URL('../app/api/design/knowledge/reingest/route.ts', import.meta.url),
  'utf8'
);
const nodeDoc = readFileSync(new URL('../docs/NODE_DEPLOYMENT.md', import.meta.url), 'utf8');

describe('Node deployment readiness', () => {
  it('keeps GitHub Pages workflow and only enables export when USER_PAGES/GITHUB_PAGES', () => {
    expect(existsSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url))).toBe(
      true
    );
    expect(deployPages).toContain('USER_PAGES: "true"');
    expect(deployPages).toContain('mv app/api .api-build-tmp');
    expect(nextConfig).toContain('output: "export"');
    expect(nextConfig).toContain('isUserPages');
    expect(nextConfig).toContain('isGithubPages');
  });

  it('Node CI clears static-export flags and keeps API routes', () => {
    expect(deployNode).toContain('USER_PAGES: ""');
    expect(deployNode).toContain('GITHUB_PAGES: ""');
    expect(deployNode).toContain('NEXT_PUBLIC_STATIC_EXPORT: ""');
    expect(deployNode).toContain('Build Node app');
    expect(deployNode).not.toContain('mv app/api');
  });

  it('runtime helpers treat unset static flags as Node (API available)', () => {
    expect(modeSource).toContain('areApiRoutesAvailable');
    expect(modeSource).toContain('isStaticPagesBuild');
    expect(modeSource).toContain("NEXT_PUBLIC_STATIC_EXPORT === 'true'");
  });

  it('does not require vercel.json for Next.js auto-detection', () => {
    expect(existsSync(new URL('../vercel.json', import.meta.url))).toBe(false);
  });

  it('documents NFPA reingest maxDuration=300 without silently reducing it', () => {
    expect(reingestRoute).toContain('maxDuration = 300');
    expect(reingestRoute).toContain("runtime = 'nodejs'");
    expect(nodeDoc).toContain('maxDuration = 300');
    expect(nodeDoc).toContain('ASYNC JOB');
  });

  it('documents required public and server-only env vars', () => {
    expect(nodeDoc).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(nodeDoc).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(nodeDoc).toContain('AUTH_SESSION_SECRET');
    expect(nodeDoc).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(nodeDoc).toContain('never NEXT_PUBLIC_');
    expect(nodeDoc).toContain('GitHub Pages');
    expect(nodeDoc).toContain('Rollback');
  });
});
