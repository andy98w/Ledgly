'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { querySpreadsheet, type SpreadsheetQueryResult } from '@/lib/queries/agent';

interface RowData {
  type: 'charge' | 'expense' | 'payment';
  status?: string;
  category: string;
  member?: string;
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

// Simple queries that can be handled client-side without AI
const SIMPLE_PATTERNS = [
  /^(show|find|list|search|filter)?\s*(all|everything)?\s*(for|from|by|under|assigned to|belonging to|of)\s+(.+)/i,
  /^(show|find|list|search)?\s*(charges?|expenses?|payments?)\s*(for|from|by|under)?\s*(.+)?/i,
];

function tryLocalFilter(text: string): SpreadsheetQueryResult | null {
  // Direct type filters
  if (/^charges?\s*$/i.test(text)) return { type: 'filter', typeFilter: 'charge' };
  if (/^expenses?\s*$/i.test(text)) return { type: 'filter', typeFilter: 'expense' };
  if (/^payments?\s*$/i.test(text)) return { type: 'filter', typeFilter: 'payment' };

  // "everything under X" / "all for X" patterns
  const memberMatch = text.match(SIMPLE_PATTERNS[0]);
  if (memberMatch) {
    return { type: 'filter', search: memberMatch[4].trim() };
  }

  // "charges for X" patterns
  const typeMatch = text.match(SIMPLE_PATTERNS[1]);
  if (typeMatch) {
    const typeWord = typeMatch[2]?.toLowerCase();
    const typeFilter = typeWord?.startsWith('charge') ? 'charge'
      : typeWord?.startsWith('expense') ? 'expense'
      : typeWord?.startsWith('payment') ? 'payment'
      : undefined;
    const search = typeMatch[4]?.trim();
    if (typeFilter || search) {
      return { type: 'filter', typeFilter, search };
    }
  }

  // Category filters
  const catMatch = text.match(/^(dues|event|fine|merch|supplies|food|venue|marketing|services)\s*$/i);
  if (catMatch) {
    return { type: 'filter', categories: [catMatch[1].toUpperCase()] };
  }

  // Status filters
  if (/^(overdue|unpaid|open)\s*$/i.test(text)) return { type: 'filter', statuses: ['OPEN'] };
  if (/^paid\s*$/i.test(text)) return { type: 'filter', statuses: ['PAID'] };

  return null;
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = useCallback(async () => {
    const text = query.trim();
    if (!text || isLoading) return;

    setComputeResult(null);
    setFallbackNotice(false);

    // Try local parsing first — instant, no API call
    const local = tryLocalFilter(text);
    if (local) {
      if (local.type === 'filter') {
        onFilter(local as SpreadsheetQueryResult & { type: 'filter' });
      } else if (local.type === 'sort') {
        onSort(local as SpreadsheetQueryResult & { type: 'sort' });
      }
      return;
    }

    // Short plain text — just do text search, no AI
    if (text.length <= 20 && !/\d/.test(text) && !/\b(sum|total|average|count|how many|sort|order)\b/i.test(text)) {
      onSearchFallback(text);
      return;
    }

    // Complex query — use AI
    setIsLoading(true);
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
    } catch {
      onSearchFallback(text);
      setFallbackNotice(true);
    } finally {
      setIsLoading(false);
    }
  }, [query, isLoading, orgId, viewMetadata, rows, onFilter, onSort, onSearchFallback]);

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
          placeholder="Search or ask about your data... (press /)"
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
