'use client';

import { useState } from 'react';
import { AlertTriangle, Clock, Copy, X } from 'lucide-react';
import type { RowInsight } from '@/lib/utils/spreadsheet-insights';
import { cn } from '@/lib/utils';

interface InsightsBannerProps {
  insights: RowInsight[];
  activeFilter: RowInsight['type'] | null;
  onFilterByType: (type: RowInsight['type']) => void;
}

const INSIGHT_CONFIG = {
  overdue: { label: 'overdue', icon: Clock, className: 'text-destructive' },
  unmatched: { label: 'unmatched', icon: AlertTriangle, className: 'text-warning' },
  duplicate: { label: 'possible duplicate', icon: Copy, className: 'text-blue-500' },
} as const;

export function InsightsBanner({ insights, activeFilter, onFilterByType }: InsightsBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || insights.length === 0) return null;

  const counts = insights.reduce(
    (acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border bg-card text-sm">
      <div className="flex items-center gap-3 flex-1 flex-wrap">
        {(Object.entries(counts) as [RowInsight['type'], number][]).map(([type, count]) => {
          const config = INSIGHT_CONFIG[type];
          const Icon = config.icon;
          const isActive = activeFilter === type;
          return (
            <button
              key={type}
              onClick={() => onFilterByType(type)}
              className={cn(
                'inline-flex items-center gap-1.5 underline-offset-2 transition-colors rounded-md px-2 py-1 -mx-1',
                config.className,
                isActive
                  ? 'bg-secondary underline font-medium'
                  : 'hover:underline hover:bg-secondary/50',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>
                {count} {config.label}{count !== 1 ? 's' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
