import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  diffJson: Record<string, any> | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
  };
}

export interface AuditLogsResponse {
  data: AuditLogEntry[];
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
    queryKey: ['organizations', orgId, 'audit', options],
    queryFn: () =>
      api.get<AuditLogsResponse>(
        `/organizations/${orgId}/audit${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: !!orgId,
  });
}
