import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12', className)}>
      {/* Decorative rings */}
      <div className="relative mb-4">
        <div className="absolute inset-0 -m-3 rounded-full border border-border/50" />
        <div className="absolute inset-0 -m-6 rounded-full border border-border/30" />
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center relative">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      </div>
      <h3 className="font-semibold mt-2">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
