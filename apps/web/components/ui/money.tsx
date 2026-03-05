'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useAnimatedValue } from '@/hooks/use-animated-value';

interface MoneyProps {
  cents: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
  animate?: boolean;
  className?: string;
  inline?: boolean;
}

const sizeClasses = {
  xs: 'text-xs font-medium',
  sm: 'text-base font-semibold',
  md: 'text-xl font-bold',
  lg: 'text-3xl font-bold',
  xl: 'text-4xl font-bold tracking-tight',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const Money = memo(function Money({
  cents,
  size = 'md',
  showSign = false,
  animate = true,
  className,
  inline = false,
}: MoneyProps) {
  const displayValue = useAnimatedValue(cents, animate);

  const isPositive = displayValue >= 0;
  const formatted = currencyFormatter.format(Math.abs(displayValue) / 100);

  const sign = showSign ? (isPositive ? '+' : '-') : isPositive ? '' : '-';
  const colorClass = showSign
    ? isPositive
      ? 'text-success'
      : 'text-destructive'
    : '';

  return (
    <span
      className={cn(
        'font-mono-numbers inline-flex items-baseline whitespace-nowrap',
        sizeClasses[size],
        colorClass,
        className,
      )}
    >
      <span className="opacity-70 mr-0.5">{sign}$</span>
      <span>{formatted}</span>
    </span>
  );
});

interface MoneyDisplayProps {
  cents: number;
  label: string;
  sublabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function MoneyDisplay({
  cents,
  label,
  sublabel,
  trend,
  className,
}: MoneyDisplayProps) {
  return (
    <div
      className={cn('space-y-1', className)}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <Money cents={cents} size="lg" />
      {sublabel && (
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}
