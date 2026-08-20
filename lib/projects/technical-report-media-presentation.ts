export type EvidenceMediaPresentationState = 'ready' | 'tiny' | 'unavailable' | 'unmeasured';

export type EvidenceMediaPresentation = {
  state: EvidenceMediaPresentationState;
  intrinsic_width: number | null;
  intrinsic_height: number | null;
  aspect_ratio: number | null;
};

const MIN_MEANINGFUL_MEDIA_DIMENSION = 32;
const MIN_MEANINGFUL_MEDIA_PIXELS = 4096;

function mediaStateForDimensions(width: number, height: number): EvidenceMediaPresentation {
  const valid = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  if (!valid) {
    return { state: 'unavailable', intrinsic_width: null, intrinsic_height: null, aspect_ratio: null };
  }
  const tiny = width < MIN_MEANINGFUL_MEDIA_DIMENSION ||
    height < MIN_MEANINGFUL_MEDIA_DIMENSION ||
    width * height < MIN_MEANINGFUL_MEDIA_PIXELS;
  return {
    state: tiny ? 'tiny' : 'ready',
    intrinsic_width: width,
    intrinsic_height: height,
    aspect_ratio: width / height,
  };
}

function dataUrlBytes(value: string): Uint8Array | null {
  const match = /^data:[^;,]+(?:;base64)?,([\s\S]*)$/i.exec(value);
  if (!match) return null;
  try {
    const encoded = match[1] || '';
    const base64 = /;base64,/i.test(value);
    if (base64) {
      if (typeof atob !== 'function') return null;
      return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    }
    return new TextEncoder().encode(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let cursor = 2;
  while (cursor + 9 < bytes.length) {
    if (bytes[cursor] !== 0xff) {
      cursor += 1;
      continue;
    }
    while (bytes[cursor] === 0xff) cursor += 1;
    const marker = bytes[cursor];
    cursor += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 1 >= bytes.length) return null;
    const length = (bytes[cursor] << 8) + bytes[cursor + 1];
    if (length < 2 || cursor + length > bytes.length) return null;
    if (sof.has(marker) && cursor + 6 < bytes.length) {
      return {
        height: (bytes[cursor + 3] << 8) + bytes[cursor + 4],
        width: (bytes[cursor + 5] << 8) + bytes[cursor + 6],
      };
    }
    cursor += length;
  }
  return null;
}

/**
 * Parses intrinsic raster dimensions from local data URLs. This does not inspect
 * image meaning; it only prevents clearly non-displayable media from being upscaled.
 */
export function inspectEvidenceMediaPresentation(
  src: string | null | undefined,
  mimeType?: string | null
): EvidenceMediaPresentation {
  if (!src) return { state: 'unavailable', intrinsic_width: null, intrinsic_height: null, aspect_ratio: null };
  if (!src.startsWith('data:')) {
    return { state: 'unmeasured', intrinsic_width: null, intrinsic_height: null, aspect_ratio: null };
  }
  const bytes = dataUrlBytes(src);
  if (!bytes) return { state: 'unavailable', intrinsic_width: null, intrinsic_height: null, aspect_ratio: null };
  const mime = String(mimeType || '').toLowerCase();
  const dimensions = mime === 'image/jpeg' ? jpegDimensions(bytes) : pngDimensions(bytes) || jpegDimensions(bytes);
  return dimensions
    ? mediaStateForDimensions(dimensions.width, dimensions.height)
    : { state: 'unavailable', intrinsic_width: null, intrinsic_height: null, aspect_ratio: null };
}

/** Browser-only probe for transient signed URLs after print hydration. */
export async function probeEvidenceMediaPresentation(
  src: string | null | undefined,
  mimeType?: string | null
): Promise<EvidenceMediaPresentation> {
  const initial = inspectEvidenceMediaPresentation(src, mimeType);
  if (initial.state !== 'unmeasured') return initial;
  if (typeof Image === 'undefined' || !src) return initial;

  return new Promise((resolve) => {
    const image = new Image();
    const finish = (result: EvidenceMediaPresentation) => {
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    image.onload = () => finish(mediaStateForDimensions(image.naturalWidth, image.naturalHeight));
    image.onerror = () => finish({ state: 'unavailable', intrinsic_width: null, intrinsic_height: null, aspect_ratio: null });
    image.src = src;
  });
}

export function canRenderEvidenceMedia(presentation: EvidenceMediaPresentation | null | undefined): boolean {
  return presentation?.state === 'ready';
}

export const EVIDENCE_MEDIA_FALLBACK_AR = 'المرفق متاح ضمن أدلة المشروع ولا تتوفر له معاينة قابلة للعرض في التقرير.';
