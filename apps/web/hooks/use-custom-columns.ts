'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export interface CustomColumnDef {
  id: string;
  label: string;
  type: 'text' | 'number';
  isCustom: true;
}

export function useCustomColumns(orgId: string | null) {
  const queryClient = useQueryClient();

  const { data: customColumns = [], isLoading } = useQuery({
    queryKey: queryKeys.customColumns.all(orgId),
    queryFn: () =>
      api.get<CustomColumnDef[]>(`/organizations/${orgId}/custom-columns`),
    enabled: !!orgId,
  });

  const saveMutation = useMutation({
    mutationFn: (columns: CustomColumnDef[]) =>
      api.patch<CustomColumnDef[]>(
        `/organizations/${orgId}/custom-columns`,
        { columns },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.customColumns.all(orgId),
      });
    },
  });

  function addColumn(label: string, type: 'text' | 'number') {
    const newCol: CustomColumnDef = {
      id: `custom_${crypto.randomUUID()}`,
      label,
      type,
      isCustom: true,
    };
    const next = [...customColumns, newCol];

    queryClient.setQueryData(queryKeys.customColumns.all(orgId), next);
    saveMutation.mutate(next);
  }

  function removeColumn(id: string) {
    const next = customColumns.filter((c) => c.id !== id);

    queryClient.setQueryData(queryKeys.customColumns.all(orgId), next);
    saveMutation.mutate(next);
  }

  function updateColumn(id: string, label: string) {
    const next = customColumns.map((c) =>
      c.id === id ? { ...c, label } : c,
    );

    queryClient.setQueryData(queryKeys.customColumns.all(orgId), next);
    saveMutation.mutate(next);
  }

  return {
    customColumns,
    addColumn,
    removeColumn,
    updateColumn,
    isLoading,
  };
}
