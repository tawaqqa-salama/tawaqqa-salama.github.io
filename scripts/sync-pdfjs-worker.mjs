#!/usr/bin/env node
/**
 * Copy pdfjs-dist worker into public/ so browser Knowledge Base extraction
 * never depends on CDN (unpkg/cdnjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const candidates = [
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  'node_modules/pdfjs-dist/build/pdf.worker.mjs',
];

const src = candidates
  .map((rel) => path.join(root, rel))
  .find((p) => fs.existsSync(p));

if (!src) {
  console.error('[sync-pdfjs-worker] pdfjs-dist worker not found');
  process.exit(1);
}

const destDir = path.join(root, 'public', 'pdfjs');
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, 'pdf.worker.min.mjs');
fs.copyFileSync(src, dest);

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules/pdfjs-dist/package.json'), 'utf8')
);
fs.writeFileSync(
  path.join(destDir, 'VERSION.txt'),
  `pdfjs-dist@${pkg.version}\nsource=${path.relative(root, src)}\n`,
  'utf8'
);
console.log(
  `[sync-pdfjs-worker] ${path.relative(root, src)} → public/pdfjs/pdf.worker.min.mjs`
);
