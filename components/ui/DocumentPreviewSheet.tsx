'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  closeDocumentPreview,
  downloadHtmlDocument,
  registerDocumentPreviewListener,
  type DocumentPreviewPayload,
} from '@/lib/print/document-preview';

export default function DocumentPreviewSheet() {
  const [payload, setPayload] = useState<DocumentPreviewPayload | null>(null);
  const [mobileFit, setMobileFit] = useState(true);

  useEffect(() => registerDocumentPreviewListener(setPayload), []);

  useEffect(() => {
    if (!payload) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [payload]);

  const srcDoc = useMemo(() => {
    if (!payload) return '';
    if (!mobileFit) return payload.html;
    // حقن ستايل ملاءمة الشاشة للمعاينة على الجوال دون تغيير ملف الطباعة الأصلي
    return payload.html.replace(
      '</head>',
      `<style id="mobile-fit">
        @media screen {
          html, body { width: 100% !important; max-width: 100vw !important; overflow-x: hidden !important; }
          .sheet, .page, .cover-letter-page, body > div {
            width: 100% !important; max-width: 100% !important;
            min-height: auto !important; max-height: none !important;
          }
          table.meta { display: table !important; width: 100% !important; }
          table.meta td.k { white-space: normal !important; }
          .grid, .party-grid, .footer-grid, .meta-grid, .signs {
            grid-template-columns: 1fr !important;
          }
          .cover-letter-page .header { grid-template-columns: 1fr !important; }
          .cover-letter-page .signatures { grid-template-columns: 1fr !important; }
          .doc-title { font-size: 20px !important; }
        }
      </style></head>`
    );
  }, [payload, mobileFit]);

  if (!payload) return null;

  const printNow = () => {
    // about:blank avoids leaking the app URL into browser print headers/footers
    const w = window.open('about:blank', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!w) {
      alert('تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة.');
      return;
    }
    w.document.open();
    w.document.write(payload.html);
    w.document.close();
    // Short/blank title further reduces Chrome/Edge print header noise
    try {
      w.document.title = ' ';
    } catch {
      /* ignore */
    }
    const trigger = () => {
      w.focus();
      w.print();
    };
    // Wait briefly for fonts/images before print dialog
    if (w.document.fonts?.ready) {
      void w.document.fonts.ready.then(() => setTimeout(trigger, 120));
    } else {
      setTimeout(trigger, 350);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/50" role="dialog" aria-modal="true">
      <div className="bg-white border-b px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{payload.title}</p>
          <p className="text-[11px] text-gray-500">معاينة قبل الطباعة / التحميل</p>
        </div>
        <button
          type="button"
          onClick={() => closeDocumentPreview()}
          className="touch-target rounded-xl border px-3 text-sm font-semibold"
          aria-label="إغلاق"
        >
          إغلاق
        </button>
      </div>

      <div className="flex-1 min-h-0 bg-slate-100 p-2 pb-24 overflow-hidden">
        <iframe
          title={payload.title}
          srcDoc={srcDoc}
          className={`w-full h-full rounded-xl border bg-white ${mobileFit ? 'mobile-preview-frame' : ''}`}
        />
      </div>

      <div className="document-preview-sticky">
        <button
          type="button"
          onClick={() => setMobileFit((v) => !v)}
          className={`touch-target flex-1 rounded-xl text-sm font-semibold border ${
            mobileFit ? 'bg-[#1f4d3a] text-white border-[#1f4d3a]' : 'bg-white text-gray-700'
          }`}
        >
          {mobileFit ? 'معاينة الجوال ✓' : 'معاينة الجوال'}
        </button>
        <button
          type="button"
          onClick={() =>
            downloadHtmlDocument(payload.html, payload.fileName || payload.title || 'document')
          }
          className="touch-target flex-1 rounded-xl bg-slate-800 text-white text-sm font-semibold"
        >
          تحميل
        </button>
        <button
          type="button"
          onClick={printNow}
          className="touch-target flex-1 rounded-xl bg-blue-600 text-white text-sm font-semibold"
        >
          طباعة
        </button>
      </div>
    </div>
  );
}
