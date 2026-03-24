'use client';

import { useState, useMemo } from 'react';
import { BarChart3, Receipt, TrendingUp, Percent, Users, Download, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useCollectionReport, useOutstandingReport, usePeriodComparison } from '@/lib/queries/reports';
import { useAuthStore } from '@/lib/stores/auth';
import { formatCents, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { Badge } from '@/components/ui/badge';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { FadeIn } from '@/components/ui/page-transition';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { exportCSV } from '@/lib/export';

type Preset = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'YTD' | 'LAST_YEAR' | 'ALL';

function getDateRange(preset: Preset): { start?: string; end?: string; prevStart?: string; prevEnd?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.toISOString().slice(0, 10);

  switch (preset) {
    case 'THIS_MONTH': {
      const start = new Date(y, m, 1).toISOString().slice(0, 10);
      const prevStart = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const prevEnd = new Date(y, m, 0).toISOString().slice(0, 10);
      return { start, end: today, prevStart, prevEnd };
    }
    case 'LAST_MONTH': {
      const start = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const end = new Date(y, m, 0).toISOString().slice(0, 10);
      const prevStart = new Date(y, m - 2, 1).toISOString().slice(0, 10);
      const prevEnd = new Date(y, m - 1, 0).toISOString().slice(0, 10);
      return { start, end, prevStart, prevEnd };
    }
    case 'THIS_QUARTER': {
      const qStart = Math.floor(m / 3) * 3;
      const start = new Date(y, qStart, 1).toISOString().slice(0, 10);
      const prevStart = new Date(y, qStart - 3, 1).toISOString().slice(0, 10);
      const prevEnd = new Date(y, qStart, 0).toISOString().slice(0, 10);
      return { start, end: today, prevStart, prevEnd };
    }
    case 'YTD': {
      const start = new Date(y, 0, 1).toISOString().slice(0, 10);
      const prevStart = new Date(y - 1, 0, 1).toISOString().slice(0, 10);
      const prevEnd = new Date(y - 1, m, now.getDate()).toISOString().slice(0, 10);
      return { start, end: today, prevStart, prevEnd };
    }
    case 'LAST_YEAR': {
      const start = new Date(y - 1, 0, 1).toISOString().slice(0, 10);
      const end = new Date(y - 1, 11, 31).toISOString().slice(0, 10);
      const prevStart = new Date(y - 2, 0, 1).toISOString().slice(0, 10);
      const prevEnd = new Date(y - 2, 11, 31).toISOString().slice(0, 10);
      return { start, end, prevStart, prevEnd };
    }
    case 'ALL':
    default:
      return {};
  }
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('THIS_MONTH');
  const currentOrgId = useAuthStore((s) => s.currentOrgId);

  const range = useMemo(() => getDateRange(preset), [preset]);

  const { data: collectionReportRaw, isLoading: loadingCollection, isError: errorCollection, refetch: refetchCollection } =
    useCollectionReport(currentOrgId, { start: range.start, end: range.end });
  const { data: outstandingReportRaw, isLoading: loadingOutstanding } =
    useOutstandingReport(currentOrgId);
  const { data: comparisonReportRaw } =
    usePeriodComparison(currentOrgId, {
      currentStart: range.start,
      currentEnd: range.end,
      prevStart: range.prevStart,
      prevEnd: range.prevEnd,
    });

  const collectionReport = collectionReportRaw as any;
  const outstandingReport = outstandingReportRaw as any;
  const comparisonReport = comparisonReportRaw as any;

  const totalCharged = collectionReport?.totalChargedCents ?? 0;
  const totalCollected = collectionReport?.totalCollectedCents ?? 0;
  const collectionRate = totalCharged > 0 ? Math.round((totalCollected / totalCharged) * 100) : 0;
  const outstanding = totalCharged - totalCollected;

  const chartData = useMemo(() => {
    if (!collectionReport?.monthlyBreakdown) return [];
    return collectionReport.monthlyBreakdown.map((m: any) => ({
      name: m.month,
      charged: (m.charged ?? 0) / 100,
      collected: (m.collected ?? 0) / 100,
    }));
  }, [collectionReport]);

  const handleExportOutstanding = () => {
    const members = outstandingReport?.members || [];
    const headers = ['Member', 'Charged', 'Paid', 'Balance'];
    const rows = members.map((m: any) => [
      m.memberName,
      `$${(m.totalChargedCents / 100).toFixed(2)}`,
      `$${(m.totalPaidCents / 100).toFixed(2)}`,
      `$${(m.balanceCents / 100).toFixed(2)}`,
    ]);
    exportCSV(headers, rows, `outstanding-${new Date().toISOString().slice(0, 10)}`);
  };

  if (loadingCollection) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-9 w-48 mb-2" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5">
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-9 w-28 mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  if (errorCollection) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Failed to load reports"
        description="Something went wrong loading report data."
        action={<Button onClick={() => refetchCollection()} variant="outline">Try Again</Button>}
        className="rounded-xl border border-border/50 bg-card/50"
      />
    );
  }

  return (
    <div className="space-y-8">
      <FadeIn>
        <PageHeader
          title="Reports"
          helpText="Financial overview — collection rates, outstanding balances, and period comparisons."
          actions={
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="w-[160px] h-9 bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="THIS_MONTH">This Month</SelectItem>
                <SelectItem value="LAST_MONTH">Last Month</SelectItem>
                <SelectItem value="THIS_QUARTER">This Quarter</SelectItem>
                <SelectItem value="YTD">Year to Date</SelectItem>
                <SelectItem value="LAST_YEAR">Last Year</SelectItem>
                <SelectItem value="ALL">All Time</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </FadeIn>

      {/* Collection Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Charged" value={totalCharged} isMoney icon={Receipt} color="amber" />
        <StatCard title="Total Collected" value={totalCollected} isMoney icon={TrendingUp} color="emerald" />
        <StatCard title="Collection Rate" value={`${collectionRate}%`} description="of charges collected" icon={Percent} color="violet" />
        <StatCard title="Outstanding" value={outstanding} isMoney description="remaining balance" icon={Users} color="rose" />
      </div>

      {/* Monthly Chart */}
      {chartData.length > 0 && (
        <FadeIn delay={0.1}>
          <MotionCard hover={false}>
            <MotionCardHeader>
              <MotionCardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                Monthly Breakdown
              </MotionCardTitle>
            </MotionCardHeader>
            <MotionCardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '0.875rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 500 }}
                    formatter={((value: any, name: string) => [
                      formatCents(Math.round((value ?? 0) * 100)),
                      name === 'charged' ? 'Charged' : 'Collected',
                    ]) as any}
                  />
                  <Legend formatter={(v) => (v === 'charged' ? 'Charged' : 'Collected')} />
                  <Bar dataKey="charged" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} maxBarSize={32} opacity={0.3} />
                  <Bar dataKey="collected" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </MotionCardContent>
          </MotionCard>
        </FadeIn>
      )}

      {/* Outstanding by Member */}
      <FadeIn delay={0.2}>
        <MotionCard hover={false}>
          <MotionCardHeader className="flex flex-row items-center justify-between">
            <MotionCardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <Users className="h-4 w-4 text-rose-500" />
              </div>
              Outstanding by Member
            </MotionCardTitle>
            {(outstandingReport?.members?.length ?? 0) > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportOutstanding}>
                <Download className="w-4 h-4 mr-1.5" />
                Export CSV
              </Button>
            )}
          </MotionCardHeader>
          <MotionCardContent>
            {loadingOutstanding ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : !outstandingReport?.members?.length ? (
              <EmptyState
                icon={Users}
                title="No outstanding balances"
                description="All members are paid up."
              />
            ) : (
              <div className="space-y-2">
                {outstandingReport.members
                  .sort((a: any, b: any) => b.balanceCents - a.balanceCents)
                  .map((member: any) => (
                    <div key={member.memberName} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <AvatarGradient name={member.memberName} size="sm" />
                        <span className="text-sm font-medium truncate">{member.memberName}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm tabular-nums shrink-0">
                        <span className="text-muted-foreground hidden sm:block">{formatCents(member.totalChargedCents)}</span>
                        <span className="text-muted-foreground hidden sm:block">{formatCents(member.totalPaidCents)}</span>
                        <Money cents={member.balanceCents} size="sm" className={member.balanceCents > 0 ? 'text-destructive' : 'text-success'} />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </MotionCardContent>
        </MotionCard>
      </FadeIn>

      {/* Period Comparison */}
      {comparisonReport && (
        <FadeIn delay={0.3}>
          <div className="grid gap-4 md:grid-cols-2">
            <MotionCard hover={false}>
              <MotionCardHeader>
                <MotionCardTitle className="text-base">Current Period</MotionCardTitle>
              </MotionCardHeader>
              <MotionCardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dues & Fees Created</span>
                  <span className="font-medium">{comparisonReport.current?.chargesCreated ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payments Received</span>
                  <span className="font-medium">{comparisonReport.current?.paymentsReceived ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Collection Rate</span>
                  <span className="font-medium">{comparisonReport.current?.collectionRate ?? 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Collected</span>
                  <span className="font-medium">{formatCents(comparisonReport.current?.totalCollectedCents ?? 0)}</span>
                </div>
              </MotionCardContent>
            </MotionCard>
            <MotionCard hover={false}>
              <MotionCardHeader>
                <MotionCardTitle className="text-base flex items-center gap-2">
                  Previous Period
                  {comparisonReport.changes && (
                    <Badge variant="outline" className={cn(
                      'text-xs',
                      (comparisonReport.changes.collectionRate ?? 0) >= 0
                        ? 'bg-success/10 text-success border-success/30'
                        : 'bg-destructive/10 text-destructive border-destructive/30',
                    )}>
                      {(comparisonReport.changes.collectionRate ?? 0) >= 0 ? '+' : ''}
                      {comparisonReport.changes.collectionRate ?? 0}% rate
                    </Badge>
                  )}
                </MotionCardTitle>
              </MotionCardHeader>
              <MotionCardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Dues & Fees Created</span>
                  <span className="font-medium">{comparisonReport.previous?.chargesCreated ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Payments Received</span>
                  <span className="font-medium">{comparisonReport.previous?.paymentsReceived ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Collection Rate</span>
                  <span className="font-medium">{comparisonReport.previous?.collectionRate ?? 0}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Collected</span>
                  <span className="font-medium">{formatCents(comparisonReport.previous?.totalCollectedCents ?? 0)}</span>
                </div>
              </MotionCardContent>
            </MotionCard>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
