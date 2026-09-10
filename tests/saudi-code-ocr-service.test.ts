/**
 * Contract smoke: standalone OCR service exists and stays isolated from Next/browser.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const svc = join(root, 'services/ocr');

describe('saudi-code-ocr service contract', () => {
  it('ships isolated service files (not NEXT_PUBLIC / not Supabase-coupled)', () => {
    for (const rel of [
      'package.json',
      'Dockerfile',
      'README.md',
      'src/index.ts',
      'src/app.ts',
      'src/auth.ts',
      'src/process.ts',
      'src/tesseract.ts',
      'src/pdf-raster.ts',
      'tests/ocr-service.test.ts',
    ]) {
      expect(existsSync(join(svc, rel)), rel).toBe(true);
    }

    const readme = readFileSync(join(svc, 'README.md'), 'utf8');
    expect(readme).toMatch(/Cloud Run/);
    expect(readme).toMatch(/DI_OCR_ENDPOINT/);
    expect(readme).toMatch(/OCR_API_KEY/);
    expect(readme).not.toMatch(/NEXT_PUBLIC_OCR/);

    const dockerfile = readFileSync(join(svc, 'Dockerfile'), 'utf8');
    expect(dockerfile).toMatch(/tesseract-ocr-ara/);
    expect(dockerfile).toMatch(/tesseract-ocr-eng/);
    expect(dockerfile).toMatch(/poppler-utils/);
    expect(dockerfile).toMatch(/ocruser/);

    const app = readFileSync(join(svc, 'src/app.ts'), 'utf8');
    expect(app).not.toMatch(/supabase|NEXT_PUBLIC_/i);
    expect(app).toMatch(/\/health/);
    expect(app).toMatch(/\/ocr/);
  });

  it('passes service unit tests A–L', () => {
    execFileSync('npm', ['install'], {
      cwd: svc,
      stdio: 'pipe',
      env: process.env,
    });
    const out = execFileSync('npm', ['test'], {
      cwd: svc,
      encoding: 'utf8',
      env: process.env,
    });
    expect(out).toMatch(/passed/i);
  }, 120_000);
});
