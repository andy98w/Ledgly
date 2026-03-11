import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useSchedules(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.schedules.list(orgId),
    queryFn: () => api.get(`/organizations/${orgId}/schedules`),
    enabled: !!orgId,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: any }) =>
      api.post(`/organizations/${orgId}/schedules`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(orgId) });
    },
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, id, data }: { orgId: string; id: string; data: any }) =>
      api.patch(`/organizations/${orgId}/schedules/${id}`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(orgId) });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, id }: { orgId: string; id: string }) =>
      api.delete(`/organizations/${orgId}/schedules/${id}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all(orgId) });
    },
  });
}
