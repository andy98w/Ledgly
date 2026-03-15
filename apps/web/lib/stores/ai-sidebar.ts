import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SIDEBAR_MIN_WIDTH = 320;
export const SIDEBAR_MAX_WIDTH = 600;
export const SIDEBAR_DEFAULT_WIDTH = 400;

interface AISidebarState {
  isOpen: boolean;
  width: number;
  pendingMessage: string | null;
  open: (message?: string) => void;
  close: () => void;
  toggle: () => void;
  setWidth: (w: number) => void;
  consumePendingMessage: () => string | null;
}

export const useAISidebarStore = create<AISidebarState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      width: SIDEBAR_DEFAULT_WIDTH,
      pendingMessage: null,
      open: (message?: string) => set({ isOpen: true, pendingMessage: message || null }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setWidth: (w: number) => set({ width: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w)) }),
      consumePendingMessage: () => {
        const msg = get().pendingMessage;
        if (msg) set({ pendingMessage: null });
        return msg;
      },
    }),
    { name: 'ledgly-ai-sidebar', partialize: (s) => ({ isOpen: s.isOpen, width: s.width }) },
  ),
);
