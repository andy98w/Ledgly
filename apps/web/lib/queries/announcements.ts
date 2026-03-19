import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface Announcement {
  id: string;
  orgId: string;
  title: string;
  body: string;
  createdAt: string;
  createdBy: {
    id: string;
    name: string | null;
    user?: { name: string | null };
  };
}

export function useAnnouncements(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.announcements.all(orgId),
    queryFn: () => api.get<Announcement[]>(`/organizations/${orgId}/announcements`),
    enabled: !!orgId,
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      data,
    }: {
      orgId: string;
      data: { title: string; body: string; broadcast?: boolean };
    }) => api.post<Announcement>(`/organizations/${orgId}/announcements`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all(variables.orgId) });
    },
  });
}

export function useBroadcastAnnouncement() {
  return useMutation({
    mutationFn: ({ orgId, id }: { orgId: string; id: string }) =>
      api.post(`/organizations/${orgId}/announcements/${id}/broadcast`),
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, id }: { orgId: string; id: string }) =>
      api.delete(`/organizations/${orgId}/announcements/${id}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all(variables.orgId) });
    },
  });
}
