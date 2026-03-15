import { useState, useCallback, useEffect } from 'react';

export interface ColumnDef {
  id: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  align: 'left' | 'right';
  sortKey?: string;
  filterable: boolean;
  hideable: boolean;
  frozen?: boolean;
}

export const COLUMN_DEFS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultWidth: 96, minWidth: 72, maxWidth: 160, align: 'left', sortKey: 'date', filterable: true, hideable: false, frozen: true },
  { id: 'member', label: 'Member/Vendor', defaultWidth: 144, minWidth: 96, maxWidth: 300, align: 'left', sortKey: 'member', filterable: true, hideable: true },
  { id: 'category', label: 'Category', defaultWidth: 112, minWidth: 80, maxWidth: 200, align: 'left', sortKey: 'category', filterable: true, hideable: true },
  { id: 'description', label: 'Title', defaultWidth: 200, minWidth: 100, maxWidth: 600, align: 'left', filterable: true, hideable: false },
  { id: 'income', label: 'Income', defaultWidth: 96, minWidth: 72, maxWidth: 160, align: 'right', sortKey: 'income', filterable: true, hideable: true },
  { id: 'expense', label: 'Expense', defaultWidth: 96, minWidth: 72, maxWidth: 160, align: 'right', sortKey: 'expense', filterable: true, hideable: true },
];

interface ColumnState {
  order: string[];
  widths: Record<string, number>;
  hidden: string[];
}

const STORAGE_KEY = 'ledgly:spreadsheet:columns';

const defaultState: ColumnState = {
  order: COLUMN_DEFS.map(c => c.id),
  widths: Object.fromEntries(COLUMN_DEFS.map(c => [c.id, c.defaultWidth])),
  hidden: [],
};

export function useColumnConfig() {
  const [state, setState] = useState<ColumnState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...defaultState, ...JSON.parse(stored) };
    } catch {}
    return defaultState;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const visibleColumns = state.order.filter(id => !state.hidden.includes(id));

  const getColumnDef = useCallback((id: string) => COLUMN_DEFS.find(c => c.id === id)!, []);

  const resizeColumn = useCallback((id: string, width: number) => {
    const def = COLUMN_DEFS.find(c => c.id === id);
    if (!def) return;
    const clamped = Math.max(def.minWidth, Math.min(def.maxWidth, width));
    setState(prev => ({ ...prev, widths: { ...prev.widths, [id]: clamped } }));
  }, []);

  const reorderColumn = useCallback((fromId: string, toId: string) => {
    setState(prev => {
      const order = [...prev.order];
      const fromIdx = order.indexOf(fromId);
      const toIdx = order.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, fromId);
      return { ...prev, order };
    });
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    const def = COLUMN_DEFS.find(c => c.id === id);
    if (!def?.hideable) return;
    setState(prev => {
      const hidden = prev.hidden.includes(id)
        ? prev.hidden.filter(h => h !== id)
        : [...prev.hidden, id];
      return { ...prev, hidden };
    });
  }, []);

  const resetColumns = useCallback(() => setState(defaultState), []);

  const getWidth = useCallback((id: string) => state.widths[id] ?? COLUMN_DEFS.find(c => c.id === id)?.defaultWidth ?? 100, [state.widths]);

  return {
    state,
    visibleColumns,
    getColumnDef,
    getWidth,
    resizeColumn,
    reorderColumn,
    toggleVisibility,
    resetColumns,
  };
}
