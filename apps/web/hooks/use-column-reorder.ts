import { useState, useCallback } from 'react';

interface UseColumnReorderOptions {
  onReorder: (fromId: string, toId: string) => void;
  frozenColumns?: string[];
}

export function useColumnReorder({ onReorder, frozenColumns = [] }: UseColumnReorderOptions) {
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const onDragStart = useCallback((columnId: string, e: React.DragEvent) => {
    if (frozenColumns.includes(columnId)) {
      e.preventDefault();
      return;
    }
    setDragColumnId(columnId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
  }, [frozenColumns]);

  const onDragOver = useCallback((columnId: string, e: React.DragEvent) => {
    if (frozenColumns.includes(columnId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(columnId);
  }, [frozenColumns]);

  const onDragLeave = useCallback(() => {
    setDropTargetId(null);
  }, []);

  const onDrop = useCallback((targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/plain');
    setDragColumnId(null);
    setDropTargetId(null);
    if (fromId && fromId !== targetId && !frozenColumns.includes(targetId)) {
      onReorder(fromId, targetId);
    }
  }, [onReorder, frozenColumns]);

  const onDragEnd = useCallback(() => {
    setDragColumnId(null);
    setDropTargetId(null);
  }, []);

  return {
    dragColumnId,
    dropTargetId,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  };
}
