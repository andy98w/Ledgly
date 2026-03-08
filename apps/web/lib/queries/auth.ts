import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, clearLegacyTokens } from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth';
import type { AuthUser } from '@ledgly/shared';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface RegisterResponse {
  pendingVerification: true;
  email: string;
}

/** Only update currentOrgId if the persisted one is missing or stale */
function ensureCurrentOrg(user: AuthUser) {
  const { currentOrgId, setCurrentOrgId } = useAuthStore.getState();
  if (user.memberships.length === 0) return;
  const stillValid = currentOrgId && user.memberships.some((m) => m.orgId === currentOrgId);
  if (!stillValid) {
    setCurrentOrgId(user.memberships[0].orgId);
  }
}

function handleAuthResponse(data: AuthResponse) {
  // Tokens are stored in httpOnly cookies by the server — no localStorage needed
  useAuthStore.getState().setUser(data.user);
  ensureCurrentOrg(data.user);
}

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const user = await api.get<AuthUser>('/auth/me');
      setUser(user);
      ensureCurrentOrg(user);
      return user;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: { email: string; password: string; name: string }) =>
      api.post<RegisterResponse>('/auth/register', data),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post<AuthResponse>('/auth/verify-email', { token }),
    onSuccess: handleAuthResponse,
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ message: string }>('/auth/resend-verification', { email }),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<AuthResponse>('/auth/login', data),
    onSuccess: handleAuthResponse,
  });
}

export function useSendMagicLink() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ message: string }>('/auth/magic-link', { email }),
  });
}

export function useVerifyMagicLink() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post<AuthResponse>('/auth/verify', { token }),
    onSuccess: handleAuthResponse,
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();

  return () => {
    // Server-side logout clears httpOnly cookies + revokes refresh token
    api.post('/auth/logout', {}).catch(() => {});
    clearLegacyTokens();
    logout();
    queryClient.clear();
  };
}

export function useResolveInvite(token: string | null) {
  return useQuery({
    queryKey: ['auth', 'invite', token],
    queryFn: () => api.get<{ email: string; orgName: string; memberName: string | null }>(`/auth/invite/${token}`),
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword?: string; newPassword: string }) =>
      api.patch<{ message: string }>('/auth/password', data),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ message: string }>('/auth/forgot-password', { email }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: { token: string; password: string }) =>
      api.post<{ message: string }>('/auth/reset-password', data),
  });
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
