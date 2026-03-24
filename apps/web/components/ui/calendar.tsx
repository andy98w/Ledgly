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
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type View = 'days' | 'months' | 'years';

export function Calendar({ selected, onSelect, className }: CalendarProps) {
  const [viewDate, setViewDate] = useState(() => selected || new Date());
  const [view, setView] = useState<View>('days');
  const today = useMemo(() => new Date(), []);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
    }

    return cells;
  }, [year, month]);

  const yearRangeStart = Math.floor(year / 12) * 12;

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const prevYear = () => setViewDate(new Date(year - 1, month, 1));
  const nextYear = () => setViewDate(new Date(year + 1, month, 1));
  const prevYearRange = () => setViewDate(new Date(year - 12, month, 1));
  const nextYearRange = () => setViewDate(new Date(year + 12, month, 1));

  return (
    <div className={cn('p-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={view === 'days' ? prevMonth : view === 'months' ? prevYear : prevYearRange}
          aria-label="Previous"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'years')}
          className="text-sm font-medium hover:bg-secondary px-2 py-1 rounded-md transition-colors"
        >
          {view === 'days' && `${MONTHS[month]} ${year}`}
          {view === 'months' && `${year}`}
          {view === 'years' && `${yearRangeStart} – ${yearRangeStart + 11}`}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={view === 'days' ? nextMonth : view === 'months' ? nextYear : nextYearRange}
          aria-label="Next"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Year Grid */}
      {view === 'years' && (
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }, (_, i) => yearRangeStart + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => { setViewDate(new Date(y, month, 1)); setView('months'); }}
              className={cn(
                'py-2 rounded-md text-sm transition-colors',
                y === year ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                y === today.getFullYear() && y !== year && 'font-semibold text-primary',
              )}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Month Grid */}
      {view === 'months' && (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS_SHORT.map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => { setViewDate(new Date(year, i, 1)); setView('days'); }}
              className={cn(
                'py-2 rounded-md text-sm transition-colors',
                i === month && year === viewDate.getFullYear() ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                i === today.getMonth() && year === today.getFullYear() && i !== month && 'font-semibold text-primary',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Day Grid */}
      {view === 'days' && (
        <>
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>
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
        </>
      )}
    </div>
  );
}
