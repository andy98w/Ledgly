'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MoneyProps {
  cents: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showSign?: boolean;
  animate?: boolean;
  className?: string;
  inline?: boolean;
}

const sizeClasses = {
  xs: 'text-sm font-medium',
  sm: 'text-lg font-semibold',
  md: 'text-2xl font-bold',
  lg: 'text-4xl font-bold',
  xl: 'text-5xl font-bold tracking-tight',
};

export function Money({
  cents,
  size = 'md',
  showSign = false,
  animate = true,
  className,
  inline = false,
}: MoneyProps) {
  const [displayValue, setDisplayValue] = useState(cents);
  const prevCents = useRef(cents);

  const spring = useSpring(cents, {
    stiffness: 100,
    damping: 30,
  });

  useEffect(() => {
    if (animate && prevCents.current !== cents) {
      spring.set(cents);
      prevCents.current = cents;
    } else {
      setDisplayValue(cents);
    }
  }, [cents, animate, spring]);

  useEffect(() => {
    if (animate) {
      return spring.on('change', (v) => {
        setDisplayValue(Math.round(v));
      });
    }
  }, [spring, animate]);

  const isPositive = displayValue >= 0;
  const absValue = Math.abs(displayValue);
  const dollars = Math.floor(absValue / 100);
  const centsRemaining = absValue % 100;

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absValue / 100);

  const sign = showSign ? (isPositive ? '+' : '-') : isPositive ? '' : '-';
  const colorClass = showSign
    ? isPositive
      ? 'text-success'
      : 'text-destructive'
    : '';

  return (
    <motion.span
      className={cn(
        'font-mono-numbers inline-flex items-baseline',
        sizeClasses[size],
        colorClass,
        className,
      )}
      initial={animate ? { opacity: 0, y: 5 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <span className="opacity-70 mr-0.5">{sign}$</span>
      <span>{formatted}</span>
    </motion.span>
  );
}

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
    <motion.div
      className={cn('space-y-1', className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <Money cents={cents} size="lg" />
      {sublabel && (
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      )}
    </motion.div>
  );
}
