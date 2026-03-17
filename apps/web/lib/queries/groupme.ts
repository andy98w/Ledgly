import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface GroupMeConnection {
  id: string;
  botId: string;
  groupName?: string;
  isActive: boolean;
  createdAt: string;
}

export function useGroupMeConnections(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.groupme.all(orgId),
    queryFn: () => api.get<{ connections: GroupMeConnection[] }>(`/organizations/${orgId}/groupme/connections`),
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

export function useConnectGroupMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, botId, groupName }: { orgId: string; botId: string; groupName?: string }) =>
      api.post<GroupMeConnection>(`/organizations/${orgId}/groupme/connect`, { botId, groupName }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupme.all(variables.orgId),
      });
    },
  });
}

export function useDisconnectGroupMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, connectionId }: { orgId: string; connectionId: string }) =>
      api.delete(`/organizations/${orgId}/groupme/connections/${connectionId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupme.all(variables.orgId),
      });
    },
  });
}

export function useTestGroupMe() {
  return useMutation({
    mutationFn: ({ orgId }: { orgId: string }) =>
      api.post<{ success: boolean }>(`/organizations/${orgId}/groupme/test`),
  });
}
