import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface PlaidConnection {
  id: string;
  institutionName: string | null;
  accountMask: string | null;
  accountName: string | null;
  lastSyncAt: string | null;
  isActive: boolean;
}

export function usePlaidStatus(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.plaid.status(orgId),
    queryFn: () => api.get<{ configured: boolean }>(`/organizations/${orgId}/plaid/status`),
    enabled: !!orgId,
    staleTime: 60_000,
  });
}

export function usePlaidConnections(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.plaid.connections(orgId),
    queryFn: () =>
      api.get<{ connections: PlaidConnection[] }>(`/organizations/${orgId}/plaid/connections`),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useCreatePlaidLinkToken() {
  return useMutation({
    mutationFn: ({ orgId }: { orgId: string }) =>
      api.post<{ linkToken: string }>(`/organizations/${orgId}/plaid/link-token`),
  });
}

export function useCreatePlaidUpdateLinkToken() {
  return useMutation({
    mutationFn: ({ orgId, connectionId }: { orgId: string; connectionId: string }) =>
      api.post<{ linkToken: string }>(`/organizations/${orgId}/plaid/connections/${connectionId}/update-link-token`),
  });
}

export function useExchangePlaidToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, publicToken }: { orgId: string; publicToken: string }) =>
      api.post<{ connectionId: string }>(`/organizations/${orgId}/plaid/exchange`, {
        publicToken,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.plaid.all(variables.orgId),
      });
    },
  });
}

export function usePlaidSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId }: { orgId: string }) =>
      api.post<{ imported: number; skipped: number }>(`/organizations/${orgId}/plaid/sync`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.plaid.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.payments.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.expenses.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.all(variables.orgId),
      });
    },
  });
}

export function useDisconnectPlaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, connectionId }: { orgId: string; connectionId: string }) =>
      api.delete(`/organizations/${orgId}/plaid/connections/${connectionId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.plaid.all(variables.orgId),
      });
    },
  });
}
