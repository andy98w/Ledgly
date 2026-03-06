import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SIDEBAR_MIN_WIDTH = 320;
export const SIDEBAR_MAX_WIDTH = 600;
export const SIDEBAR_DEFAULT_WIDTH = 400;

interface AISidebarState {
  isOpen: boolean;
  width: number;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setWidth: (w: number) => void;
}

export const useAISidebarStore = create<AISidebarState>()(
  persist(
    (set) => ({
      isOpen: false,
      width: SIDEBAR_DEFAULT_WIDTH,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setWidth: (w: number) => set({ width: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w)) }),
    }),
    { name: 'ledgly-ai-sidebar' },
  ),
);
