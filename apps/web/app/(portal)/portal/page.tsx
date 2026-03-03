'use client';

import { Receipt, CreditCard, TrendingUp, Wallet, AlertCircle, Check, CheckCircle2, Clock } from 'lucide-react';
import { useMyMembership } from '@/lib/queries/portal';
import { useAuthStore } from '@/lib/stores/auth';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { StatCard } from '@/components/ui/stat-card';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/empty-state';

export default function PortalPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const { data: member, isLoading } = useMyMembership(currentOrgId);

  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);
  const firstName = member?.displayName?.split(' ')[0] || user?.name?.split(' ')[0] || 'there';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-24 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!member) {
    return (
      <FadeIn>
        <EmptyState
          icon={Receipt}
          title="No membership found"
          description="We couldn't find your membership details. Please contact your organization admin."
        />
      </FadeIn>
    );
  }

  const hasBalance = member.balanceCents > 0;

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <FadeIn>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hi, {firstName}</h1>
          {currentMembership?.orgName && (
            <p className="text-muted-foreground mt-1">{currentMembership.orgName}</p>
          )}
        </div>
      </FadeIn>

      {/* Balance Banner */}
      <FadeIn delay={0.05}>
        {hasBalance ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Amount Due</p>
                <Money cents={member.balanceCents} size="lg" className="mt-1" />
                {member.overdueCharges > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Clock className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-sm text-destructive font-medium">
                      {member.overdueCharges} overdue {member.overdueCharges === 1 ? 'charge' : 'charges'}
                    </span>
                  </div>
                )}
              </div>
              <div className="p-3 rounded-xl bg-destructive/10">
                <Wallet className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-success/20 bg-success/5 p-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-success/10">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="font-semibold text-success">You're all paid up</p>
                <p className="text-sm text-muted-foreground mt-0.5">No outstanding balance</p>
              </div>
            </div>
          </div>
        )}
      </FadeIn>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Charged"
          value={member.totalChargedCents}
          isMoney
          description="All time charges"
          icon={Receipt}
          delay={0}
        />
        <StatCard
          title="Total Paid"
          value={member.totalPaidCents}
          isMoney
          description="All time payments"
          icon={TrendingUp}
          delay={0.1}
        />
        <StatCard
          title="Current Balance"
          value={member.balanceCents}
          isMoney
          description={hasBalance ? 'Amount owed' : 'All paid up'}
          icon={Wallet}
          delay={0.2}
        />
      </div>

      {/* Charges */}
      <FadeIn delay={0.2}>
        <MotionCard hover={false}>
          <MotionCardHeader>
            <MotionCardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Receipt className="h-4 w-4 text-primary" />
              </div>
              Charges
            </MotionCardTitle>
          </MotionCardHeader>
          <MotionCardContent>
            {!member.charges || member.charges.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No charges yet"
                description="You're all clear — no charges yet."
              />
            ) : (
              <StaggerChildren className="space-y-3">
                {member.charges.map((charge: any) => (
                  <StaggerItem key={charge.id}>
                    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all duration-200">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate" title={charge.title}>{charge.title}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Badge variant="outline" className="text-xs">{charge.category}</Badge>
                          {charge.dueDate && (
                            <>
                              <span className="opacity-30">&bull;</span>
                              <span>Due {formatDate(charge.dueDate)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Money cents={charge.amountCents} size="sm" />
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  {charge.balanceDueCents > 0 ? (
                                    <AlertCircle className="w-4 h-4 text-warning" />
                                  ) : (
                                    <Check className="w-4 h-4 text-success" />
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{charge.balanceDueCents > 0 ? 'Open' : 'Paid'}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        {charge.balanceDueCents > 0 && (
                          <p className="text-sm text-destructive mt-1">
                            <Money cents={charge.balanceDueCents} size="xs" inline className="text-destructive" /> due
                          </p>
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

      {/* Payments */}
      <FadeIn delay={0.3}>
        <MotionCard hover={false}>
          <MotionCardHeader>
            <MotionCardTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-success/10">
                <CreditCard className="h-4 w-4 text-success" />
              </div>
              Payments
            </MotionCardTitle>
          </MotionCardHeader>
          <MotionCardContent>
            {!member.payments || member.payments.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No payments yet"
                description="Your payment history will appear here."
              />
            ) : (
              <StaggerChildren className="space-y-3">
                {member.payments.map((payment: any) => (
                  <StaggerItem key={payment.id}>
                    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all duration-200">
                      <div className="min-w-0">
                        <Money cents={payment.amountCents} size="sm" />
                        <p className="text-sm text-muted-foreground mt-1 truncate">
                          {formatDate(payment.paidAt)} via {payment.source}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {payment.allocations?.length > 0 ? (
                          <div className="space-y-1">
                            {payment.allocations.map((a: any) => (
                              <Badge key={a.id} variant="secondary" className="text-xs max-w-[180px]">
                                <Money cents={a.amountCents} size="xs" inline /> &rarr; <span className="truncate">{a.chargeTitle}</span>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span><AlertCircle className="w-4 h-4 text-warning" /></span>
                              </TooltipTrigger>
                              <TooltipContent>Unallocated</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
  );
}
