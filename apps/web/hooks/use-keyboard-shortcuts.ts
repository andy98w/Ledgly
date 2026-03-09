'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommandPaletteStore } from '@/lib/stores/command-palette';

const SEQUENCE_TIMEOUT = 300;

const GO_SHORTCUTS: Record<string, string> = {
  d: '/dashboard',
  m: '/members',
  c: '/charges',
  p: '/payments',
  e: '/expenses',
  r: '/payments?tab=review',
  s: '/spreadsheet',
  a: '/audit',
};

function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // cmdk input
  if (target.getAttribute('cmdk-input') !== null) return true;
  return false;
}

export function useKeyboardShortcuts() {
  const router = useRouter();
  const openPalette = useCommandPaletteStore((s) => s.open);
  const [showHelp, setShowHelp] = useState(false);
  const pendingKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    pendingKeyRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K is handled by command palette itself
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') return;

      // Ignore when typing in inputs
      if (isEditableTarget(e)) {
        clearPending();
        return;
      }

      // ? -> show shortcuts help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowHelp(true);
        clearPending();
        return;
      }

      // g + letter sequence
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!pendingKeyRef.current) {
          pendingKeyRef.current = 'g';
          timeoutRef.current = setTimeout(clearPending, SEQUENCE_TIMEOUT);
          return;
        }
      }

      if (pendingKeyRef.current === 'g') {
        const destination = GO_SHORTCUTS[e.key];
        if (destination) {
          e.preventDefault();
          router.push(destination);
        }
        clearPending();
        return;
      }

      clearPending();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [router, openPalette, clearPending]);

  return { showHelp, setShowHelp };
}
