import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva(
  'rounded-xl border p-5',
  {
    variants: {
      variant: {
        info: 'border-primary/30 bg-primary/5',
        warning: 'border-warning/30 bg-warning/5',
        destructive: 'border-destructive/30 bg-destructive/5',
        success: 'border-success/30 bg-success/5',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  },
);

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  destructive: AlertCircle,
  success: CheckCircle2,
};

const iconColorMap = {
  info: 'text-primary',
  warning: 'text-warning',
  destructive: 'text-destructive',
  success: 'text-success',
};

const iconBgMap = {
  info: 'bg-primary/10',
  warning: 'bg-warning/10',
  destructive: 'bg-destructive/10',
  success: 'bg-success/10',
};

const titleColorMap = {
  info: 'text-primary',
  warning: 'text-warning',
  destructive: 'text-destructive',
  success: 'text-success',
};

interface AlertProps extends VariantProps<typeof alertVariants> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function Alert({ variant = 'info', title, description, icon, action, className }: AlertProps) {
  const v = variant ?? 'info';
  const DefaultIcon = iconMap[v];

  return (
    <div className={cn(alertVariants({ variant }), className)}>
      <div className="flex items-start gap-4">
        <div className={cn('p-2 rounded-lg', iconBgMap[v])}>
          {icon ?? <DefaultIcon className={cn('h-5 w-5', iconColorMap[v])} />}
        </div>
        <div className="flex-1">
          <h3 className={cn('font-semibold', titleColorMap[v])}>{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}
