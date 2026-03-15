import { useState, useCallback, useMemo } from 'react';

export type ColumnFilter =
  | { type: 'text'; value: string }
  | { type: 'select'; values: string[] }
  | { type: 'range'; min?: number; max?: number };

export function useColumnFilters() {
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({});

  const setFilter = useCallback((columnId: string, filter: ColumnFilter | null) => {
    setFilters(prev => {
      if (!filter) {
        const next = { ...prev };
        delete next[columnId];
        return next;
      }
      return { ...prev, [columnId]: filter };
    });
  }, []);

  const clearAll = useCallback(() => setFilters({}), []);

  const activeFilterCount = useMemo(() => Object.keys(filters).length, [filters]);

  const matchesFilters = useCallback((row: Record<string, any>) => {
    for (const [columnId, filter] of Object.entries(filters)) {
      if (filter.type === 'text') {
        const val = String(row[columnId] || '').toLowerCase();
        if (!val.includes(filter.value.toLowerCase())) return false;
      } else if (filter.type === 'select') {
        const val = String(row[columnId] || '');
        if (filter.values.length > 0 && !filter.values.includes(val)) return false;
      } else if (filter.type === 'range') {
        const val = Number(row[columnId] || 0);
        if (filter.min !== undefined && val < filter.min) return false;
        if (filter.max !== undefined && val > filter.max) return false;
      }
    }
    return true;
  }, [filters]);

  return { filters, setFilter, clearAll, activeFilterCount, matchesFilters };
}
