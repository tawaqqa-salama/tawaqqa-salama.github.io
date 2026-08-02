/**
 * يحوّل حمولة QR (Base64 TLV لـ ZATCA) إلى رابط صورة قابلة للعرض/الطباعة.
 * لا يعتمد على حزمة خارجية — يستخدم خدمة إنشاء QR عامة.
 */
export function zatcaQrImageUrl(qrBase64: string, size = 160): string {
  const payload = (qrBase64 || '').trim();
  if (!payload) return '';
  const dim = Math.max(80, Math.min(size, 320));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${dim}x${dim}&margin=8&data=${encodeURIComponent(payload)}`;
}

/** رابط بديل (Google Chart) إن تعطّل الأول */
export function zatcaQrImageUrlFallback(qrBase64: string, size = 160): string {
  const payload = (qrBase64 || '').trim();
  if (!payload) return '';
  const dim = Math.max(80, Math.min(size, 320));
  return `https://chart.googleapis.com/chart?cht=qr&chs=${dim}x${dim}&chl=${encodeURIComponent(payload)}`;
}
