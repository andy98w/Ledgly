import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ChargeWithMember, PaginatedResponse, ChargeCategory } from '@ledgly/shared';

interface ChargeFilters {
  status?: string;
  category?: string;
  membershipId?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

export function useCharges(orgId: string | null, filters: ChargeFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.membershipId) params.set('membershipId', filters.membershipId);
  if (filters.overdue !== undefined) params.set('overdue', String(filters.overdue));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();

  return useQuery({
    queryKey: queryKeys.charges.list(orgId, filters),
    queryFn: () =>
      api.get<PaginatedResponse<ChargeWithMember>>(
        `/organizations/${orgId}/charges${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: !!orgId,
  });
}

export function useCharge(orgId: string | null, chargeId: string | null) {
  return useQuery({
    queryKey: queryKeys.charges.detail(orgId, chargeId),
    queryFn: () => api.get(`/organizations/${orgId}/charges/${chargeId}`),
    enabled: !!orgId && !!chargeId,
  });
}

export function useCreateCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      data,
    }: {
      orgId: string;
      data: {
        membershipIds: string[];
        category: ChargeCategory;
        title: string;
        amountCents: number;
        dueDate?: string;
      };
    }) => api.post(`/organizations/${orgId}/charges`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(variables.orgId) });
    },
  });
}

export function useUpdateCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      chargeId,
      data,
    }: {
      orgId: string;
      chargeId: string;
      data: {
        title?: string;
        amountCents?: number;
        dueDate?: string | null;
        status?: string;
      };
    }) => api.patch(`/organizations/${orgId}/charges/${chargeId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(variables.orgId) });
      if (variables.data.amountCents !== undefined) {
        queryClient.invalidateQueries({ queryKey: queryKeys.members.all(variables.orgId) });
      }
    },
  });
}

export function useVoidCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, chargeId }: { orgId: string; chargeId: string }) =>
      api.delete(`/organizations/${orgId}/charges/${chargeId}`),
    // Optimistic update: remove from cached lists immediately
    onMutate: async ({ orgId, chargeId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.charges.all(orgId) });
      const previousQueries = queryClient.getQueriesData({ queryKey: queryKeys.charges.all(orgId) });

      queryClient.setQueriesData(
        { queryKey: queryKeys.charges.all(orgId) },
        (old: any) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.filter((c: any) => c.id !== chargeId),
          };
        },
      );

      return { previousQueries };
    },
    onError: (_err, { orgId }, context) => {
      // Rollback on error
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: (_, __, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(orgId) });
    },
  });
}

export function useBulkVoidCharges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, chargeIds }: { orgId: string; chargeIds: string[] }) =>
      api.post<{ success: boolean; voidedCount: number }>(
        `/organizations/${orgId}/charges/bulk-void`,
        { chargeIds },
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(variables.orgId) });
    },
  });
}

export function useBulkCreateCharges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      charges,
    }: {
      orgId: string;
      charges: Array<{
        membershipId: string;
        category: string;
        title: string;
        amountCents: number;
        dueDate?: string;
      }>;
    }) => api.post<any[]>(`/organizations/${orgId}/charges/bulk-create`, { charges }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(variables.orgId) });
    },
  });
}

export function useRestoreCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, chargeId }: { orgId: string; chargeId: string }) =>
      api.post(`/organizations/${orgId}/charges/${chargeId}/restore`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(variables.orgId) });
    },
  });
}
