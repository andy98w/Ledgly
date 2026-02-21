import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PaymentWithAllocations, PaginatedResponse } from '@ledgly/shared';

interface PaymentFilters {
  membershipId?: string;
  unallocated?: boolean;
  page?: number;
  limit?: number;
}

export function usePayments(orgId: string | null, filters: PaymentFilters = {}) {
  const params = new URLSearchParams();
  if (filters.membershipId) params.set('membershipId', filters.membershipId);
  if (filters.unallocated !== undefined) params.set('unallocated', String(filters.unallocated));
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();

  return useQuery({
    queryKey: ['organizations', orgId, 'payments', filters],
    queryFn: () =>
      api.get<PaginatedResponse<PaymentWithAllocations>>(
        `/organizations/${orgId}/payments${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: !!orgId,
  });
}

export function usePayment(orgId: string | null, paymentId: string | null) {
  return useQuery({
    queryKey: ['organizations', orgId, 'payments', paymentId],
    queryFn: () => api.get(`/organizations/${orgId}/payments/${paymentId}`),
    enabled: !!orgId && !!paymentId,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      data,
    }: {
      orgId: string;
      data: {
        membershipId?: string;
        amountCents: number;
        paidAt: string;
        rawPayerName?: string;
        memo?: string;
      };
    }) => api.post(`/organizations/${orgId}/payments`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'payments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}

export function useAllocatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      paymentId,
      allocations,
    }: {
      orgId: string;
      paymentId: string;
      allocations: Array<{ chargeId: string; amountCents: number }>;
    }) => api.post(`/organizations/${orgId}/payments/${paymentId}/allocate`, { allocations }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'payments'],
      });
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

export function useUpdatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      paymentId,
      data,
    }: {
      orgId: string;
      paymentId: string;
      data: {
        amountCents?: number;
        paidAt?: string;
        rawPayerName?: string;
        memo?: string;
      };
    }) => api.patch(`/organizations/${orgId}/payments/${paymentId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'payments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, paymentId }: { orgId: string; paymentId: string }) =>
      api.delete(`/organizations/${orgId}/payments/${paymentId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'payments'],
      });
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

export function useRestorePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, paymentId }: { orgId: string; paymentId: string }) =>
      api.post(`/organizations/${orgId}/payments/${paymentId}/restore`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'payments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}

export interface UnallocatedPayments {
  totalUnallocatedCents: number;
  payments: Array<{ id: string; unallocatedCents: number }>;
}

export function useUnallocatedForMember(orgId: string | null, membershipId: string | null) {
  return useQuery({
    queryKey: ['organizations', orgId, 'payments', 'member', membershipId, 'unallocated'],
    queryFn: () =>
      api.get<UnallocatedPayments>(
        `/organizations/${orgId}/payments/member/${membershipId}/unallocated`,
      ),
    enabled: !!orgId && !!membershipId,
  });
}

export function useAutoAllocateToCharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      chargeId,
    }: {
      orgId: string;
      chargeId: string;
    }) => api.post<{ allocatedCents: number }>(`/organizations/${orgId}/payments/auto-allocate/${chargeId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'payments'],
      });
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
