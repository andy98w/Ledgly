'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Users, Receipt, AlertTriangle, AlertCircle, Check, TrendingUp, Plus, Shield, Loader2, Wallet, ClipboardList } from 'lucide-react';
import { useDashboard } from '@/lib/queries/organizations';
import { useCreateMembers } from '@/lib/queries/members';
import { useAuthStore, useIsAdminOrTreasurer } from '@/lib/stores/auth';
import { formatCents, formatRelativeDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardHeader, MotionCardTitle, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
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
  const isAdmin = useIsAdminOrTreasurer();
  const { data: stats, isLoading } = useDashboard(currentOrgId);
  const { toast } = useToast();
  const createMembers = useCreateMembers();
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrgId || !adminName.trim() || !adminEmail.trim()) return;

    try {
      await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name: adminName.trim(), email: adminEmail.trim() || undefined, role: 'ADMIN' }],
      });
      toast({ title: `${adminName.trim()} added as admin` });
      setShowAddAdmin(false);
      setAdminName('');
      setAdminEmail('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add admin',
        variant: 'destructive',
      });
    }
  };

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
          delay={0}
        />
        <StatCard
          title="Collected"
          value={stats.totalCollectedCents}
          isMoney
          description="Total payments received"
          icon={TrendingUp}
          color="emerald"
          delay={0.1}
        />
        <StatCard
          title="Members"
          value={stats.memberCount}
          description="Active members"
          icon={Users}
          color="violet"
          delay={0.2}
        />
        <StatCard
          title="Overdue"
          value={stats.overdueCount}
          description={stats.overdueCount > 0 ? 'Need attention' : 'All up to date'}
          icon={AlertTriangle}
          color="rose"
          delay={0.3}
        />
      </div>

      {/* Quick Actions + Recent Payments */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <FadeIn delay={0.2} className="h-full">
          <MotionCard hover={false} data-tour="quick-actions" className="h-full flex flex-col">
            <MotionCardHeader>
              <MotionCardTitle className="text-lg">Quick Actions</MotionCardTitle>
            </MotionCardHeader>
            <MotionCardContent className="grid gap-3 flex-1">
              <Button asChild variant="outline" className="justify-start h-12 text-left">
                <Link href="/members">
                  <div className="p-2 rounded-lg bg-violet-500/10 mr-3">
                    <Users className="h-4 w-4 text-violet-500" />
                  </div>
                  <div>
                    <p className="font-medium">Add Members</p>
                    <p className="text-xs text-muted-foreground">Invite new members to your org</p>
                  </div>
                </Link>
              </Button>
              {isAdmin && (
                <>
                  <Button asChild variant="outline" className="justify-start h-12 text-left">
                    <Link href="/charges/new">
                      <div className="p-2 rounded-lg bg-amber-500/10 mr-3">
                        <Receipt className="h-4 w-4 text-amber-500" />
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
                  <Button asChild variant="outline" className="justify-start h-12 text-left">
                    <Link href="/expenses/new">
                      <div className="p-2 rounded-lg bg-rose-500/10 mr-3">
                        <Wallet className="h-4 w-4 text-rose-500" />
                      </div>
                      <div>
                        <p className="font-medium">Track Expense</p>
                        <p className="text-xs text-muted-foreground">Record organization spending</p>
                      </div>
                    </Link>
                  </Button>
                  <Button variant="outline" className="justify-start h-12 text-left" onClick={() => setShowAddAdmin(true)}>
                    <div className="p-2 rounded-lg bg-violet-500/10 mr-3">
                      <Shield className="h-4 w-4 text-violet-500" />
                    </div>
                    <div>
                      <p className="font-medium">Add Admin</p>
                      <p className="text-xs text-muted-foreground">Invite another admin to manage</p>
                    </div>
                  </Button>
                  <Button asChild variant="outline" className="justify-start h-12 text-left">
                    <Link href="/audit">
                      <div className="p-2 rounded-lg bg-cyan-500/10 mr-3">
                        <ClipboardList className="h-4 w-4 text-cyan-500" />
                      </div>
                      <div>
                        <p className="font-medium">Audit Log</p>
                        <p className="text-xs text-muted-foreground">Review recent activity</p>
                      </div>
                    </Link>
                  </Button>
                </>
              )}
            </MotionCardContent>
          </MotionCard>
        </FadeIn>

        {/* Recent Payments */}
        <FadeIn delay={0.3} className="h-full">
          <MotionCard hover={false} className="h-full flex flex-col">
            <MotionCardHeader className="flex flex-row items-center justify-between">
              <MotionCardTitle className="text-lg">Recent Payments</MotionCardTitle>
              <Button variant="ghost" size="sm" asChild className="text-primary">
                <Link href="/payments">
                  View all
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </MotionCardHeader>
            <MotionCardContent className="flex-1">
              {stats.recentPayments.length === 0 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="No payments yet"
                  description="Payments will appear here once recorded"
                />
              ) : (
                <StaggerChildren className="space-y-3">
                  {stats.recentPayments.slice(0, 5).map((payment: any, index: number) => (
                    <StaggerItem key={payment.id}>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-all duration-200">
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
                    </StaggerItem>
                  ))}
                </StaggerChildren>
              )}
            </MotionCardContent>
          </MotionCard>
        </FadeIn>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <FadeIn delay={0.35}>
          <RevenueChart />
        </FadeIn>
        <FadeIn delay={0.4}>
          <ExpenseChart />
        </FadeIn>
      </div>

      {/* Overdue Alert */}
      {stats.overdueCount > 0 && (
        <FadeIn delay={0.4}>
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
        </FadeIn>
      )}

      {/* Add Admin Dialog */}
      {isAdmin && <Dialog open={showAddAdmin} onOpenChange={setShowAddAdmin}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl">
          <form onSubmit={handleAddAdmin}>
            <DialogHeader>
              <DialogTitle>Add Admin</DialogTitle>
              <DialogDescription>
                Add a new administrator to your organization
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="admin-name" className="text-sm font-medium">Name *</Label>
                <Input
                  id="admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="John Doe"
                  className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email" className="text-sm font-medium">Email *</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  An invitation email will be sent to join as an admin.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddAdmin(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMembers.isPending}
               
              >
                {createMembers.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Admin'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
