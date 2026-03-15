import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

import { queryKeys } from '@/lib/query-keys';

export interface GmailConnection {
  id: string;
  email: string;
  lastSyncAt?: string;
  isActive: boolean;
}

export interface GmailStatus {
  connected: boolean;
  connections: GmailConnection[];
}

export interface EmailImport {
  id: string;
  orgId: string;
  messageId: string;
  emailFrom: string;
  emailSubject: string;
  emailDate: string;
  emailSnippet?: string;
  parsedSource: 'venmo' | 'zelle' | 'cashapp' | 'paypal';
  parsedDirection: 'incoming' | 'outgoing';
  parsedAmount?: number;
  parsedPayerName?: string;
  parsedPayerEmail?: string;
  parsedMemo?: string;
  status: 'AUTO_CONFIRMED' | 'IGNORED' | 'DUPLICATE';
  createdAt: string;
  reviewedAt?: string;
  matchedMembershipId?: string;
  matchConfidence?: number;
  derivedCategory?: string;
  allocatedChargeIds?: string[];
  expenseId?: string;
}

export interface SyncResult {
  imported: number;
  skipped: number;
  autoConfirmed: number;
}

export function useGmailImports(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.gmail.imports(orgId),
    queryFn: () => api.get<{ data: EmailImport[] }>(`/organizations/${orgId}/gmail/imports`),
    enabled: !!orgId,
  });
}

export function useGmailStatus(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.gmail.status(orgId),
    queryFn: () => api.get<GmailStatus>(`/organizations/${orgId}/gmail/status`),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useSyncGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId }: { orgId: string }) =>
      api.post<SyncResult>(`/organizations/${orgId}/gmail/sync`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.gmail.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.payments.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.audit.all(variables.orgId),
      });
    },
  });
}

export function useIgnoreImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, importId }: { orgId: string; importId: string }) =>
      api.post(`/organizations/${orgId}/gmail/imports/${importId}/ignore`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.gmail.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.payments.all(variables.orgId),
      });
    },
  });
}

export function useRestoreImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, importId }: { orgId: string; importId: string }) =>
      api.post(`/organizations/${orgId}/gmail/imports/${importId}/restore`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.gmail.all(variables.orgId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.payments.all(variables.orgId),
      });
    },
  });
}

export function useDisconnectGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, connectionId }: { orgId: string; connectionId: string }) =>
      api.delete(`/organizations/${orgId}/gmail/disconnect/${connectionId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.gmail.all(variables.orgId),
      });
    },
  });
}

export function getGmailConnectUrl(orgId: string, returnTo?: string): string {
  const url = `/api/v1/gmail/connect/${orgId}`;
  if (returnTo) {
    return `${url}?returnTo=${encodeURIComponent(returnTo)}`;
  }
  return url;
}
