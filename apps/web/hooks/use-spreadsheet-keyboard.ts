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
  selectedRowIds: Set<string>;
  setSelectedRowIds?: (ids: Set<string>) => void;
  visibleColumns: string[];
  isAdmin: boolean;
  getCellValue: (rowId: string, column: string) => string;
  onSaveCell: (rowId: string, column: string, value: string) => void;
  onDeleteRows?: (rowIds: string[]) => void;
}

export function useSpreadsheetKeyboard({
  activeCell,
  setActiveCell,
  editingCell,
  setEditingCell,
  rowIds,
  selectedRowIds,
  setSelectedRowIds,
  visibleColumns,
  isAdmin,
  getCellValue,
  onSaveCell,
  onDeleteRows,
}: UseSpreadsheetKeyboardOptions) {
  const handleCopy = useCallback(() => {
    if (selectedRowIds.size > 1) {
      const lines = rowIds
        .filter(id => selectedRowIds.has(id))
        .map(id => visibleColumns.map(col => getCellValue(id, col)).join('\t'));
      navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
      return;
    }
    if (!activeCell) return;
    const value = getCellValue(activeCell.rowId, activeCell.column);
    if (value && value !== '-') {
      navigator.clipboard.writeText(value).catch(() => {});
    }
  }, [activeCell, selectedRowIds, rowIds, visibleColumns, getCellValue]);

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
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const metaKey = e.metaKey || e.ctrlKey;

      // Ctrl+C — copy
      if (metaKey && e.key === 'c') {
        if (selectedRowIds.size > 1 || activeCell) {
          e.preventDefault();
          handleCopy();
        }
        return;
      }

      if (!activeCell) {
        // Ctrl+A — select all
        if (metaKey && e.key === 'a' && setSelectedRowIds) {
          e.preventDefault();
          setSelectedRowIds(new Set(rowIds));
          return;
        }
        return;
      }

      const rowIdx = rowIds.indexOf(activeCell.rowId);
      const colIdx = visibleColumns.indexOf(activeCell.column);
      if (rowIdx === -1 || colIdx === -1) return;

      // Ctrl+V — paste
      if (metaKey && e.key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Ctrl+A — select all
      if (metaKey && e.key === 'a' && setSelectedRowIds) {
        e.preventDefault();
        setSelectedRowIds(new Set(rowIds));
        return;
      }

      // Ctrl+D — fill down (copy cell above)
      if (metaKey && e.key === 'd' && isAdmin) {
        e.preventDefault();
        if (rowIdx > 0) {
          const aboveValue = getCellValue(rowIds[rowIdx - 1], activeCell.column);
          if (aboveValue && aboveValue !== '-') {
            onSaveCell(activeCell.rowId, activeCell.column, aboveValue);
          }
        }
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
        case 'Enter':
        case 'F2': {
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
        case 'Delete':
        case 'Backspace': {
          if (isAdmin) {
            e.preventDefault();
            onSaveCell(activeCell.rowId, activeCell.column, '');
          }
          break;
        }
        case 'Tab': {
          e.preventDefault();
          if (e.shiftKey) {
            const prevCol = colIdx - 1 >= 0 ? colIdx - 1 : visibleColumns.length - 1;
            const prevRow = prevCol === visibleColumns.length - 1 && rowIdx > 0 ? rowIdx - 1 : rowIdx;
            setActiveCell({ rowId: rowIds[prevRow], column: visibleColumns[prevCol] });
          } else {
            const nextCol = colIdx + 1 < visibleColumns.length ? colIdx + 1 : 0;
            const nextRow = nextCol === 0 && rowIdx + 1 < rowIds.length ? rowIdx + 1 : rowIdx;
            setActiveCell({ rowId: rowIds[nextRow], column: visibleColumns[nextCol] });
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCell, editingCell, rowIds, selectedRowIds, visibleColumns, isAdmin, setActiveCell, setEditingCell, setSelectedRowIds, handleCopy, handlePaste, getCellValue, onSaveCell]);
}
