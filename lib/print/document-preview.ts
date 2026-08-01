export type DocumentPreviewPayload = {
  title: string;
  html: string;
  fileName?: string;
};

type Listener = (payload: DocumentPreviewPayload | null) => void;

let listener: Listener | null = null;

export function registerDocumentPreviewListener(next: Listener) {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

function trackPrint(payload: DocumentPreviewPayload) {
  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'PRINT',
      details: `طباعة / معاينة مستند: ${payload.title}`,
      metadata: { fileName: payload.fileName || null, title: payload.title },
    })
  );
}

export function openDocumentPreview(payload: DocumentPreviewPayload) {
  trackPrint(payload);
  if (listener) {
    listener(payload);
    return;
  }
  // Fallback إن لم تُحمَّل واجهة المعاينة بعد
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(payload.html);
  w.document.close();
}

export function closeDocumentPreview() {
  listener?.(null);
}

export function downloadHtmlDocument(html: string, fileName: string) {
  void import('@/lib/activity/logger').then(({ logActivity }) =>
    logActivity({
      actionType: 'EXPORT',
      details: `تصدير مستند: ${fileName}`,
      metadata: { fileName },
    })
  );
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
