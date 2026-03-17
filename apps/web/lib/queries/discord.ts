import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface DiscordConnection {
  id: string;
  webhookUrl: string;
  channelName?: string;
  isActive: boolean;
  createdAt: string;
}

export function useDiscordConnections(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.discord.all(orgId),
    queryFn: () => api.get<{ connections: DiscordConnection[] }>(`/organizations/${orgId}/discord/connections`),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useConnectDiscord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, webhookUrl, channelName }: { orgId: string; webhookUrl: string; channelName?: string }) =>
      api.post<DiscordConnection>(`/organizations/${orgId}/discord/connect`, { webhookUrl, channelName }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.discord.all(variables.orgId),
      });
    },
  });
}

export function useDisconnectDiscord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, connectionId }: { orgId: string; connectionId: string }) =>
      api.delete(`/organizations/${orgId}/discord/connections/${connectionId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.discord.all(variables.orgId),
      });
    },
  });
}

export function useTestDiscord() {
  return useMutation({
    mutationFn: ({ orgId }: { orgId: string }) =>
      api.post<{ success: boolean }>(`/organizations/${orgId}/discord/test`),
  });
}
