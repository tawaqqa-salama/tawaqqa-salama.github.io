'use client';

import { useState } from 'react';

interface FollowUpModalProps {
  clientName: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (data: { follow_up_date: string; contact_method: string; notes: string }) => void;
}

export default function FollowUpModal({ clientName, isOpen, isSubmitting, onClose, onSubmit }: FollowUpModalProps) {
  const [followUpDate, setFollowUpDate] = useState(new Date().toISOString().slice(0, 10));
  const [contactMethod, setContactMethod] = useState('اتصال هاتفي');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-1">متابعة تواصل</h2>
        <p className="text-sm text-gray-500 mb-4">{clientName}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1">تاريخ المتابعة</label>
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">طريقة التواصل</label>
            <select value={contactMethod} onChange={(e) => setContactMethod(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
              <option>اتصال هاتفي</option>
              <option>واتساب</option>
              <option>زيارة</option>
              <option>بريد إلكتروني</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">ملاحظات</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2.5 border rounded-xl text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">إلغاء</button>
          <button
            onClick={() => onSubmit({ follow_up_date: followUpDate, contact_method: contactMethod, notes })}
            disabled={isSubmitting}
            className="px-4 py-2 bg-[#635bdb] text-white rounded-xl text-sm disabled:opacity-50"
          >
            {isSubmitting ? 'جاري الحفظ...' : 'حفظ المتابعة'}
          </button>
        </div>
      </div>
    </div>
  );
}
