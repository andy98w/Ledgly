import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useReminderRules(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reminders.rules(orgId),
    queryFn: () => api.get(`/organizations/${orgId}/reminders/rules`),
    enabled: !!orgId,
  });
}

export function useCreateReminderRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: { triggerType: string; daysOffset: number } }) =>
      api.post(`/organizations/${orgId}/reminders/rules`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all(orgId) });
    },
  });
}

export function useUpdateReminderRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, id, data }: { orgId: string; id: string; data: { isActive?: boolean } }) =>
      api.patch(`/organizations/${orgId}/reminders/rules/${id}`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all(orgId) });
    },
  });
}

export function useDeleteReminderRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, id }: { orgId: string; id: string }) =>
      api.delete(`/organizations/${orgId}/reminders/rules/${id}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all(orgId) });
    },
  });
}
