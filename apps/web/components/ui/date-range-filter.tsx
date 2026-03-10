'use client';

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';

type DateRange = { from?: string; to?: string };

interface Preset {
  label: string;
  value: () => DateRange;
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const presets: Preset[] = [
  { label: 'All time', value: () => ({}) },
  {
    label: 'This month',
    value: () => {
      const now = new Date();
      return { from: toYMD(new Date(now.getFullYear(), now.getMonth(), 1)), to: toYMD(now) };
    },
  },
  {
    label: 'Last 30 days',
    value: () => {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from: toYMD(from), to: toYMD(now) };
    },
  },
  {
    label: 'This quarter',
    value: () => {
      const now = new Date();
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { from: toYMD(quarterStart), to: toYMD(now) };
    },
  },
  {
    label: 'This year',
    value: () => {
      const now = new Date();
      return { from: toYMD(new Date(now.getFullYear(), 0, 1)), to: toYMD(now) };
    },
  },
];

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);

  const activeLabel = !value.from && !value.to
    ? 'All time'
    : value.from && value.to
      ? `${formatShort(value.from)} – ${formatShort(value.to)}`
      : value.from
        ? `From ${formatShort(value.from)}`
        : `Until ${formatShort(value.to!)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-8 text-xs bg-secondary/30 border-border/50 gap-1.5',
            (value.from || value.to) && 'text-foreground',
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {activeLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-1 mb-3">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                onChange(preset.value());
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-secondary transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="border-t border-border/50 pt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="space-y-2">
            <DatePicker
              value={value.from}
              onChange={(from) => {
                onChange({ ...value, from });
              }}
              placeholder="From"
              className="h-8 text-xs"
            />
            <DatePicker
              value={value.to}
              onChange={(to) => {
                onChange({ ...value, to });
              }}
              placeholder="To"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
