'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getDateRangeForPreset, type DateRangePreset } from '@/lib/date/date-range';

type DateFilterContextValue = {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setDateRange: (from: string, to: string) => void;
  applyPreset: (preset: DateRangePreset) => void;
  clearRange: () => void;
};

const DateFilterContext = createContext<DateFilterContextValue | null>(null);

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const setDateRange = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const applyPreset = useCallback((preset: DateRangePreset) => {
    const { from, to } = getDateRangeForPreset(preset);
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const clearRange = useCallback(() => {
    setDateFrom('');
    setDateTo('');
  }, []);

  const value = useMemo(
    () => ({
      dateFrom,
      dateTo,
      setDateFrom,
      setDateTo,
      setDateRange,
      applyPreset,
      clearRange,
    }),
    [dateFrom, dateTo, setDateRange, applyPreset, clearRange]
  );

  return <DateFilterContext.Provider value={value}>{children}</DateFilterContext.Provider>;
}

export function useDateFilter() {
  const ctx = useContext(DateFilterContext);
  if (!ctx) {
    return {
      dateFrom: '',
      dateTo: '',
      setDateFrom: () => undefined,
      setDateTo: () => undefined,
      setDateRange: () => undefined,
      applyPreset: () => undefined,
      clearRange: () => undefined,
    };
  }
  return ctx;
}
