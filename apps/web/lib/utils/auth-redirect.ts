import type { AuthUser } from '@ledgly/shared';

export function getPostLoginRedirect(user: AuthUser): string {
  if (typeof window !== 'undefined') {
    const pendingJoin = localStorage.getItem('ledgly_pending_join');
    if (pendingJoin) return `/join?code=${pendingJoin}`;
  }
  if (user.memberships.length === 0) return '/onboarding';
  const hasPrivilegedRole = user.memberships.some(
    (m) => m.role === 'OWNER' || m.role === 'ADMIN' || m.role === 'TREASURER',
  );
  return hasPrivilegedRole ? '/dashboard' : '/portal';
}
