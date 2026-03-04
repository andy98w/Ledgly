import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@ledgly/shared';

interface AuthState {
  /** Cached user — populated by useMe() and auth mutations. Use useMe().data for React Query benefits. */
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

/** Convenience: true if role is OWNER, ADMIN, or TREASURER */
export function useIsAdminOrTreasurer() {
  const role = useCurrentRole();
  return role === 'OWNER' || role === 'ADMIN' || role === 'TREASURER';
}

/** Convenience: true if role is OWNER */
export function useIsOwner() {
  const role = useCurrentRole();
  return role === 'OWNER';
}

/** Returns the user's membership in the current org */
export function useCurrentMembership() {
  const user = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  if (!user || !currentOrgId) return null;
  return user.memberships.find((m) => m.orgId === currentOrgId) ?? null;
}
