import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

function preflightBlock(workflow: string) {
  return workflow.split('preflight:')[1]?.split('baseline:')[0] ?? '';
}

function resolvePreflightTargetRef(env: Record<string, string | undefined>) {
  return env.GITHUB_REF_NAME ?? env.SUPABASE_TARGET_GIT_REF ?? '';
}

function isProtectedTargetRef(targetRef: string) {
  const normalized = targetRef.trim().toLowerCase();
  return !normalized || normalized === 'main' || normalized === 'master';
}

describe('Supabase preflight workflow_dispatch target ref entrypoint', () => {
  const workflow = read('.github/workflows/supabase-branch-baseline.yml');
  const preflight = preflightBlock(workflow);

  it('routes workflow_dispatch preflight logical target through SUPABASE_TARGET_GIT_REF, not GITHUB_REF_NAME', () => {
    expect(preflight).toContain('SUPABASE_TARGET_GIT_REF: ${{ inputs.target_git_ref }}');
    expect(preflight).not.toMatch(/^\s*GITHUB_REF_NAME:/m);
    expect(preflight).toContain('env -u GITHUB_REF_NAME node scripts/preflight-supabase-branch.mjs');
  });

  it('accepts fix/supabase-branch-baseline when dispatch runs from main but GitHub default ref is main', () => {
    const dispatchFromMainEnv = {
      GITHUB_REF_NAME: 'main',
      SUPABASE_TARGET_GIT_REF: 'fix/supabase-branch-baseline',
    };

    expect(resolvePreflightTargetRef(dispatchFromMainEnv)).toBe('main');

    const wiredEnv = {
      GITHUB_REF_NAME: undefined,
      SUPABASE_TARGET_GIT_REF: 'fix/supabase-branch-baseline',
    };

    expect(resolvePreflightTargetRef(wiredEnv)).toBe('fix/supabase-branch-baseline');
    expect(isProtectedTargetRef(resolvePreflightTargetRef(wiredEnv))).toBe(false);
  });

  it('still rejects main as the explicit workflow input target', () => {
    expect(preflight).toContain("inputs.target_git_ref != 'main'");
    expect(preflight).toContain("inputs.target_git_ref != 'master'");
    expect(isProtectedTargetRef('main')).toBe(true);
    expect(isProtectedTargetRef('master')).toBe(true);
  });
});
