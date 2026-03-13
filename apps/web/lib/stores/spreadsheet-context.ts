import { create } from 'zustand';

export interface SpreadsheetRowContext {
  id: string;
  type: 'charge' | 'expense' | 'payment';
  description: string;
  member?: string;
  membershipId?: string;
  category: string;
  date: string;
  incomeCents: number;
  outstandingCents: number;
  expenseCents: number;
  status?: string;
  allocatedCents?: number;
  unallocatedCents?: number;
}

interface SpreadsheetContextState {
  selectedRows: SpreadsheetRowContext[];
  currentFilters: { type: string; search: string } | null;
  setSelectedRows: (rows: SpreadsheetRowContext[]) => void;
  setCurrentFilters: (filters: { type: string; search: string } | null) => void;
  clearContext: () => void;
}

export const useSpreadsheetContextStore = create<SpreadsheetContextState>()((set) => ({
  selectedRows: [],
  currentFilters: null,
  setSelectedRows: (rows) => set({ selectedRows: rows }),
  setCurrentFilters: (filters) => set({ currentFilters: filters }),
  clearContext: () => set({ selectedRows: [], currentFilters: null }),
}));
