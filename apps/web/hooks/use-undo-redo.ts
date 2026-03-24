'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

export interface UndoEntry {
  type:
    | 'cell_edit'
    | 'row_delete'
    | 'row_create'
    | 'column_add'
    | 'column_delete';
  rowId?: string;
  field?: string;
  oldValue?: any;
  newValue?: any;
  rowType?: 'charge' | 'expense' | 'payment';
  entityId?: string;
  columnId?: string;
  columnLabel?: string;
  columnType?: 'text' | 'number';
}

const MAX_STACK_SIZE = 50;

interface UseUndoRedoOptions {
  onUndo?: (entry: UndoEntry) => void;
  onRedo?: (entry: UndoEntry) => void;
}

export function useUndoRedo(options?: UseUndoRedoOptions) {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  const onUndoRef = useRef(options?.onUndo);
  const onRedoRef = useRef(options?.onRedo);
  onUndoRef.current = options?.onUndo;
  onRedoRef.current = options?.onRedo;

  const push = useCallback((entry: UndoEntry) => {
    setUndoStack((prev) => {
      const next = [...prev, entry];
      if (next.length > MAX_STACK_SIZE) next.shift();
      return next;
    });
    setRedoStack([]);
  }, []);

  const undo = useCallback((): UndoEntry | null => {
    let entry: UndoEntry | null = null;

    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      entry = next.pop()!;
      return next;
    });

    if (entry) {
      setRedoStack((prev) => {
        const next = [...prev, entry!];
        if (next.length > MAX_STACK_SIZE) next.shift();
        return next;
      });
    }

    return entry;
  }, []);

  const redo = useCallback((): UndoEntry | null => {
    let entry: UndoEntry | null = null;

    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      entry = next.pop()!;
      return next;
    });

    if (entry) {
      setUndoStack((prev) => {
        const next = [...prev, entry!];
        if (next.length > MAX_STACK_SIZE) next.shift();
        return next;
      });
    }

    return entry;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const metaKey = e.metaKey || e.ctrlKey;

      if (metaKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const entry = undo();
        if (entry) onUndoRef.current?.(entry);
        return;
      }

      if (
        (metaKey && e.key === 'y') ||
        (metaKey && e.shiftKey && e.key === 'z')
      ) {
        e.preventDefault();
        const entry = redo();
        if (entry) onRedoRef.current?.(entry);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return {
    push,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
