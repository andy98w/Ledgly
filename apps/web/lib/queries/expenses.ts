import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PaginatedResponse } from '@ledgly/shared';

export interface Expense {
  id: string;
  orgId: string;
  category: string;
  title: string;
  description: string | null;
  amountCents: number;
  date: string;
  vendor: string | null;
  receiptUrl: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
  } | null;
}

export interface ExpenseSummary {
  totalCents: number;
  count: number;
  byCategory: Record<string, number>;
}

interface ExpenseFilters {
  category?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export function useExpenses(orgId: string | null, filters: ExpenseFilters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();

  return useQuery({
    queryKey: ['organizations', orgId, 'expenses', filters],
    queryFn: () =>
      api.get<PaginatedResponse<Expense>>(
        `/organizations/${orgId}/expenses${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: !!orgId,
  });
}

export function useExpense(orgId: string | null, expenseId: string | null) {
  return useQuery({
    queryKey: ['organizations', orgId, 'expenses', expenseId],
    queryFn: () => api.get<Expense>(`/organizations/${orgId}/expenses/${expenseId}`),
    enabled: !!orgId && !!expenseId,
  });
}

export function useExpenseSummary(orgId: string | null, startDate?: string, endDate?: string) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const queryString = params.toString();

  return useQuery({
    queryKey: ['organizations', orgId, 'expenses', 'summary', { startDate, endDate }],
    queryFn: () =>
      api.get<ExpenseSummary>(
        `/organizations/${orgId}/expenses/summary${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: !!orgId,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      data,
    }: {
      orgId: string;
      data: {
        category: string;
        title: string;
        description?: string;
        amountCents: number;
        date: string;
        vendor?: string;
        receiptUrl?: string;
      };
    }) => api.post(`/organizations/${orgId}/expenses`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'expenses'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      expenseId,
      data,
    }: {
      orgId: string;
      expenseId: string;
      data: {
        category?: string;
        title?: string;
        description?: string;
        amountCents?: number;
        date?: string;
        vendor?: string;
        receiptUrl?: string;
      };
    }) => api.patch(`/organizations/${orgId}/expenses/${expenseId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'expenses'],
      });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, expenseId }: { orgId: string; expenseId: string }) =>
      api.delete(`/organizations/${orgId}/expenses/${expenseId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'expenses'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}
