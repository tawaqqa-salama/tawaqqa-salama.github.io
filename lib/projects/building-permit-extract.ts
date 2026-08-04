/**
 * Client/server helper: extract building permit fields from an uploaded file.
 * Prefers /api/ocr/building-permit (Vision when OPENAI_API_KEY is set),
 * falls back to local PDF text + regex parsing.
 */

import {
  emptyExtraction,
  extractTextFromPermitFile,
  hasUsefulPermitExtraction,
  parseBuildingPermitText,
  parsePermitFromFilename,
  type BuildingPermitExtraction,
} from '@/lib/projects/building-permit-ocr';

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function extractLocally(file: File): Promise<BuildingPermitExtraction> {
  const { text, source } = await extractTextFromPermitFile(file);
  const parsed = parseBuildingPermitText(text, source);
  if (hasUsefulPermitExtraction(parsed)) return parsed;
  return parsePermitFromFilename(file.name);
}

export async function extractBuildingPermitFromFile(file: File): Promise<BuildingPermitExtraction> {
  // Always try local PDF/text first (fast, offline)
  const local = await extractLocally(file);
  if (hasUsefulPermitExtraction(local) && local.source !== 'filename') {
    return local;
  }

  // Images / scanned PDFs → Vision API route when available
  try {
    const base64 = await fileToBase64(file);
    const res = await fetch('/api/ocr/building-permit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
        localText: local.rawTextPreview || '',
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        ok?: boolean;
        result?: BuildingPermitExtraction;
      };
      if (json.ok && json.result && hasUsefulPermitExtraction(json.result)) {
        return json.result;
      }
      if (json.ok && json.result) return json.result;
    }
  } catch {
    // fall through to local result
  }

  return hasUsefulPermitExtraction(local) ? local : emptyExtraction(local.source);
}
