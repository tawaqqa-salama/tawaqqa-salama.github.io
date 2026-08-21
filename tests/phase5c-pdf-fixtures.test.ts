import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const outputDir = '/tmp/phase5c-pdf-fixtures';
const assetDir = '/tmp/phase5c-pdf-assets';

describe('Phase 5C local visit PDF fixtures', () => {
  it('generates fixtures A-H from the actual field visit PDF builder', async () => {
    process.env.PHASE5C_FIXTURE_DIR = outputDir;
    process.env.PHASE5C_ASSET_DIR = assetDir;
    fs.rmSync(outputDir, { recursive: true, force: true });
    await import('../scripts/test-phase5c-visit-pdf');
    const files = fs.readdirSync(outputDir).filter((name) => name.endsWith('.html')).sort();
    const allFixtures = [
      'A-no-evidence.html', 'B-one-image.html', 'C-multiple-images.html', 'D-portrait-landscape.html',
      'E-before-after-linked.html', 'F-image-pdf.html', 'G-failed-media.html', 'H-long-evidence.html',
    ];
    const selected = process.env.PHASE5C_FIXTURE_ONLY;
    expect(files).toEqual(selected ? [`${selected}.html`] : allFixtures);
    if (!selected) {
      expect(fs.readFileSync(path.join(outputDir, 'A-no-evidence.html'), 'utf8')).not.toContain('التوثيق المصور والمرفقات');
      expect(fs.readFileSync(path.join(outputDir, 'F-image-pdf.html'), 'utf8')).toContain('مرفق PDF:');
    }
  });
});
