import { useState, useCallback, useEffect, useRef } from 'react';

interface UseColumnResizeOptions {
  onResize: (columnId: string, width: number) => void;
}

export function useColumnResize({ onResize }: UseColumnResizeOptions) {
  const [resizing, setResizing] = useState<{ id: string; startX: number; startWidth: number } | null>(null);
  const resizingRef = useRef(resizing);
  resizingRef.current = resizing;

  const onResizeStart = useCallback((columnId: string, startWidth: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ id: columnId, startX: e.clientX, startWidth });
  }, []);

  useEffect(() => {
    if (!resizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      onResize(r.id, r.startWidth + delta);
    };

    const onMouseUp = () => setResizing(null);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizing, onResize]);

  return {
    resizingColumnId: resizing?.id ?? null,
    onResizeStart,
  };
}
