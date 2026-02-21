import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
    queryKey: ['organizations', orgId, 'charges', filters],
    queryFn: () =>
      api.get<PaginatedResponse<ChargeWithMember>>(
        `/organizations/${orgId}/charges${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: !!orgId,
  });
}

export function useCharge(orgId: string | null, chargeId: string | null) {
  return useQuery({
    queryKey: ['organizations', orgId, 'charges', chargeId],
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
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'charges'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
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
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'charges'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'members'],
      });
    },
  });
}

export function useVoidCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, chargeId }: { orgId: string; chargeId: string }) =>
      api.delete(`/organizations/${orgId}/charges/${chargeId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'charges'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}

export function useRestoreCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, chargeId }: { orgId: string; chargeId: string }) =>
      api.post(`/organizations/${orgId}/charges/${chargeId}/restore`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'charges'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}
