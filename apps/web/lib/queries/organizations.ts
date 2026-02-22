import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth';
import type { DashboardStats } from '@ledgly/shared';

interface Organization {
  id: string;
  name: string;
  timezone: string;
  membership: {
    id: string;
    role: string;
  };
}

interface OrganizationDetails extends Organization {
  autoApprovePayments: boolean;
  autoApproveExpenses: boolean;
  memberCount: number;
  chargeCount: number;
}

export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<Organization[]>('/organizations'),
  });
}

export function useOrganization(orgId: string | null) {
  return useQuery({
    queryKey: ['organizations', orgId],
    queryFn: () => api.get<OrganizationDetails>(`/organizations/${orgId}`),
    enabled: !!orgId,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);

  return useMutation({
    mutationFn: (data: { name: string; timezone?: string }) =>
      api.post<Organization>('/organizations', data),
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setCurrentOrgId(org.id);
    },
  });
}

export function useDashboard(orgId: string | null) {
  return useQuery({
    queryKey: ['organizations', orgId, 'dashboard'],
    queryFn: () => api.get<DashboardStats>(`/organizations/${orgId}/dashboard`),
    enabled: !!orgId,
    refetchInterval: 30000,
  });
}

export function useUpdateOrganization(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Pick<OrganizationDetails, 'name' | 'timezone' | 'autoApprovePayments' | 'autoApproveExpenses'>>) =>
      api.patch<OrganizationDetails>(`/organizations/${orgId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId] });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'dashboard'] });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);

  return useMutation({
    mutationFn: (orgId: string) => api.delete(`/organizations/${orgId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setCurrentOrgId(null);
    },
  });
}
