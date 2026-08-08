'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sanitizeIntegerInput, sanitizeTextOnly } from '@/lib/validation/client';
import { LEAD_STATUSES } from '@/lib/constants/navigation';
import NumericInput from '@/components/ui/NumericInput';

export interface LeadFormData {
  owner_name: string;
  phone: string;
  business_name: string;
  lead_status: string;
  lead_notes: string;
  lead_source: string;
}

const LEAD_SOURCES = [
  'WhatsApp',
  'Website',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'TikTok',
  'X',
  'Google',
  'Phone',
  'Referral',
  'Campaign',
  'Other',
] as const;

const EMPTY_LEAD: LeadFormData = {
  owner_name: '',
  phone: '',
  business_name: '',
  lead_status: 'مهتم',
  lead_notes: '',
  lead_source: 'Phone',
};

interface AddLeadModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (data: LeadFormData) => Promise<void>;
}

export default function AddLeadModal({
  isOpen,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: AddLeadModalProps) {
  const [form, setForm] = useState<LeadFormData>(EMPTY_LEAD);

  useEffect(() => {
    if (!isOpen) setForm(EMPTY_LEAD);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^05\d{8}$/.test(sanitizeIntegerInput(form.phone))) {
      return;
    }
    await onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-bold text-gray-800 mb-4">تسجيل عميل مهتم (Lead)</h2>

        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            ⚠️ {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">اسم العميل</label>
            <input
              required
              value={form.owner_name}
              onChange={(e) => setForm((p) => ({ ...p, owner_name: sanitizeTextOnly(e.target.value) }))}
              className="w-full p-2.5 border rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">رقم الجوال</label>
            <NumericInput
              required
              maxLength={10}
              value={form.phone}
              onChange={(phone) => setForm((p) => ({ ...p, phone }))}
              className="w-full p-2.5 border rounded-xl text-sm dir-ltr text-right"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">اسم النشاط / المنشأة</label>
            <input
              value={form.business_name}
              onChange={(e) => setForm((p) => ({ ...p, business_name: e.target.value }))}
              className="w-full p-2.5 border rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">حالة الاهتمام</label>
            <select
              value={form.lead_status}
              onChange={(e) => setForm((p) => ({ ...p, lead_status: e.target.value }))}
              className="w-full p-2.5 border rounded-xl text-sm bg-white"
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">المصدر</label>
            <select
              value={form.lead_source}
              onChange={(e) => setForm((p) => ({ ...p, lead_source: e.target.value }))}
              className="w-full p-2.5 border rounded-xl text-sm bg-white"
            >
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات</label>
            <textarea
              rows={3}
              value={form.lead_notes}
              onChange={(e) => setForm((p) => ({ ...p, lead_notes: e.target.value }))}
              className="w-full p-2.5 border rounded-xl text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
