import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setAuthToken, clearAuthToken } from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth';
import type { AuthUser } from '@ledgly/shared';

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const user = await api.get<AuthUser>('/auth/me');
      setUser(user);
      return user;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSendMagicLink() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ message: string }>('/auth/magic-link', { email }),
  });
}

// Dev-only: bypass magic link
export function useDevLogin() {
  const setUser = useAuthStore((s) => s.setUser);
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);

  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ accessToken: string; user: AuthUser }>('/auth/dev-login', { email }),
    onSuccess: (data) => {
      setAuthToken(data.accessToken);
      setUser(data.user);

      if (data.user.memberships.length > 0) {
        setCurrentOrgId(data.user.memberships[0].orgId);
      }
    },
  });
}

export function useVerifyMagicLink() {
  const setUser = useAuthStore((s) => s.setUser);
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);

  return useMutation({
    mutationFn: (token: string) =>
      api.post<{ accessToken: string; user: AuthUser }>('/auth/verify', { token }),
    onSuccess: (data) => {
      setAuthToken(data.accessToken);
      setUser(data.user);

      // Set first org as current if user has memberships
      if (data.user.memberships.length > 0) {
        setCurrentOrgId(data.user.memberships[0].orgId);
      }
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  return () => {
    clearAuthToken();
    logout();
    queryClient.clear();
  };
}

export function useUpdateProfile() {
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; avatarUrl?: string }) =>
      api.patch<AuthUser>('/auth/me', data),
    onSuccess: (user) => {
      setUser(user);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}
