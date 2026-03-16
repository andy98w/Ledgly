'use client';

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { usePayments } from '@/lib/queries/payments';
import { useAuthStore } from '@/lib/stores/auth';
import { formatCents } from '@/lib/utils';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const RANGE_OPTIONS = [
  { value: '3', label: 'Last 3 months' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export function RevenueChart() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data: paymentsData, isLoading } = usePayments(currentOrgId, { limit: 500 });
  const [range, setRange] = useState('6');

  const chartData = useMemo(() => {
    if (!paymentsData?.data) return [];

    const now = new Date();

    if (range === 'all') {
      const allDates = paymentsData.data.map(p => new Date(p.paidAt));
      if (allDates.length === 0) return [];
      const earliest = new Date(Math.min(...allDates.map(d => d.getTime())));
      const monthCount = (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()) + 1;
      const months: { key: string; label: string }[] = [];
      for (let i = monthCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: getMonthKey(d), label: getMonthLabel(d) });
      }
      const collected: Record<string, number> = {};
      months.forEach(m => { collected[m.key] = 0; });
      for (const payment of paymentsData.data) {
        const key = getMonthKey(new Date(payment.paidAt));
        if (collected[key] !== undefined) collected[key] += payment.amountCents;
      }
      return months.map(m => ({ name: m.label, collected: collected[m.key] / 100 }));
    }

    if (range === '12') {
      const jan = new Date(now.getFullYear(), 0, 1);
      const monthCount = now.getMonth() + 1;
      const months: { key: string; label: string }[] = [];
      for (let i = 0; i < monthCount; i++) {
        const d = new Date(jan.getFullYear(), jan.getMonth() + i, 1);
        months.push({ key: getMonthKey(d), label: getMonthLabel(d) });
      }
      const collected: Record<string, number> = {};
      months.forEach(m => { collected[m.key] = 0; });
      for (const payment of paymentsData.data) {
        const key = getMonthKey(new Date(payment.paidAt));
        if (collected[key] !== undefined) collected[key] += payment.amountCents;
      }
      return months.map(m => ({ name: m.label, collected: collected[m.key] / 100 }));
    }

    const count = parseInt(range);
    const months: { key: string; label: string }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: getMonthKey(d), label: getMonthLabel(d) });
    }
    const collected: Record<string, number> = {};
    months.forEach(m => { collected[m.key] = 0; });
    for (const payment of paymentsData.data) {
      const key = getMonthKey(new Date(payment.paidAt));
      if (collected[key] !== undefined) collected[key] += payment.amountCents;
    }
    return months.map(m => ({ name: m.label, collected: collected[m.key] / 100 }));
  }, [paymentsData, range]);

  if (isLoading) {
    return (
      <MotionCard hover={false}>
        <MotionCardHeader>
          <MotionCardTitle className="text-lg">Revenue Overview</MotionCardTitle>
        </MotionCardHeader>
        <MotionCardContent>
          <Skeleton className="w-full h-[280px] rounded-lg" />
        </MotionCardContent>
      </MotionCard>
    );
  }

  const hasData = chartData.some((d) => d.collected > 0);

  return (
    <MotionCard hover={false}>
      <MotionCardHeader>
        <div className="flex items-center justify-between">
          <MotionCardTitle className="text-lg">Revenue Overview</MotionCardTitle>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </MotionCardHeader>
      <MotionCardContent>
        {!hasData ? (
          <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
            No payment data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}
                formatter={((value: any) => [formatCents(Math.round((value ?? 0) * 100)), 'Collected']) as any}
              />
              <Bar
                dataKey="collected"
                fill="hsl(var(--primary))"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </MotionCardContent>
    </MotionCard>
  );
}
