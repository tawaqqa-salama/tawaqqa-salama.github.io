#!/usr/bin/env node
/**
 * Post-build verification: the deployable Next server artifact for reingest
 * must include/resolve pdfjs-dist/legacy/build/pdf.worker.min.mjs and extract
 * >=1 page using the production Node worker strategy.
 *
 * Not a source-only check — inspects `.next` NFT / server chunks and runs
 * extraction against a staged deployable worker graph.
 *
 * Usage: node scripts/verify-pdfjs-worker-build.mjs
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const WORKER_SPEC = 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
const WORKER_REL = join(
  'node_modules',
  'pdfjs-dist',
  'legacy',
  'build',
  'pdf.worker.min.mjs'
);
const PDF_REL = join('node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs');
const REINGEST_NFT = join(
  root,
  '.next/server/app/api/design/knowledge/reingest/route.js.nft.json'
);
const REINGEST_ROUTE = join(
  root,
  '.next/server/app/api/design/knowledge/reingest/route.js'
);

function fail(message) {
  console.error(`[verify-pdfjs-worker-build] FAIL: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[verify-pdfjs-worker-build] OK: ${message}`);
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function minimalPdfBytes() {
  const raw = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 12 Tf 50 150 Td (Hello PDF) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000361 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
433
%%EOF
`;
  return Buffer.from(raw, 'utf8');
}

function assertSourceStrategy() {
  const runtime = readFileSync(
    join(root, 'lib/design-intelligence/pdfjs-runtime.ts'),
    'utf8'
  );
  const nodeWorker = readFileSync(
    join(root, 'lib/design-intelligence/pdfjs-node-worker.ts'),
    'utf8'
  );
  const cfg = readFileSync(join(root, 'next.config.ts'), 'utf8');

  if (/webpackIgnore/.test(runtime) || /webpackIgnore/.test(nodeWorker)) {
    fail('source still uses webpackIgnore for worker import');
  }
  if (
    !/import\s+\*\s+as\s+pdfjsWorker\s+from\s+['"]pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs['"]/.test(
      nodeWorker
    )
  ) {
    fail('pdfjs-node-worker.ts must statically import the legacy worker module');
  }
  if (/serverExternalPackages:\s*\[[^\]]*["']pdfjs-dist["']/.test(cfg)) {
    fail('next.config must not list pdfjs-dist in serverExternalPackages');
  }
  if (
    !/outputFileTracingIncludes/.test(cfg) ||
    !/pdf\.worker\.min\.mjs/.test(cfg)
  ) {
    fail(
      'next.config must narrowly include pdf.worker.min.mjs in outputFileTracingIncludes'
    );
  }
  if (/\*\*\/node_modules\/\*\*/.test(cfg)) {
    fail('next.config must not use broad **/node_modules/** tracing includes');
  }
  ok('source strategy is bundler-visible (no webpackIgnore / no pdfjs external)');
}

function assertBuiltArtifactContainsWorker() {
  if (!existsSync(join(root, '.next/server'))) {
    fail(
      '.next/server missing — run a Node production next build first (static export flags disabled)'
    );
  }
  if (!existsSync(REINGEST_NFT) || !existsSync(REINGEST_ROUTE)) {
    fail(`reingest build artifacts missing: ${REINGEST_NFT}`);
  }

  const nft = JSON.parse(readFileSync(REINGEST_NFT, 'utf8'));
  const files = nft.files || [];
  const workerInNft = files.some(
    (f) =>
      String(f).includes('pdf.worker.min.mjs') ||
      String(f).includes('pdf.worker.mjs') ||
      /pdfjs-dist.*worker/i.test(String(f))
  );

  const serverFiles = walkFiles(join(root, '.next/server'));
  let workerInlined = false;
  for (const file of serverFiles) {
    if (!/\.(js|mjs|cjs)$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    if (
      /webpackIgnore:\s*!0|webpackIgnore:\s*true/.test(src) &&
      /pdf\.worker\.min\.mjs/.test(src)
    ) {
      fail(`built server still has webpackIgnore worker import: ${file}`);
    }
    if (/pathToFileURL\s*\(\s*\d+\s*\)/.test(src)) {
      fail(`built server still has pathToFileURL(number): ${file}`);
    }
    if (
      /WorkerMessageHandler/.test(src) &&
      (/pdf\.worker\.min/.test(src) ||
        /primePdfjsNodeWorkerOnGlobalThis|pdfjs-node-worker/.test(src))
    ) {
      workerInlined = true;
    }
  }

  if (!workerInNft && !workerInlined) {
    fail(
      `deployable reingest artifact cannot resolve worker: NFT missing ${WORKER_SPEC} and no inlined WorkerMessageHandler chunk found`
    );
  }

  if (workerInNft) {
    const sample = files
      .filter((f) => /worker/i.test(String(f)) && /pdfjs|pdf\.worker/i.test(String(f)))
      .slice(0, 3);
    ok(`reingest NFT includes pdfjs worker file (${sample.join(', ') || 'match'})`);
  }
  if (workerInlined) {
    ok('server chunks include bundler-visible pdfjs worker / prime helper');
  }

  if (!existsSync(join(root, WORKER_REL))) {
    fail(`workspace missing ${WORKER_REL}`);
  }
  ok(`workspace resolves ${WORKER_SPEC}`);
}

/**
 * Stage a minimal deployable graph with the statically imported worker and
 * confirm getDocument extracts >=1 page (same strategy as production).
 */
function assertExtractionAgainstDeployableGraph() {
  const staging = mkdtempSync(join(tmpdir(), 'pdfjs-nft-'));
  try {
    const workerDest = join(staging, WORKER_REL);
    const pdfDest = join(staging, PDF_REL);
    mkdirSync(dirname(workerDest), { recursive: true });
    copyFileSync(join(root, WORKER_REL), workerDest);
    copyFileSync(join(root, PDF_REL), pdfDest);
    copyFileSync(
      join(root, 'node_modules/pdfjs-dist/package.json'),
      join(staging, 'node_modules/pdfjs-dist/package.json')
    );

    // If NFT listed the worker, also copy those paths for extra fidelity.
    const nft = JSON.parse(readFileSync(REINGEST_NFT, 'utf8'));
    const serverRoot = dirname(REINGEST_ROUTE);
    for (const rel of nft.files || []) {
      if (!/pdfjs|pdf\.worker/i.test(String(rel))) continue;
      const abs = join(serverRoot, rel);
      if (!existsSync(abs)) continue;
      const dest = join(staging, 'nft', rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(abs, dest);
    }

    const pdfPath = join(staging, 'sample.pdf');
    writeFileSync(pdfPath, minimalPdfBytes());
    const harness = join(staging, 'harness.mjs');
    writeFileSync(
      harness,
      `
import { readFileSync } from 'node:fs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

if (!pdfjsWorker?.WorkerMessageHandler) {
  console.error('WorkerMessageHandler missing from static worker import');
  process.exit(2);
}
globalThis.pdfjsWorker = pdfjsWorker;
pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';

const data = new Uint8Array(readFileSync(${JSON.stringify(pdfPath)}));
const doc = await pdfjs.getDocument({
  data,
  useSystemFonts: true,
  disableAutoFetch: true,
  disableStream: true,
}).promise;
const pages = doc.numPages;
await doc.destroy();
if (!(pages >= 1)) {
  console.error('expected >=1 page, got', pages);
  process.exit(3);
}
console.log('EXTRACT_PAGES=' + pages);
`
    );

    const result = spawnSync(process.execPath, [harness], {
      cwd: staging,
      env: {
        ...process.env,
        NODE_PATH: join(staging, 'node_modules'),
      },
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      fail(
        `deployable-graph extraction failed (status=${result.status}): ${result.stderr || result.stdout}`
      );
    }
    if (!/EXTRACT_PAGES=[1-9]/.test(result.stdout || '')) {
      fail(`extraction did not report pages: ${result.stdout}`);
    }
    ok(`extraction from deployable worker graph: ${(result.stdout || '').trim()}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

assertSourceStrategy();
assertBuiltArtifactContainsWorker();
assertExtractionAgainstDeployableGraph();
ok('all pdfjs worker build packaging checks passed');
