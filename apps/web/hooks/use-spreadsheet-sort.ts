import { useState, useCallback } from 'react';

export interface SortSpec {
  key: string;
  direction: 'asc' | 'desc';
}

export function useSpreadsheetSort() {
  const [sortSpecs, setSortSpecs] = useState<SortSpec[]>([
    { key: 'date', direction: 'desc' },
  ]);

  const toggleSort = useCallback((key: string, isShift: boolean) => {
    setSortSpecs(prev => {
      if (!isShift) {
        const existing = prev.length === 1 && prev[0].key === key;
        if (existing) {
          return [{ key, direction: prev[0].direction === 'asc' ? 'desc' : 'asc' }];
        }
        return [{ key, direction: 'asc' }];
      }
      const idx = prev.findIndex(s => s.key === key);
      if (idx !== -1) {
        const updated = [...prev];
        if (updated[idx].direction === 'asc') {
          updated[idx] = { key, direction: 'desc' };
        } else {
          updated.splice(idx, 1);
        }
        return updated.length > 0 ? updated : [{ key: 'date', direction: 'desc' }];
      }
      if (prev.length >= 3) return prev;
      return [...prev, { key, direction: 'asc' }];
    });
  }, []);

  const getSortIndex = useCallback((key: string) => {
    const idx = sortSpecs.findIndex(s => s.key === key);
    return idx === -1 ? null : idx;
  }, [sortSpecs]);

  const getSortDirection = useCallback((key: string) => {
    return sortSpecs.find(s => s.key === key)?.direction ?? null;
  }, [sortSpecs]);

  return { sortSpecs, toggleSort, getSortIndex, getSortDirection };
}
