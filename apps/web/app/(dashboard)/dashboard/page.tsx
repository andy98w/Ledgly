'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Users, Receipt, AlertTriangle, AlertCircle, TrendingUp, Sparkles, CreditCard, Check, Circle } from 'lucide-react';
import { useDashboard } from '@/lib/queries/organizations';
import { useInsights } from '@/lib/queries/insights';
import { useAuthStore } from '@/lib/stores/auth';
import { useAISidebarStore } from '@/lib/stores/ai-sidebar';
import { useAISuggestions } from '@/hooks/use-ai-suggestions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { MotionCard, MotionCardHeader, MotionCardTitle, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn } from '@/components/ui/page-transition';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import dynamic from 'next/dynamic';

const RevenueChart = dynamic(() => import('@/components/charts/revenue-chart').then((m) => m.RevenueChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full rounded-xl" />,
});
const ExpenseChart = dynamic(() => import('@/components/charts/expense-chart').then((m) => m.ExpenseChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full rounded-xl" />,
});

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-9 w-28 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

const CHECKLIST_DISMISSED_KEY = 'ledgly-checklist-dismissed';

function QuickStartChecklist({ stats }: { stats: any }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(CHECKLIST_DISMISSED_KEY)) setDismissed(true);
  }, []);

  const steps = [
    { label: 'Add members', description: 'Import from CSV or add one by one', href: '/members', done: stats.memberCount > 1, icon: Users },
    { label: 'Create a charge', description: 'Charge members for dues, events, or fees', href: '/charges', done: stats.openChargesCount > 0 || stats.totalCollectedCents > 0, icon: Receipt },
    { label: 'Set up payment methods', description: 'Add Venmo, Zelle, or CashApp handles', href: '/settings', done: stats.hasPaymentHandles, icon: CreditCard },
    { label: 'Record a payment', description: 'Import from bank, email, or add manually', href: '/payments', done: stats.paymentsCount, icon: TrendingUp },
    { label: 'Try LedgelyAI', description: 'Manage finances with natural language', href: '/agent', done: false, icon: Sparkles },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  if (dismissed || allDone) return null;

  return (
    <FadeIn delay={0.05}>
      <MotionCard hover={false}>
        <MotionCardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Get started</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{completedCount} of {steps.length} completed</p>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => {
              localStorage.setItem(CHECKLIST_DISMISSED_KEY, 'true');
              setDismissed(true);
            }}>
              Dismiss
            </Button>
          </div>
          <div className="w-full h-1.5 rounded-full bg-secondary mb-4">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <div className="space-y-1">
            {steps.map((step) => (
              <Link
                key={step.label}
                href={step.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  step.done ? 'opacity-60' : 'hover:bg-secondary/50',
                )}
              >
                {step.done ? (
                  <div className="p-1 rounded-full bg-emerald-500/10">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                ) : (
                  <div className="p-1 rounded-full bg-secondary">
                    <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', step.done && 'line-through text-muted-foreground')}>{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                {!step.done && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </Link>
            ))}
          </div>
        </MotionCardContent>
      </MotionCard>
    </FadeIn>
  );
}

export default function DashboardPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data: stats, isLoading, isError, refetch } = useDashboard(currentOrgId);
  const { data: insightsData } = useInsights(currentOrgId);
  const insights = Array.isArray(insightsData) ? insightsData as any[] : [];
  const suggestions = useAISuggestions(stats);
  const openAISidebar = useAISidebarStore((s) => s.open);

  if (isLoading) {
    return (
      <div className="space-y-10">
        <div>
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <Skeleton className="h-6 w-40" />
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Failed to load dashboard"
        description="Something went wrong loading your data."
        action={<Button onClick={() => refetch()} variant="outline">Try Again</Button>}
        className="rounded-xl border border-border/50 bg-card/50"
      />
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Dashboard"
          helpText="Overview of your organization finances — unpaid dues, collections, member count, and overdue items."
        />
      </FadeIn>

      {/* Quick-start Checklist */}
      <QuickStartChecklist stats={stats} />

      {/* Stats Grid */}
      <div data-tour="dashboard-stats" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Unpaid"
          value={stats.totalOutstandingCents}
          isMoney
          description={`${stats.openChargesCount} unpaid dues`}
          icon={Receipt}
          color="amber"
        />
        <StatCard
          title="Collected"
          value={stats.totalCollectedCents}
          isMoney
          description="Total payments received"
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          title="Members"
          value={stats.memberCount}
          description="Active members"
          icon={Users}
          color="violet"
        />
        <StatCard
          title="Overdue"
          value={stats.overdueCount}
          description={stats.overdueCount > 0 ? 'Need attention' : 'All up to date'}
          icon={AlertTriangle}
          color="rose"
        />
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <FadeIn delay={0.12}>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Suggestions</span>
            </div>
            <div className="space-y-1">
              {suggestions.map((s) => (
                <div key={s.type} className="flex items-center justify-between py-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn(
                      'shrink-0 w-1.5 h-1.5 rounded-full',
                      s.priority === 'high' ? 'bg-rose-500' : s.priority === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground/40',
                    )} />
                    <span className="text-sm text-muted-foreground truncate">{s.message}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs shrink-0 ml-3"
                    onClick={() => openAISidebar(s.prompt)}
                  >
                    {s.action}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <FadeIn delay={0.15}>
          <MotionCard hover={false} className="border-amber-500/20">
            <MotionCardHeader>
              <MotionCardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                </div>
                Insights
              </MotionCardTitle>
            </MotionCardHeader>
            <MotionCardContent className="space-y-2">
              {insights.map((insight: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                  <AlertTriangle className={cn(
                    'h-4 w-4 mt-0.5 shrink-0',
                    insight.severity === 'warning' ? 'text-amber-500' : 'text-muted-foreground',
                  )} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{insight.title}</p>
                    {insight.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5">{insight.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </MotionCardContent>
          </MotionCard>
        </FadeIn>
      )}

      <FadeIn delay={0.2}>
        <ActivityFeed />
      </FadeIn>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart />
        <ExpenseChart />
      </div>

      {/* Overdue Alert */}
      {stats.overdueCount > 0 && (
        <Alert
          variant="destructive"
          title="Overdue Charges"
          description={`${stats.overdueCount} charges are past their due date`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/charges?overdue=true">View Overdue Charges</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
