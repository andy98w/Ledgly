import { useState, useEffect } from 'react';

export function useChargeFilters() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Reset page when filters or search changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, categoryFilter, searchQuery]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  return {
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    searchQuery,
    setSearchQuery,
    page,
    setPage,
    pageSize,
    handlePageSizeChange,
  };
}
