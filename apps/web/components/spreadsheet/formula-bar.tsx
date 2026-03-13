'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { querySpreadsheet, type SpreadsheetQueryResult } from '@/lib/queries/agent';

interface RowData {
  type: 'charge' | 'expense' | 'payment';
  status?: string;
  category: string;
  incomeCents: number;
  outstandingCents: number;
  expenseCents: number;
  isChild?: boolean;
}

function evaluateCompute(
  expr: SpreadsheetQueryResult & { type: 'compute' },
  rows: RowData[],
): string {
  let filtered = rows.filter((r) => !r.isChild);

  if (expr.filters) {
    if (expr.filters.type) filtered = filtered.filter((r) => r.type === expr.filters!.type);
    if (expr.filters.status) filtered = filtered.filter((r) => r.status === expr.filters!.status);
    if (expr.filters.category) filtered = filtered.filter((r) => r.category === expr.filters!.category);
  }

  const field = (expr.field || 'outstandingCents') as keyof RowData;
  const values = filtered.map((r) => (typeof r[field] === 'number' ? r[field] as number : 0));

  let result: number;
  switch (expr.expression) {
    case 'count':
      result = filtered.length;
      return `${result}`;
    case 'sum':
      result = values.reduce((a, b) => a + b, 0);
      return `$${(result / 100).toFixed(2)}`;
    case 'avg':
      result = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      return `$${(result / 100).toFixed(2)}`;
    case 'min':
      result = values.length ? Math.min(...values) : 0;
      return `$${(result / 100).toFixed(2)}`;
    case 'max':
      result = values.length ? Math.max(...values) : 0;
      return `$${(result / 100).toFixed(2)}`;
    default:
      return '—';
  }
}

interface FormulaBarProps {
  orgId: string;
  rows: RowData[];
  viewMetadata: {
    typeFilter: string;
    rowCount: number;
    columns: string[];
  };
  onFilter: (filters: SpreadsheetQueryResult & { type: 'filter' }) => void;
  onSort: (sort: SpreadsheetQueryResult & { type: 'sort' }) => void;
  onSearchFallback: (query: string) => void;
}

export function FormulaBar({ orgId, rows, viewMetadata, onFilter, onSort, onSearchFallback }: FormulaBarProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [computeResult, setComputeResult] = useState<{ value: string; explanation?: string } | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('ledgly-formula-history');
    if (stored) {
      try { setHistory(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = useCallback(async (queryText?: string) => {
    const text = queryText || query.trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    setComputeResult(null);
    setFallbackNotice(false);

    try {
      const res = await querySpreadsheet(orgId, text, viewMetadata);

      if (res.type === 'filter') {
        onFilter(res as SpreadsheetQueryResult & { type: 'filter' });
      } else if (res.type === 'sort') {
        onSort(res as SpreadsheetQueryResult & { type: 'sort' });
      } else if (res.type === 'compute') {
        const value = evaluateCompute(res as SpreadsheetQueryResult & { type: 'compute' }, rows);
        setComputeResult({ value, explanation: res.explanation });
      }

      const updated = [text, ...history.filter((h) => h !== text)].slice(0, 10);
      setHistory(updated);
      localStorage.setItem('ledgly-formula-history', JSON.stringify(updated));
    } catch {
      onSearchFallback(text);
      setFallbackNotice(true);
    } finally {
      setIsLoading(false);
    }
  }, [query, isLoading, orgId, viewMetadata, rows, onFilter, onSort, onSearchFallback, history]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) {
              onSearchFallback('');
              setFallbackNotice(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            } else if (e.key === 'Escape') {
              setQuery('');
              onSearchFallback('');
              inputRef.current?.blur();
            }
          }}
          onFocus={() => history.length > 0 && setShowHistory(true)}
          onBlur={() => setTimeout(() => setShowHistory(false), 200)}
          placeholder="Ask about your data or filter... (press /)"
          className="w-full h-9 pl-9 pr-10 rounded-lg border border-border/50 bg-secondary/30 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
          disabled={isLoading}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
        )}
        {!isLoading && query && (
          <button
            onClick={() => { setQuery(''); onSearchFallback(''); setComputeResult(null); setFallbackNotice(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {showHistory && history.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg border bg-card shadow-lg py-1 max-h-48 overflow-y-auto">
            {history.map((h, i) => (
              <button
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQuery(h);
                  setShowHistory(false);
                  handleSubmit(h);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      {fallbackNotice && (
        <p className="text-xs text-muted-foreground">
          AI couldn&apos;t parse that query — showing text search results instead.
        </p>
      )}

      {computeResult && (
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-sm">
            <span className="font-medium text-primary">{computeResult.value}</span>
            {computeResult.explanation && (
              <span className="text-muted-foreground text-xs">{computeResult.explanation}</span>
            )}
            <button
              onClick={() => setComputeResult(null)}
              className="text-primary/60 hover:text-primary transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
