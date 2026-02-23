import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Money } from './money';

interface StatCardProps {
  title: string;
  value: number | string;
  isMoney?: boolean;
  description?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  delay?: number;
  className?: string;
}

export function StatCard({
  title,
  value,
  isMoney = false,
  description,
  icon: Icon,
  trend,
  delay = 0,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-5 animate-in-up',
        'hover:border-primary/30 transition-colors',
        className,
      )}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {Icon && (
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>

        {isMoney ? (
          <Money cents={value as number} size="lg" />
        ) : (
          <p className="text-3xl font-bold tracking-tight">{value}</p>
        )}

        {description && (
          <p className="text-xs text-muted-foreground mt-2">{description}</p>
        )}
      </div>
    </div>
  );
}
