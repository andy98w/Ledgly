'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface UseDragFillOptions {
  rowIds: string[];
  getCellValue: (rowId: string, column: string) => string;
  onFill: (rowId: string, column: string, value: string) => void;
}

export function useDragFill({ rowIds, getCellValue, onFill }: UseDragFillOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [sourceCell, setSourceCell] = useState<{ rowId: string; column: string } | null>(null);
  const [fillRange, setFillRange] = useState<string[]>([]);
  const dragRef = useRef({ isDragging: false, sourceRowIdx: -1, column: '' });

  const startFill = useCallback((rowId: string, column: string) => {
    const rowIdx = rowIds.indexOf(rowId);
    if (rowIdx === -1) return;
    setSourceCell({ rowId, column });
    setIsDragging(true);
    setFillRange([]);
    dragRef.current = { isDragging: true, sourceRowIdx: rowIdx, column };
  }, [rowIds]);

  const onMouseMove = useCallback((targetRowId: string) => {
    if (!dragRef.current.isDragging) return;
    const targetIdx = rowIds.indexOf(targetRowId);
    const sourceIdx = dragRef.current.sourceRowIdx;
    if (targetIdx === -1 || targetIdx <= sourceIdx) return;

    const range: string[] = [];
    for (let i = sourceIdx + 1; i <= targetIdx; i++) {
      range.push(rowIds[i]);
    }
    setFillRange(range);
  }, [rowIds]);

  const endFill = useCallback(() => {
    if (!dragRef.current.isDragging || !sourceCell) {
      setIsDragging(false);
      setFillRange([]);
      dragRef.current.isDragging = false;
      return;
    }

    const value = getCellValue(sourceCell.rowId, sourceCell.column);
    for (const rowId of fillRange) {
      onFill(rowId, sourceCell.column, value);
    }

    setIsDragging(false);
    setSourceCell(null);
    setFillRange([]);
    dragRef.current.isDragging = false;
  }, [sourceCell, fillRange, getCellValue, onFill]);

  useEffect(() => {
    if (!isDragging) return;
    const handler = () => endFill();
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, [isDragging, endFill]);

  return {
    isDragging,
    fillRange: new Set(fillRange),
    fillColumn: sourceCell?.column || null,
    startFill,
    onMouseMove,
    endFill,
  };
}
