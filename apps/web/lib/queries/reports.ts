import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useCollectionReport(orgId: string | null, params: { start?: string; end?: string }) {
  const qs = new URLSearchParams();
  if (params.start) qs.set('start', params.start);
  if (params.end) qs.set('end', params.end);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  return useQuery({
    queryKey: queryKeys.reports.collection(orgId, params),
    queryFn: () => api.get(`/organizations/${orgId}/reports/collection${suffix}`),
    enabled: !!orgId,
  });
}

export function useOutstandingReport(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.reports.outstanding(orgId),
    queryFn: () => api.get(`/organizations/${orgId}/reports/outstanding`),
    enabled: !!orgId,
  });
}

export function usePeriodComparison(
  orgId: string | null,
  params: { currentStart?: string; currentEnd?: string; prevStart?: string; prevEnd?: string },
) {
  const qs = new URLSearchParams();
  if (params.currentStart) qs.set('currentStart', params.currentStart);
  if (params.currentEnd) qs.set('currentEnd', params.currentEnd);
  if (params.prevStart) qs.set('prevStart', params.prevStart);
  if (params.prevEnd) qs.set('prevEnd', params.prevEnd);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';

  return useQuery({
    queryKey: queryKeys.reports.comparison(orgId, params),
    queryFn: () => api.get(`/organizations/${orgId}/reports/comparison${suffix}`),
    enabled: !!orgId && !!params.currentStart && !!params.currentEnd,
  });
}
