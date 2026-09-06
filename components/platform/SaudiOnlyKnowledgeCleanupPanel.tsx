'use client';

/**
 * Platform Admin — one-time Saudi-only knowledge cleanup UI.
 * Does not execute anything on mount. Requires double confirmation + Bearer JWT.
 */

import { useCallback, useState } from 'react';
import { withBrowserAuthHeaders } from '@/lib/auth/browser-access-token';
import {
  SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE,
  SAUDI_ONLY_CLEANUP_EXPECTED_NFPA_CHUNKS,
  SAUDI_ONLY_CLEANUP_EXPECTED_SAUDI_CHUNKS,
} from '@/lib/design-intelligence/saudi-only-knowledge-cleanup';

type CleanupResponse = {
  ok?: boolean;
  alreadyCompleted?: boolean;
  messageAr?: string;
  error?: string;
  nfpaChunksDeleted?: number;
  nfpaStorageDeleted?: boolean;
  saudiChunksCorrected?: boolean;
  storageError?: string | null;
  verification?: {
    final_active_document_count?: number;
    final_active_chunk_count?: number;
    saudi_chunk_count?: number;
    active_nfpa_document_count?: number;
    active_non_saudi_document_count?: number;
    saudi_code?: string | null;
    saudi_edition?: string | null;
  };
};

export default function SaudiOnlyKnowledgeCleanupPanel() {
  const [step, setStep] = useState<'idle' | 'confirm1' | 'confirm2' | 'running' | 'done' | 'error'>(
    'idle'
  );
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CleanupResponse | null>(null);

  const runCleanup = useCallback(async () => {
    setError(null);
    setStep('running');
    try {
      const headers = await withBrowserAuthHeaders({ 'Content-Type': 'application/json' });
      if (!headers.Authorization) {
        setError('مطلوب تسجيل الدخول بجلسة Supabase (Bearer JWT)');
        setStep('error');
        return;
      }
      const res = await fetch('/api/platform/knowledge/saudi-only-cleanup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          confirm: true,
          confirmTwice: true,
          confirmPhrase: SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE,
        }),
      });
      const json = (await res.json()) as CleanupResponse;
      if (!res.ok || !json.ok) {
        setError(json.error || json.messageAr || `HTTP ${res.status}`);
        setResult(json);
        setStep('error');
        return;
      }
      setResult(json);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الطلب');
      setStep('error');
    }
  }, []);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3" dir="rtl">
      <div>
        <h2 className="font-bold text-sm text-slate-900">تنظيف قاعدة المعرفة</h2>
        <p className="text-xs text-slate-600 mt-1">
          عملية صيانة لمرة واحدة — منصة المسؤول فقط. لا يمكن التراجع بعد حذف ملف NFPA.
        </p>
      </div>

      <ul className="text-xs text-slate-700 space-y-1 list-disc pr-4">
        <li>سيتم حذف: NFPA 13-2025 — {SAUDI_ONLY_CLEANUP_EXPECTED_NFPA_CHUNKS} مقطع</li>
        <li>سيتم الإبقاء على: SBC 801 — {SAUDI_ONLY_CLEANUP_EXPECTED_SAUDI_CHUNKS} مقطع</li>
        <li>لا يمكن التراجع بعد حذف ملف NFPA</li>
      </ul>

      {step === 'idle' ? (
        <button
          type="button"
          className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white"
          onClick={() => setStep('confirm1')}
        >
          الإبقاء على الأكواد السعودية فقط
        </button>
      ) : null}

      {step === 'confirm1' ? (
        <div className="space-y-2 rounded-lg border bg-white p-3">
          <p className="text-sm font-medium text-rose-800">
            حذف المراجع غير السعودية والإبقاء على الكود السعودي فقط
          </p>
          <p className="text-xs text-slate-600">تأكيد أول: هل تريد المتابعة؟</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded bg-rose-700 text-white"
              onClick={() => setStep('confirm2')}
            >
              نعم، متابعة للتأكيد الثاني
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded border"
              onClick={() => setStep('idle')}
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : null}

      {step === 'confirm2' ? (
        <div className="space-y-2 rounded-lg border bg-white p-3">
          <p className="text-xs text-slate-700">
            تأكيد ثانٍ: اكتب العبارة التالية حرفياً ثم نفّذ:
          </p>
          <p className="text-xs font-mono bg-slate-100 rounded px-2 py-1">
            {SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE}
          </p>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="اكتب عبارة التأكيد"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={phrase.trim() !== SAUDI_ONLY_CLEANUP_CONFIRM_PHRASE}
              className="px-3 py-1.5 text-xs rounded bg-rose-800 text-white disabled:opacity-40"
              onClick={() => void runCleanup()}
            >
              تنفيذ التنظيف الآن
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded border"
              onClick={() => {
                setPhrase('');
                setStep('idle');
              }}
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : null}

      {step === 'running' ? <p className="text-sm text-slate-700">جاري تنفيذ التنظيف…</p> : null}

      {step === 'done' && result ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-1">
          <p className="text-sm font-semibold text-emerald-900">
            {result.messageAr || 'تم تنظيف قاعدة المعرفة بنجاح'}
          </p>
          {result.alreadyCompleted ? (
            <p className="text-xs text-emerald-800">العملية كانت مكتملة مسبقاً (idempotent).</p>
          ) : null}
          <ul className="text-xs text-emerald-900 space-y-0.5">
            <li>مستندات نشطة: {result.verification?.final_active_document_count ?? '—'}</li>
            <li>مقاطع نشطة: {result.verification?.final_active_chunk_count ?? '—'}</li>
            <li>مقاطع SBC: {result.verification?.saudi_chunk_count ?? '—'}</li>
            <li>
              كود/إصدار سعودي: {result.verification?.saudi_code}/
              {result.verification?.saudi_edition}
            </li>
            <li>NFPA المتبقية: {result.verification?.active_nfpa_document_count ?? '—'}</li>
            <li>
              غير سعودي المتبقي: {result.verification?.active_non_saudi_document_count ?? '—'}
            </li>
          </ul>
        </div>
      ) : null}

      {step === 'error' ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 space-y-2">
          <p className="text-sm text-rose-900">{error || 'فشل التنظيف'}</p>
          {result?.storageError ? (
            <p className="text-xs text-rose-800">Storage: {result.storageError}</p>
          ) : null}
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded border"
            onClick={() => {
              setError(null);
              setResult(null);
              setPhrase('');
              setStep('idle');
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : null}
    </div>
  );
}
