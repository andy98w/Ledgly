import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@ledgly/shared';

interface AuthState {
  user: AuthUser | null;
  currentOrgId: string | null;
  setUser: (user: AuthUser | null) => void;
  setCurrentOrgId: (orgId: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      currentOrgId: null,
      setUser: (user) => set({ user }),
      setCurrentOrgId: (currentOrgId) => set({ currentOrgId }),
      logout: () => {
        set({ user: null, currentOrgId: null });
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
        }
      },
    }),
    {
      name: 'ledgly-auth',
      partialize: (state) => ({
        currentOrgId: state.currentOrgId,
      }),
    },
  ),
);

/** Returns the current user's role in the active org, or null */
export function useCurrentRole() {
  const user = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  if (!user || !currentOrgId) return null;
  const membership = user.memberships.find((m) => m.orgId === currentOrgId);
  return membership?.role ?? null;
}

/** Convenience: true if role is ADMIN or TREASURER */
export function useIsAdminOrTreasurer() {
  const role = useCurrentRole();
  return role === 'ADMIN' || role === 'TREASURER';
}
