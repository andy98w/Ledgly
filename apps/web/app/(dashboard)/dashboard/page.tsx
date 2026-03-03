'use client';

import Link from 'next/link';
import { ArrowRight, Users, Receipt, AlertTriangle, AlertCircle, Check, TrendingUp } from 'lucide-react';
import { useDashboard } from '@/lib/queries/organizations';
import { useAuthStore } from '@/lib/stores/auth';
import { formatCents, formatRelativeDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardHeader, MotionCardTitle, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn } from '@/components/ui/page-transition';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/empty-state';
import { RevenueChart } from '@/components/charts/revenue-chart';
import { ExpenseChart } from '@/components/charts/expense-chart';

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-9 w-28 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export default function DashboardPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data: stats, isLoading } = useDashboard(currentOrgId);

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

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load dashboard</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Dashboard"
          helpText="Overview of your organization finances — outstanding charges, collections, member count, and overdue items."
        />
      </FadeIn>

      {/* Stats Grid */}
      <div data-tour="dashboard-stats" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Outstanding"
          value={stats.totalOutstandingCents}
          isMoney
          description={`${stats.openChargesCount} open charges`}
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

      {/* Recent Payments */}
      <MotionCard hover={false}>
        <MotionCardHeader className="flex flex-row items-center justify-between">
          <MotionCardTitle className="text-lg">Recent Payments</MotionCardTitle>
          <Button variant="ghost" size="sm" asChild className="text-primary">
            <Link href="/payments">
              View all
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </MotionCardHeader>
        <MotionCardContent>
          {stats.recentPayments.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No payments yet"
              description="Payments will appear here once recorded"
            />
          ) : (
            <div className="space-y-3">
              {stats.recentPayments.slice(0, 5).map((payment: any) => (
                <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors duration-150">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <AvatarGradient
                      name={payment.rawPayerName || 'Unknown'}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {payment.rawPayerName || 'Payment'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeDate(payment.paidAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Money cents={payment.amountCents} size="sm" />
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            {payment.unallocatedCents > 0 ? (
                              <AlertCircle className="w-4 h-4 text-warning" />
                            ) : (
                              <Check className="w-4 h-4 text-success" />
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{payment.unallocatedCents > 0 ? 'Unallocated' : 'Allocated'}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))}
            </div>
          )}
        </MotionCardContent>
      </MotionCard>

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
