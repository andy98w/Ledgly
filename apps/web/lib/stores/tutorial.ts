import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TutorialState {
  isActive: boolean;
  currentStep: number;
  hasSeenTutorial: boolean;
  start: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  goTo: (step: number) => void;
  markComplete: () => void;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set) => ({
      isActive: false,
      currentStep: 0,
      hasSeenTutorial: false,
      start: () => set({ isActive: true, currentStep: 0 }),
      stop: () => set({ isActive: false, currentStep: 0 }),
      next: () => set((state) => ({ currentStep: state.currentStep + 1 })),
      prev: () => set((state) => ({ currentStep: Math.max(0, state.currentStep - 1) })),
      goTo: (step) => set({ currentStep: step }),
      markComplete: () => set({ isActive: false, currentStep: 0, hasSeenTutorial: true }),
    }),
    {
      name: 'ledgly-tutorial',
      partialize: (state) => ({
        hasSeenTutorial: state.hasSeenTutorial,
      }),
    },
  ),
);
