'use client';

import Link from 'next/link';
import { ArrowRight, Users, Receipt, AlertTriangle, TrendingUp, Plus } from 'lucide-react';
import { useDashboard } from '@/lib/queries/organizations';
import { useAuthStore } from '@/lib/stores/auth';
import { formatCents, formatRelativeDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardHeader, MotionCardTitle, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';

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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your organization finances</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
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
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your organization finances</p>
        </div>
      </FadeIn>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Outstanding"
          value={stats.totalOutstandingCents}
          isMoney
          description={`${stats.openChargesCount} open charges`}
          icon={Receipt}
          delay={0}
        />
        <StatCard
          title="Collected"
          value={stats.totalCollectedCents}
          isMoney
          description="Total payments received"
          icon={TrendingUp}
          delay={0.1}
        />
        <StatCard
          title="Members"
          value={stats.memberCount}
          description="Active members"
          icon={Users}
          delay={0.2}
        />
        <StatCard
          title="Overdue"
          value={stats.overdueCount}
          description={stats.overdueCount > 0 ? 'Need attention' : 'All up to date'}
          icon={AlertTriangle}
          delay={0.3}
        />
      </div>

      {/* Quick Actions + Recent Payments */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <FadeIn delay={0.2}>
          <MotionCard hover={false}>
            <MotionCardHeader>
              <MotionCardTitle className="text-lg">Quick Actions</MotionCardTitle>
            </MotionCardHeader>
            <MotionCardContent className="grid gap-3">
              <Button asChild variant="outline" className="justify-start h-12 text-left">
                <Link href="/members">
                  <div className="p-2 rounded-lg bg-primary/10 mr-3">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Add Members</p>
                    <p className="text-xs text-muted-foreground">Invite new members to your org</p>
                  </div>
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start h-12 text-left">
                <Link href="/charges/new">
                  <div className="p-2 rounded-lg bg-primary/10 mr-3">
                    <Receipt className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Create Charge</p>
                    <p className="text-xs text-muted-foreground">Bill dues, fees, or fines</p>
                  </div>
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start h-12 text-left">
                <Link href="/payments/new">
                  <div className="p-2 rounded-lg bg-success/10 mr-3">
                    <TrendingUp className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="font-medium">Record Payment</p>
                    <p className="text-xs text-muted-foreground">Log a payment received</p>
                  </div>
                </Link>
              </Button>
            </MotionCardContent>
          </MotionCard>
        </FadeIn>

        {/* Recent Payments */}
        <FadeIn delay={0.3}>
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
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <TrendingUp className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No payments yet</p>
                </div>
              ) : (
                <StaggerChildren className="space-y-3">
                  {stats.recentPayments.slice(0, 5).map((payment: any, index: number) => (
                    <StaggerItem key={payment.id}>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                        <div className="flex items-center gap-3">
                          <AvatarGradient
                            name={payment.rawPayerName || 'Unknown'}
                            size="sm"
                          />
                          <div>
                            <p className="font-medium text-sm">
                              {payment.rawPayerName || 'Payment'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeDate(payment.paidAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Money cents={payment.amountCents} size="sm" />
                          {payment.unallocatedCents > 0 && (
                            <Badge variant="warning" className="text-xs">
                              Unallocated
                            </Badge>
                          )}
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerChildren>
              )}
            </MotionCardContent>
          </MotionCard>
        </FadeIn>
      </div>

      {/* Overdue Alert */}
      {stats.overdueCount > 0 && (
        <FadeIn delay={0.4}>
          <div
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 animate-in-scale"
          >
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-destructive">Overdue Charges</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.overdueCount} charges are past their due date
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/charges?overdue=true">View Overdue Charges</Link>
                </Button>
              </div>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
