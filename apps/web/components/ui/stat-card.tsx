'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Money } from './money';
import { useAnimatedValue } from '@/hooks/use-animated-value';

type StatCardColor = 'primary' | 'amber' | 'emerald' | 'violet' | 'rose';

const colorMap: Record<StatCardColor, { iconBg: string; iconText: string; gradient: string; hoverBorder: string }> = {
  primary: { iconBg: 'bg-primary/10', iconText: 'text-primary', gradient: 'from-primary/5', hoverBorder: 'hover:border-primary/30' },
  amber: { iconBg: 'bg-amber-500/10', iconText: 'text-amber-500', gradient: 'from-amber-500/5', hoverBorder: 'hover:border-amber-500/30' },
  emerald: { iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-500', gradient: 'from-emerald-500/5', hoverBorder: 'hover:border-emerald-500/30' },
  violet: { iconBg: 'bg-violet-500/10', iconText: 'text-violet-500', gradient: 'from-violet-500/5', hoverBorder: 'hover:border-violet-500/30' },
  rose: { iconBg: 'bg-rose-500/10', iconText: 'text-rose-500', gradient: 'from-rose-500/5', hoverBorder: 'hover:border-rose-500/30' },
};

interface StatCardProps {
  title: string;
  value: number | string;
  isMoney?: boolean;
  description?: string;
  icon?: LucideIcon;
  color?: StatCardColor;
  trend?: 'up' | 'down' | 'neutral';
  delay?: number;
  className?: string;
}

/** Extract a leading number and trailing suffix from a string like "85%" → [85, "%"] */
function parseNumericString(val: string): [number, string] | null {
  const match = val.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  return [Number(match[1]), match[2]];
}

function AnimatedNumber({ value }: { value: number | string }) {
  // Pure number
  if (typeof value === 'number') {
    const animated = useAnimatedValue(value, true);
    return <>{animated.toLocaleString()}</>;
  }

  // String with a leading number (e.g. "85%", "12 items")
  const parsed = parseNumericString(value);
  if (parsed) {
    const [num, suffix] = parsed;
    const animated = useAnimatedValue(num, true);
    return <>{animated.toLocaleString()}{suffix}</>;
  }

  // Plain string — no animation
  return <>{value}</>;
}

export function StatCard({
  title,
  value,
  isMoney = false,
  description,
  icon: Icon,
  color = 'primary',
  trend,
  delay = 0,
  className,
}: StatCardProps) {
  const colors = colorMap[color];
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-5 animate-in-up shadow-layered-sm',
        `${colors.hoverBorder} hover:shadow-layered-md transition-all duration-200`,
        className,
      )}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {/* Subtle gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} to-transparent pointer-events-none`} />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {Icon && (
            <div className={`p-2 rounded-lg ${colors.iconBg}`}>
              <Icon className={`h-4 w-4 ${colors.iconText}`} />
            </div>
          )}
        </div>

        {isMoney ? (
          <Money cents={value as number} size="lg" />
        ) : (
          <p className="text-3xl font-bold tracking-tight truncate font-mono-numbers">
            <AnimatedNumber value={value} />
          </p>
        )}

        {description && (
          <p className="text-xs text-muted-foreground mt-2">{description}</p>
        )}
      </div>
    </div>
  );
}
