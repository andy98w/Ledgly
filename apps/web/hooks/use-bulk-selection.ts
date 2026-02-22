import { useState, useCallback, useMemo } from 'react';

export function useBulkSelection(allIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds),
    );
  }, [allIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const isAllSelected = useMemo(
    () => allIds.length > 0 && selected.size === allIds.length,
    [allIds, selected],
  );

  return { selected, toggle, toggleAll, clear, isAllSelected };
}
