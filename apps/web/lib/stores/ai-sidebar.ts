import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AISidebarState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useAISidebarStore = create<AISidebarState>()(
  persist(
    (set) => ({
      isOpen: false,
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
    }),
    { name: 'ledgly-ai-sidebar' },
  ),
);
