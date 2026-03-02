import { Skeleton } from '@/components/ui/skeleton';

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <Skeleton className="h-5 w-36 mb-4" />
      <Skeleton className="w-full rounded-lg" style={{ height }} />
    </div>
  );
}
