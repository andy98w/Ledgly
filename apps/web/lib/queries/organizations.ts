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
  enabledPaymentSources: string[];
  joinCode: string | null;
  joinCodeEnabled: boolean;
  joinRequiresApproval: boolean;
  memberCount: number;
  chargeCount: number;
}

interface JoinCodeSettings {
  joinCode: string | null;
  joinCodeEnabled: boolean;
  joinRequiresApproval: boolean;
}

interface ResolvedJoinCode {
  orgId: string;
  orgName: string;
}

interface JoinResult {
  membershipId: string;
  orgId: string;
  orgName: string;
  status: string;
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
    mutationFn: (data: Partial<Pick<OrganizationDetails, 'name' | 'timezone' | 'autoApprovePayments' | 'autoApproveExpenses' | 'enabledPaymentSources'>>) =>
      api.patch<OrganizationDetails>(`/organizations/${orgId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId] });
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'dashboard'] });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orgId: string) => api.delete(`/organizations/${orgId}`),
    onSuccess: (_data, deletedOrgId) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      const { user, setUser, setCurrentOrgId } = useAuthStore.getState();
      if (user) {
        const remaining = user.memberships.filter((m) => m.orgId !== deletedOrgId);
        setUser({ ...user, memberships: remaining });
        setCurrentOrgId(remaining.length > 0 ? remaining[0].orgId : null);
      } else {
        setCurrentOrgId(null);
      }
    },
  });
}

export function useGenerateJoinCode(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<JoinCodeSettings>(`/organizations/${orgId}/join-code`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId] });
    },
  });
}

export function useDisableJoinCode(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete(`/organizations/${orgId}/join-code`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId] });
    },
  });
}

export function useUpdateJoinCodeSettings(orgId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { enabled?: boolean; requiresApproval?: boolean }) =>
      api.patch<JoinCodeSettings>(`/organizations/${orgId}/join-code`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', orgId] });
    },
  });
}

export function useResolveJoinCode(code: string | null) {
  return useQuery({
    queryKey: ['join-code', code],
    queryFn: () => api.get<ResolvedJoinCode>(`/organizations/resolve-code/${code}`),
    enabled: !!code && code.length === 6,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useJoinOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (code: string) => api.post<JoinResult>('/organizations/join', { code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}
