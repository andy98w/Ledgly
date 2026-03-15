import { useEffect, useCallback } from 'react';

interface ActiveCell {
  rowId: string;
  column: string;
}

interface UseSpreadsheetKeyboardOptions {
  activeCell: ActiveCell | null;
  setActiveCell: (cell: ActiveCell | null) => void;
  editingCell: { rowId: string; column: string } | null;
  setEditingCell: (cell: { rowId: string; column: string } | null) => void;
  rowIds: string[];
  visibleColumns: string[];
  isAdmin: boolean;
  getCellValue: (rowId: string, column: string) => string;
  onSaveCell: (rowId: string, column: string, value: string) => void;
}

export function useSpreadsheetKeyboard({
  activeCell,
  setActiveCell,
  editingCell,
  setEditingCell,
  rowIds,
  visibleColumns,
  isAdmin,
  getCellValue,
  onSaveCell,
}: UseSpreadsheetKeyboardOptions) {
  const handleCopy = useCallback(() => {
    if (!activeCell) return;
    const value = getCellValue(activeCell.rowId, activeCell.column);
    if (value && value !== '-') {
      navigator.clipboard.writeText(value).catch(() => {});
    }
  }, [activeCell, getCellValue]);

  const handlePaste = useCallback(async () => {
    if (!activeCell || !isAdmin) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) onSaveCell(activeCell.rowId, activeCell.column, text.trim());
    } catch {}
  }, [activeCell, isAdmin, onSaveCell]);

  useEffect(() => {
    if (editingCell) return;

    const handler = (e: KeyboardEvent) => {
      if (!activeCell) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const rowIdx = rowIds.indexOf(activeCell.rowId);
      const colIdx = visibleColumns.indexOf(activeCell.column);
      if (rowIdx === -1 || colIdx === -1) return;

      const metaKey = e.metaKey || e.ctrlKey;

      if (metaKey && e.key === 'c') {
        e.preventDefault();
        handleCopy();
        return;
      }

      if (metaKey && e.key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault();
          const nextCol = colIdx + 1 < visibleColumns.length ? colIdx + 1 : colIdx;
          setActiveCell({ rowId: activeCell.rowId, column: visibleColumns[nextCol] });
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const prevCol = colIdx - 1 >= 0 ? colIdx - 1 : colIdx;
          setActiveCell({ rowId: activeCell.rowId, column: visibleColumns[prevCol] });
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const nextRow = rowIdx + 1 < rowIds.length ? rowIdx + 1 : rowIdx;
          setActiveCell({ rowId: rowIds[nextRow], column: activeCell.column });
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevRow = rowIdx - 1 >= 0 ? rowIdx - 1 : rowIdx;
          setActiveCell({ rowId: rowIds[prevRow], column: activeCell.column });
          break;
        }
        case 'Enter': {
          if (isAdmin) {
            e.preventDefault();
            setEditingCell({ rowId: activeCell.rowId, column: activeCell.column });
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setActiveCell(null);
          break;
        }
        case 'Home': {
          e.preventDefault();
          setActiveCell({ rowId: activeCell.rowId, column: visibleColumns[0] });
          break;
        }
        case 'End': {
          e.preventDefault();
          setActiveCell({ rowId: activeCell.rowId, column: visibleColumns[visibleColumns.length - 1] });
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCell, editingCell, rowIds, visibleColumns, isAdmin, setActiveCell, setEditingCell, handleCopy, handlePaste]);
}
