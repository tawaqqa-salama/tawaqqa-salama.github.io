'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildAccountTree, fetchAccounts } from '@/lib/business/accounting-service';
import AccountTree from '@/components/finance/AccountTree';
import PageHeader from '@/components/shared/PageHeader';
import { ACCOUNT_TYPES } from '@/lib/constants/accounting';
import type { ChartOfAccount } from '@/lib/types/accounting';
import type { AccountTypeId } from '@/lib/constants/accounting';

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [parent, setParent] = useState<ChartOfAccount | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountTypeId>('asset');
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchAccounts()
      .then(setAccounts)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openAddChild = (node: ChartOfAccount) => {
    setParent(node);
    setAccountType(node.account_type);
    setCode('');
    setName('');
    setShowForm(true);
    setError(null);
  };

  const handleCreate = async () => {
    if (!code.trim() || !name.trim()) {
      setError('يرجى إدخال رمز واسم الحساب.');
      return;
    }

    const { error: insertError } = await supabase.from('chart_of_accounts').insert({
      code: code.trim(),
      name: name.trim(),
      account_type: accountType,
      parent_id: parent?.id || null,
      is_active: true,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setShowForm(false);
    setParent(null);
    load();
  };

  const tree = buildAccountTree(accounts);

  return (
    <div>
      <PageHeader
        title="دليل الحسابات"
        description="شجرة الحسابات — الأصول، الخصوم، حقوق الملكية، الإيرادات، المصروفات"
        action={
          <button
            onClick={() => {
              setParent(null);
              setShowForm(true);
              setError(null);
            }}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold"
          >
            + حساب جديد
          </button>
        }
      />

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : (
        <AccountTree tree={tree} onAddChild={openAddChild} />
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">
              {parent ? `إضافة حساب فرعي تحت ${parent.code}` : 'إضافة حساب جديد'}
            </h3>
            {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
            <div className="space-y-3">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="رمز الحساب" className="w-full p-2.5 border rounded-xl text-sm font-mono" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الحساب" className="w-full p-2.5 border rounded-xl text-sm" />
              {!parent && (
                <select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountTypeId)} className="w-full p-2.5 border rounded-xl text-sm bg-white">
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">إلغاء</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm">حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
