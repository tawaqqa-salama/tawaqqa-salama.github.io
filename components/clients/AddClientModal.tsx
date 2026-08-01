'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ACTIVITY_RULES,
  PROJECT_STATUSES,
  REGION_DATA,
} from '@/lib/constants/clients';
import { calcBuildingArea, calcFloorsCount } from '@/lib/business/floors';
import { validateClientForm, sanitizeTextOnly } from '@/lib/validation/client';
import FloorLevelsEditor from '@/components/clients/FloorLevelsEditor';
import ActivityRequirementsPanel from '@/components/clients/ActivityRequirementsPanel';
import NumericInput from '@/components/ui/NumericInput';
import { parseLocalizedNumber } from '@/lib/validation/numeric-input';
import type { ClientFormData, FloorLevel } from '@/lib/types/client';

const EMPTY_FORM: ClientFormData = {
  owner_name: '',
  phone: '',
  region: '',
  city: '',
  district: '',
  street: '',
  plot_number: '',
  national_address: '',
  business_name: '',
  activity_type: '',
  land_area: '',
  building_area: '',
  floors_count: '',
  project_status: '',
  floor_levels: [],
};

interface AddClientModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (formData: ClientFormData) => Promise<void>;
}

export default function AddClientModal({
  isOpen,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: AddClientModalProps) {
  const [formData, setFormData] = useState<ClientFormData>(EMPTY_FORM);
  const [floorLevels, setFloorLevels] = useState<FloorLevel[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setFormData(EMPTY_FORM);
      setFloorLevels([]);
      setLocalError(null);
      setAvailableCities([]);
      setAvailableDistricts([]);
    }
  }, [isOpen]);

  const activityRule = formData.activity_type ? ACTIVITY_RULES[formData.activity_type] : null;
  const computedFloors = useMemo(() => calcFloorsCount(floorLevels), [floorLevels]);
  const computedBuilding = useMemo(() => calcBuildingArea(floorLevels), [floorLevels]);

  if (!isOpen) return null;

  const handleRegionChange = (region: string) => {
    setFormData((prev) => ({ ...prev, region, city: '', district: '' }));
    setAvailableCities(region && REGION_DATA[region] ? Object.keys(REGION_DATA[region]) : []);
    setAvailableDistricts([]);
  };

  const handleCityChange = (city: string) => {
    setFormData((prev) => ({ ...prev, city, district: '' }));
    if (formData.region && city && REGION_DATA[formData.region]?.[city]) {
      setAvailableDistricts(REGION_DATA[formData.region][city]);
    } else {
      setAvailableDistricts([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ClientFormData = {
      ...formData,
      floors_count: String(computedFloors || ''),
      building_area: String(computedBuilding || ''),
      floor_levels: floorLevels,
    };
    const validationError = validateClientForm(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    await onSubmit(payload);
  };

  const displayError = localError || errorMessage;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto my-8">
        <h2 className="text-xl font-bold text-gray-800 mb-2">إضافة عميل ونشاط جديد</h2>
        <p className="text-xs text-gray-500 mb-6">* الحقول التي لا تحمل ملاحظة (اختياري) هي حقول إلزامية.</p>

        {displayError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
            ⚠️ {displayError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">اسم المالك</label>
              <input
                type="text"
                required
                value={formData.owner_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, owner_name: sanitizeTextOnly(e.target.value) }))}
                placeholder="الاسم الثلاثي (حروف فقط)"
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">رقم الجوال</label>
              <NumericInput
                required
                maxLength={10}
                value={formData.phone}
                onChange={(phone) => setFormData((prev) => ({ ...prev, phone }))}
                placeholder="05XXXXXXXX"
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dir-ltr text-right"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">المنطقة</label>
              <select
                required
                value={formData.region}
                onChange={(e) => handleRegionChange(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">اختر المنطقة...</option>
                {Object.keys(REGION_DATA).map((reg) => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">المدينة</label>
              <select
                required
                disabled={!formData.region}
                value={formData.city}
                onChange={(e) => handleCityChange(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-gray-100"
              >
                <option value="">اختر المدينة...</option>
                {availableCities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">الحي</label>
              <select
                required
                disabled={!formData.city}
                value={formData.district}
                onChange={(e) => setFormData((prev) => ({ ...prev, district: e.target.value }))}
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:bg-gray-100"
              >
                <option value="">اختر الحي...</option>
                {availableDistricts.map((dist) => (
                  <option key={dist} value={dist}>{dist}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">اسم الشارع</label>
              <input
                type="text"
                required
                value={formData.street}
                onChange={(e) => setFormData((prev) => ({ ...prev, street: e.target.value }))}
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                رقم قطعة الأرض <span className="text-gray-400 font-normal">(اختياري)</span>
              </label>
              <input
                type="text"
                value={formData.plot_number}
                onChange={(e) => setFormData((prev) => ({ ...prev, plot_number: e.target.value }))}
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              العنوان الوطني <span className="text-gray-400 font-normal">(اختياري)</span>
            </label>
            <input
              type="text"
              value={formData.national_address}
              onChange={(e) => setFormData((prev) => ({ ...prev, national_address: e.target.value }))}
              placeholder="مثال: JERA1234 — جدة"
              className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">اسم النشاط</label>
              <input
                type="text"
                required
                value={formData.business_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, business_name: e.target.value }))}
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">نوع النشاط</label>
              <select
                required
                value={formData.activity_type}
                onChange={(e) => setFormData((prev) => ({ ...prev, activity_type: e.target.value }))}
                className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">اختر نوع النشاط...</option>
                {Object.entries(ACTIVITY_RULES).map(([key, item]) => (
                  <option key={key} value={key}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">مساحة الأرض (م²)</label>
            <NumericInput
              required
              mode="decimal"
              value={formData.land_area}
              onChange={(land_area) => setFormData((prev) => ({ ...prev, land_area }))}
              className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <ActivityRequirementsPanel
            activityType={formData.activity_type}
            floorsCount={computedFloors}
            buildingArea={computedBuilding}
            landArea={parseLocalizedNumber(formData.land_area)}
          />

          <FloorLevelsEditor
            levels={floorLevels}
            onChange={setFloorLevels}
            maxFloors={activityRule?.maxFloors}
          />

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">حالة المشروع</label>
            <select
              required
              value={formData.project_status}
              onChange={(e) => setFormData((prev) => ({ ...prev, project_status: e.target.value }))}
              className="w-full p-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="">اختر حالة المشروع...</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? 'جاري التحقق والحفظ...' : 'حفظ العميل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
