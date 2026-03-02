import { Skeleton } from '@/components/ui/skeleton';

const WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-1/3'];

export function TableSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border/50 bg-secondary/30">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-20" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex items-center gap-4 px-4 py-3.5 border-b border-border/30 last:border-0"
        >
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton
              key={col}
              className={`h-4 ${WIDTHS[(row + col) % WIDTHS.length]}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
