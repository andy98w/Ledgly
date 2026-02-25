import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface GmailStatus {
  connected: boolean;
  email?: string;
  lastSyncAt?: string;
  isActive?: boolean;
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
  status: 'PENDING' | 'AUTO_CONFIRMED' | 'CONFIRMED' | 'IGNORED' | 'DUPLICATE';
  createdAt: string;
  reviewedAt?: string;
  // Auto-matching fields
  matchedMembershipId?: string;
  matchConfidence?: number;
  needsReviewReason?: string;
  derivedCategory?: string;
  allocatedChargeIds?: string[];
  expenseId?: string;
}

export interface ImportStats {
  pending: number;
  autoConfirmed: number;
  confirmed: number;
  ignored: number;
}

export interface SyncResult {
  imported: number;
  skipped: number;
  autoConfirmed: number;
  needsReview: number;
}

export function useGmailStatus(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.gmail.status(orgId),
    queryFn: () => api.get<GmailStatus>(`/organizations/${orgId}/gmail/status`),
    enabled: !!orgId,
  });
}

export function useGmailImports(orgId: string | null, status = 'pending') {
  return useQuery({
    queryKey: queryKeys.gmail.imports(orgId, status),
    queryFn: () =>
      api.get<{ data: EmailImport[] }>(
        `/organizations/${orgId}/gmail/imports?status=${status}`,
      ),
    enabled: !!orgId,
  });
}

export function useImportStats(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.gmail.stats(orgId),
    queryFn: () =>
      api.get<ImportStats>(`/organizations/${orgId}/gmail/imports/stats`),
    enabled: !!orgId,
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

export function useConfirmImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      importId,
      membershipId,
    }: {
      orgId: string;
      importId: string;
      membershipId?: string;
    }) =>
      api.post(`/organizations/${orgId}/gmail/imports/${importId}/confirm`, {
        membershipId,
      }),
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
        queryKey: queryKeys.gmail.imports(variables.orgId),
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
        queryKey: queryKeys.gmail.imports(variables.orgId),
      });
    },
  });
}

export function useUnconfirmImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, importId }: { orgId: string; importId: string }) =>
      api.post(`/organizations/${orgId}/gmail/imports/${importId}/unconfirm`),
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

export function useDisconnectGmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId }: { orgId: string }) =>
      api.delete(`/organizations/${orgId}/gmail/disconnect`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.gmail.all(variables.orgId),
      });
    },
  });
}

export function getGmailConnectUrl(orgId: string): string {
  const baseUrl = 'http://localhost:3001/api';
  return `${baseUrl}/gmail/connect/${orgId}`;
}
