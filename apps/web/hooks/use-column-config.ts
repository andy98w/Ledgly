import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

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
  isCustom?: boolean;
  customType?: 'text' | 'number';
}

export const COLUMN_DEFS: ColumnDef[] = [
  { id: 'date', label: 'Date', defaultWidth: 96, minWidth: 72, maxWidth: 160, align: 'left', sortKey: 'date', filterable: true, hideable: true, frozen: true },
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

export function useColumnConfig(customColumns?: Array<{ id: string; label: string; type: 'text' | 'number' }>) {
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

  const allDefs = useMemo(() => {
    const custom: ColumnDef[] = (customColumns || []).map(c => ({
      id: c.id,
      label: c.label,
      defaultWidth: 120,
      minWidth: 60,
      maxWidth: 300,
      align: c.type === 'number' ? 'right' as const : 'left' as const,
      sortKey: c.id,
      filterable: false,
      hideable: true,
      isCustom: true,
      customType: c.type,
    }));
    return [...COLUMN_DEFS, ...custom];
  }, [customColumns]);

  // Sync custom columns with order list: add new, remove stale
  // Skip when customColumns is undefined (still loading) to avoid wiping saved order
  const customColumnsLoaded = useRef(false);
  useEffect(() => {
    if (!customColumns) return;
    // On first load, mark as loaded but don't remove stale IDs
    // (the saved order may contain custom IDs that haven't loaded yet)
    if (!customColumnsLoaded.current && customColumns.length === 0) {
      customColumnsLoaded.current = true;
      return;
    }
    customColumnsLoaded.current = true;

    const customIds = customColumns.map(c => c.id);
    const builtinIds = COLUMN_DEFS.map(c => c.id);
    const validIds = new Set([...builtinIds, ...customIds]);

    const missing = customIds.filter(id => !state.order.includes(id));
    const stale = state.order.filter(id => !validIds.has(id));

    if (missing.length > 0 || stale.length > 0) {
      setState(prev => ({
        ...prev,
        order: [...prev.order.filter(id => validIds.has(id)), ...missing],
        hidden: prev.hidden.filter(id => validIds.has(id)),
      }));
    }
  }, [customColumns]);

  const allColumnIds = useMemo(() => new Set(allDefs.map(d => d.id)), [allDefs]);
  const visibleColumns = state.order.filter(id => !state.hidden.includes(id) && allColumnIds.has(id));

  const getColumnDef = useCallback((id: string) => allDefs.find(c => c.id === id)!, [allDefs]);

  const resizeColumn = useCallback((id: string, width: number) => {
    const def = allDefs.find(c => c.id === id);
    if (!def) return;
    const clamped = Math.max(def.minWidth, Math.min(def.maxWidth, width));
    setState(prev => ({ ...prev, widths: { ...prev.widths, [id]: clamped } }));
  }, [allDefs]);

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
    const def = allDefs.find(c => c.id === id);
    if (!def?.hideable) return;
    setState(prev => {
      const hidden = prev.hidden.includes(id)
        ? prev.hidden.filter(h => h !== id)
        : [...prev.hidden, id];
      return { ...prev, hidden };
    });
  }, [allDefs]);

  const resetColumns = useCallback(() => {
    const customIds = (customColumns || []).map(c => c.id);
    setState({
      order: [...defaultState.order, ...customIds],
      widths: defaultState.widths,
      hidden: [],
    });
  }, [customColumns]);

  const getWidth = useCallback((id: string) => state.widths[id] ?? allDefs.find(c => c.id === id)?.defaultWidth ?? 100, [state.widths, allDefs]);

  return {
    state,
    visibleColumns,
    allDefs,
    getColumnDef,
    getWidth,
    resizeColumn,
    reorderColumn,
    toggleVisibility,
    resetColumns,
  };
}
