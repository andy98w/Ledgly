'use client';

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useExpenseSummary } from '@/lib/queries/expenses';
import { useAuthStore } from '@/lib/stores/auth';
import { formatCents } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS } from '@ledgly/shared';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { Skeleton } from '@/components/ui/skeleton';

const COLORS = [
  'hsl(221, 83%, 53%)',  // blue
  'hsl(262, 83%, 58%)',  // violet
  'hsl(346, 77%, 50%)',  // rose
  'hsl(25, 95%, 53%)',   // orange
  'hsl(142, 71%, 45%)',  // green
  'hsl(199, 89%, 48%)',  // cyan
  'hsl(47, 96%, 53%)',   // amber
];

export function ExpenseChart() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data: summary, isLoading } = useExpenseSummary(currentOrgId);

  const chartData = useMemo(() => {
    if (!summary?.byCategory) return [];

    return Object.entries(summary.byCategory)
      .filter(([, cents]) => cents > 0)
      .map(([category, cents]) => ({
        name: EXPENSE_CATEGORY_LABELS[category as keyof typeof EXPENSE_CATEGORY_LABELS] || category,
        value: cents / 100,
        cents,
      }))
      .sort((a, b) => b.value - a.value);
  }, [summary]);

  if (isLoading) {
    return (
      <MotionCard hover={false}>
        <MotionCardHeader>
          <MotionCardTitle className="text-lg">Expense Breakdown</MotionCardTitle>
        </MotionCardHeader>
        <MotionCardContent>
          <Skeleton className="w-full h-[280px] rounded-lg" />
        </MotionCardContent>
      </MotionCard>
    );
  }

  const hasData = chartData.length > 0;

  return (
    <MotionCard hover={false}>
      <MotionCardHeader>
        <MotionCardTitle className="text-lg">Expense Breakdown</MotionCardTitle>
      </MotionCardHeader>
      <MotionCardContent>
        {!hasData ? (
          <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
            No expense data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={index}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                formatter={((value: any, name: any, entry: any) => [
                  formatCents(entry?.payload?.cents ?? 0),
                  name,
                ]) as any}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}>
                    {value}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </MotionCardContent>
    </MotionCard>
  );
}
