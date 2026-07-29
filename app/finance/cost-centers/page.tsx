'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchCostCenters } from '@/lib/business/accounting-service';
import PageHeader from '@/components/shared/PageHeader';
import type { CostCenter } from '@/lib/types/accounting';

export default function CostCentersPage() {
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [branch, setBranch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchCostCenters()
      .then(setCenters)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!code.trim() || !name.trim()) {
      setError('يرجى إدخال رمز واسم مركز التكلفة.');
      return;
    }

    const { error: insertError } = await supabase.from('cost_centers').insert({
      code: code.trim(),
      name: name.trim(),
      department: department.trim() || null,
      branch: branch.trim() || null,
      is_active: true,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setCode('');
    setName('');
    setDepartment('');
    setBranch('');
    setError(null);
    load();
  };

  return (
    <div>
      <PageHeader
        title="مراكز التكلفة"
        description="ربط القيود والسندات بفروع ومشاريع استشارية محددة"
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border shadow-sm p-5 xl:col-span-1">
          <h3 className="font-bold text-gray-800 mb-4">إضافة مركز تكلفة</h3>
          {error && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>}
          <div className="space-y-3">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CC-004" className="w-full p-2.5 border rounded-xl text-sm font-mono" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم مركز التكلفة" className="w-full p-2.5 border rounded-xl text-sm" />
            <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="القسم / الإدارة" className="w-full p-2.5 border rounded-xl text-sm" />
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="الفرع" className="w-full p-2.5 border rounded-xl text-sm" />
            <button onClick={handleCreate} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold">
              حفظ مركز التكلفة
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden xl:col-span-2">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 border-b text-gray-600">
              <tr>
                <th className="p-4">الرمز</th>
                <th className="p-4">الاسم</th>
                <th className="p-4">القسم</th>
                <th className="p-4">الفرع</th>
                <th className="p-4">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
              ) : centers.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد مراكز تكلفة</td></tr>
              ) : (
                centers.map((center) => (
                  <tr key={center.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 font-mono text-blue-600">{center.code}</td>
                    <td className="p-4 font-semibold">{center.name}</td>
                    <td className="p-4">{center.department || '—'}</td>
                    <td className="p-4">{center.branch || '—'}</td>
                    <td className="p-4">{center.is_active ? 'نشط' : 'موقوف'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
