'use client';

import { useEffect, useState } from 'react';

type Props = { customerId: string };

export default function WhatsAppCustomerActivity({ customerId }: Props) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      last_message_preview: string | null;
      last_message_at: string | null;
      status: string;
      assigned_user_id: string | null;
      unread_count: number;
    }>
  >([]);
  const [attachments, setAttachments] = useState<
    Array<{ id: string; file_name: string | null; media_type: string | null }>
  >([]);

  useEffect(() => {
    void (async () => {
      const list = await fetch('/api/integrations/whatsapp/conversations').then((r) => r.json());
      if (!list.ok) return;
      const mine = (list.conversations || []).filter(
        (c: { customer_id?: string; customer?: { id: string } }) =>
          c.customer_id === customerId || c.customer?.id === customerId
      );
      setRows(mine);
      if (mine[0]?.id) {
        const detail = await fetch(`/api/integrations/whatsapp/conversations/${mine[0].id}`).then(
          (r) => r.json()
        );
        if (detail.ok) setAttachments(detail.attachments || []);
      }
    })();
  }, [customerId]);

  return (
    <section className="rounded-xl border bg-white p-4 space-y-3" dir="rtl">
      <h3 className="text-sm font-bold text-gray-900">نشاط واتساب</h3>
      {!rows.length ? (
        <p className="text-xs text-gray-500">لا محادثات واتساب مرتبطة بهذا العميل.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border px-3 py-2">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{r.status}</span>
                <span dir="ltr" className="text-gray-400">
                  {r.last_message_at ? new Date(r.last_message_at).toLocaleString('ar-SA') : '—'}
                </span>
              </div>
              <p className="text-gray-600 mt-1">{r.last_message_preview || '—'}</p>
              <p className="text-gray-400 mt-1">
                غير مقروء: {r.unread_count} · المسؤول: {r.assigned_user_id || 'غير معيّن'}
              </p>
            </li>
          ))}
        </ul>
      )}
      {attachments.length ? (
        <div>
          <p className="font-semibold text-xs mb-1">المرفقات</p>
          <ul className="text-xs list-disc ps-4">
            {attachments.map((a) => (
              <li key={a.id}>
                {a.file_name || a.id} {a.media_type ? `(${a.media_type})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
