import type { AuthUser } from '@ledgly/shared';

export function getPostLoginRedirect(user: AuthUser): string {
  if (user.memberships.length === 0) return '/onboarding';
  const hasPrivilegedRole = user.memberships.some(
    (m) => m.role === 'ADMIN' || m.role === 'TREASURER',
  );
  return hasPrivilegedRole ? '/dashboard' : '/portal';
}
