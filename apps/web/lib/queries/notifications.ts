import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Notification {
  id: string;
  orgId: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  linkUrl: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  total: number;
  unreadCount: number;
}

export function useNotifications(orgId: string | null, options: { limit?: number } = {}) {
  const { limit = 20 } = options;

  return useQuery({
    queryKey: ['notifications', orgId, { limit }],
    queryFn: () =>
      api.get<NotificationsResponse>(
        `/organizations/${orgId}/notifications?limit=${limit}`,
      ),
    enabled: !!orgId,
    refetchInterval: 30000,
  });
}

export function useUnreadCount(orgId: string | null) {
  return useQuery({
    queryKey: ['notifications', orgId, 'unread-count'],
    queryFn: () =>
      api.get<{ count: number }>(
        `/organizations/${orgId}/notifications/unread-count`,
      ),
    enabled: !!orgId,
    refetchInterval: 30000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, notificationId }: { orgId: string; notificationId: string }) =>
      api.patch(`/organizations/${orgId}/notifications/${notificationId}/read`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', variables.orgId] });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orgId: string) =>
      api.patch<{ updatedCount: number }>(
        `/organizations/${orgId}/notifications/read-all`,
      ),
    onSuccess: (_, orgId) => {
      queryClient.invalidateQueries({ queryKey: ['notifications', orgId] });
    },
  });
}
