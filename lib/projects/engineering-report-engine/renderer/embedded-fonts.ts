import {
  NOTO_NASKH_ARABIC_BOLD_BASE64,
  NOTO_NASKH_ARABIC_REGULAR_BASE64,
} from '@/lib/projects/engineering-report-engine/renderer/embedded-font-data';

/**
 * Embed Noto Naskh Arabic so browser print-to-PDF embeds a shaping-capable
 * Arabic font with usable ToUnicode (fixes ا5/اZ isolate corruption and
 * improves copy/paste vs legacy system fonts).
 */
export function getEmbeddedArabicFontCss(): string {
  return `
@font-face {
  font-family: 'Noto Naskh Arabic';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(data:font/ttf;base64,${NOTO_NASKH_ARABIC_REGULAR_BASE64}) format('truetype');
}
@font-face {
  font-family: 'Noto Naskh Arabic';
  font-style: normal;
  font-weight: 500;
  font-display: block;
  src: url(data:font/ttf;base64,${NOTO_NASKH_ARABIC_REGULAR_BASE64}) format('truetype');
}
@font-face {
  font-family: 'Noto Naskh Arabic';
  font-style: normal;
  font-weight: 600;
  font-display: block;
  src: url(data:font/ttf;base64,${NOTO_NASKH_ARABIC_BOLD_BASE64}) format('truetype');
}
@font-face {
  font-family: 'Noto Naskh Arabic';
  font-style: normal;
  font-weight: 700;
  font-display: block;
  src: url(data:font/ttf;base64,${NOTO_NASKH_ARABIC_BOLD_BASE64}) format('truetype');
}
@font-face {
  font-family: 'Noto Naskh Arabic';
  font-style: normal;
  font-weight: 800;
  font-display: block;
  src: url(data:font/ttf;base64,${NOTO_NASKH_ARABIC_BOLD_BASE64}) format('truetype');
}
@font-face {
  font-family: 'Noto Naskh Arabic';
  font-style: normal;
  font-weight: 900;
  font-display: block;
  src: url(data:font/ttf;base64,${NOTO_NASKH_ARABIC_BOLD_BASE64}) format('truetype');
}
`;
}
