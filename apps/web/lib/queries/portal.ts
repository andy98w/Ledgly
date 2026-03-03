import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MemberDetail } from '@ledgly/shared';

export function useMyMembership(orgId: string | null) {
  return useQuery({
    queryKey: ['organizations', orgId, 'members', 'me'],
    queryFn: () => api.get<MemberDetail>(`/organizations/${orgId}/members/me`),
    enabled: !!orgId,
  });
}
