import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useInsights(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.insights.all(orgId),
    queryFn: () => api.get(`/organizations/${orgId}/insights`),
    enabled: !!orgId,
  });
}
