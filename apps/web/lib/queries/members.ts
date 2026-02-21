import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MemberWithBalance, MemberDetail, PaginatedResponse } from '@ledgly/shared';

interface MemberFilters {
  status?: string;
  hasBalance?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export function useMembers(orgId: string | null, filters: MemberFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.hasBalance !== undefined) params.set('hasBalance', String(filters.hasBalance));
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const queryString = params.toString();

  return useQuery({
    queryKey: ['organizations', orgId, 'members', filters],
    queryFn: () =>
      api.get<PaginatedResponse<MemberWithBalance>>(
        `/organizations/${orgId}/members${queryString ? `?${queryString}` : ''}`,
      ),
    enabled: !!orgId,
  });
}

export function useMember(orgId: string | null, memberId: string | null) {
  return useQuery({
    queryKey: ['organizations', orgId, 'members', memberId],
    queryFn: () => api.get<MemberDetail>(`/organizations/${orgId}/members/${memberId}`),
    enabled: !!orgId && !!memberId,
  });
}

export function useCreateMembers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      members,
    }: {
      orgId: string;
      members: Array<{ name: string; email?: string; role?: string }>;
    }) => api.post(`/organizations/${orgId}/members`, { members }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orgId,
      memberId,
      data,
    }: {
      orgId: string;
      memberId: string;
      data: { name?: string; role?: string; status?: string };
    }) => api.patch(`/organizations/${orgId}/members/${memberId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'members'],
      });
    },
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, memberId }: { orgId: string; memberId: string }) =>
      api.delete(`/organizations/${orgId}/members/${memberId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}

export function useRestoreMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orgId, memberId }: { orgId: string; memberId: string }) =>
      api.post(`/organizations/${orgId}/members/${memberId}/restore`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'members'],
      });
      queryClient.invalidateQueries({
        queryKey: ['organizations', variables.orgId, 'dashboard'],
      });
    },
  });
}
