import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface SlackConnection {
  id: string;
  webhookUrl: string;
  channelName?: string;
  isActive: boolean;
  createdAt: string;
}

export function useSlackConnections(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.slack.all(orgId),
    queryFn: () => api.get<{ connections: SlackConnection[] }>(`/organizations/${orgId}/slack/connections`),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useConnectSlack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, webhookUrl, channelName }: { orgId: string; webhookUrl: string; channelName?: string }) =>
      api.post<SlackConnection>(`/organizations/${orgId}/slack/connect`, { webhookUrl, channelName }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.slack.all(variables.orgId),
      });
    },
  });
}

export function useDisconnectSlack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, connectionId }: { orgId: string; connectionId: string }) =>
      api.delete(`/organizations/${orgId}/slack/connections/${connectionId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.slack.all(variables.orgId),
      });
    },
  });
}

export function useTestSlack() {
  return useMutation({
    mutationFn: ({ orgId }: { orgId: string }) =>
      api.post<{ success: boolean }>(`/organizations/${orgId}/slack/test`),
  });
}
