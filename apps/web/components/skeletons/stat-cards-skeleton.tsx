import { Skeleton } from '@/components/ui/skeleton';

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/50 bg-card p-5">
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-9 w-28 mb-2" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
