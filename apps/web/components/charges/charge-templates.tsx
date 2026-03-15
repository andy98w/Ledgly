'use client';

import { useMemo } from 'react';
import { Receipt, Calendar, AlertTriangle, Sparkles, PenLine } from 'lucide-react';
import { cn, formatCents } from '@/lib/utils';
import type { ChargeCategory } from '@ledgly/shared';

export interface ChargeTemplate {
  id: string;
  label: string;
  category: ChargeCategory;
  title: string;
  icon: React.ReactNode;
  suggestedAmountCents?: number;
}

const BASE_TEMPLATES: Omit<ChargeTemplate, 'suggestedAmountCents'>[] = [
  {
    id: 'dues',
    label: 'Monthly Dues',
    category: 'DUES',
    title: 'Monthly Dues',
    icon: <Receipt className="w-4 h-4" />,
  },
  {
    id: 'event',
    label: 'Event Fee',
    category: 'EVENT',
    title: 'Event Fee',
    icon: <Calendar className="w-4 h-4" />,
  },
  {
    id: 'fine',
    label: 'Fine / Penalty',
    category: 'FINE',
    title: 'Fine',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
];

interface ChargeTemplatesProps {
  charges?: Array<{ category: string; amountCents: number; title: string }>;
  onSelect: (template: ChargeTemplate) => void;
  onCustom: () => void;
  className?: string;
}

function getMostCommonAmount(
  charges: Array<{ category: string; amountCents: number }>,
  category: string,
): number | undefined {
  const matching = charges
    .filter((c) => c.category === category)
    .map((c) => c.amountCents);
  if (matching.length < 2) return undefined;

  const counts = new Map<number, number>();
  for (const amt of matching) {
    counts.set(amt, (counts.get(amt) || 0) + 1);
  }

  let bestAmt = 0;
  let bestCount = 0;
  counts.forEach((count, amt) => {
    if (count > bestCount) {
      bestAmt = amt;
      bestCount = count;
    }
  });
  return bestCount >= 2 ? bestAmt : undefined;
}

export function ChargeTemplates({
  charges,
  onSelect,
  onCustom,
  className,
}: ChargeTemplatesProps) {
  const templates = useMemo<ChargeTemplate[]>(() => {
    return BASE_TEMPLATES.map((t) => ({
      ...t,
      suggestedAmountCents: charges
        ? getMostCommonAmount(charges, t.category)
        : undefined,
    }));
  }, [charges]);

  return (
    <div className={cn('grid grid-cols-2 gap-2', className)}>
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onSelect(template)}
          className={cn(
            'flex flex-col items-start gap-1.5 rounded-xl border border-border/50 p-3',
            'text-left transition-all',
            'hover:border-primary/50 hover:bg-primary/5',
            'active:scale-[0.98]',
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-muted-foreground">{template.icon}</span>
            {template.label}
          </div>
          {template.suggestedAmountCents != null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Usually {formatCents(template.suggestedAmountCents)}
            </span>
          )}
        </button>
      ))}
      <button
        type="button"
        onClick={onCustom}
        className={cn(
          'flex flex-col items-start gap-1.5 rounded-xl border border-dashed border-border/50 p-3',
          'text-left transition-all',
          'hover:border-primary/50 hover:bg-primary/5',
          'active:scale-[0.98]',
        )}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <PenLine className="w-4 h-4" />
          Custom
        </div>
      </button>
    </div>
  );
}
