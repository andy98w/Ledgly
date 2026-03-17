import { useEffect } from 'react';

export function usePageKeyboard(page: number, totalPages: number, onPageChange: (page: number) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;
      if (target.closest('table') || target.closest('[data-spreadsheet]')) return;

      if (e.key === 'ArrowLeft' && page > 1) {
        e.preventDefault();
        onPageChange(page - 1);
      } else if (e.key === 'ArrowRight' && page < totalPages) {
        e.preventDefault();
        onPageChange(page + 1);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [page, totalPages, onPageChange]);
}
