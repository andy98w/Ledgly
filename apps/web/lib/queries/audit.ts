import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  diffJson: Record<string, any> | null;
  batchId?: string;
  batchDescription?: string;
  undone?: boolean;
  undoneAt?: string;
  createdAt: string;
  actor: {
    id: string;
    name: string;
  } | null;
}

export interface BatchedAuditLogEntry {
  id: string;
  isBatch: boolean;
  batchDescription?: string;
  itemCount: number;
  entityType: string;
  action: string;
  undone?: boolean;
  createdAt: string;
  actor: {
    id: string;
    name: string;
  } | null;
  items?: AuditLogEntry[];
}

export type AuditLogItem = AuditLogEntry | BatchedAuditLogEntry;

export interface AuditLogsResponse {
  data: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
}

export function useAuditLogs(
  orgId: string | null,
  options: { entityType?: string; limit?: number; offset?: number } = {},
) {
  const params = new URLSearchParams();
  if (options.entityType) params.set('entityType', options.entityType);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const queryString = params.toString();

  return useQuery({
    queryKey: queryKeys.audit.list(orgId, options),
    queryFn: () =>
      api.get<AuditLogsResponse>(
        `/organizations/${orgId}/audit${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: !!orgId,
  });
}

export function useUndoAuditLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, logId }: { orgId: string; logId: string }) =>
      api.post<{ success: boolean; message: string }>(
        `/organizations/${orgId}/audit/${logId}/undo`,
      ),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all(orgId) });
    },
  });
}

export function useUndoBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, batchId }: { orgId: string; batchId: string }) =>
      api.post<{ success: boolean; message: string }>(
        `/organizations/${orgId}/audit/batch/${batchId}/undo`,
      ),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all(orgId) });
    },
  });
}

export function useRedoAuditLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, logId }: { orgId: string; logId: string }) =>
      api.post<{ success: boolean; message: string }>(
        `/organizations/${orgId}/audit/${logId}/redo`,
      ),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all(orgId) });
    },
  });
}

export function useRedoBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, batchId }: { orgId: string; batchId: string }) =>
      api.post<{ success: boolean; message: string }>(
        `/organizations/${orgId}/audit/batch/${batchId}/redo`,
      ),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.charges.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all(orgId) });
    },
  });
}
