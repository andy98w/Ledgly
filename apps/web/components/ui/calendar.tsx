'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface CalendarProps {
  selected?: Date;
  onSelect: (date: Date) => void;
  className?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function Calendar({ selected, onSelect, className }: CalendarProps) {
  const [viewDate, setViewDate] = useState(() => selected || new Date());
  const today = useMemo(() => new Date(), []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }

    // Next month leading days
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        date: new Date(year, month + 1, d),
        isCurrentMonth: false,
      });
    }

    return cells;
  }, [year, month]);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className={cn('p-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {MONTHS[month]} {year}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7" role="grid" aria-label={`${MONTHS[month]} ${year}`}>
        {days.map(({ date, isCurrentMonth }, i) => {
          const isSelected = selected && isSameDay(date, selected);
          const isToday = isSameDay(date, today);

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(date)}
              aria-label={`${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`}
              data-selected={isSelected || undefined}
              aria-current={isToday ? 'date' : undefined}
              className={cn(
                'h-8 w-8 mx-auto rounded-md text-sm transition-colors',
                !isCurrentMonth && 'text-muted-foreground/40',
                isCurrentMonth && !isSelected && 'hover:bg-secondary',
                isToday && !isSelected && 'font-semibold text-primary',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
