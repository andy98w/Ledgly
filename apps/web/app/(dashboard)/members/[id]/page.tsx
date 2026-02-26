'use client';

import { useParams, useRouter } from 'next/navigation';

import { ArrowLeft, Receipt, CreditCard, TrendingUp, Wallet, User, AlertCircle, Check } from 'lucide-react';
import { useMember } from '@/lib/queries/members';
import { useAuthStore } from '@/lib/stores/auth';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { StatCard } from '@/components/ui/stat-card';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const memberId = params.id as string;
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data: member, isLoading } = useMember(currentOrgId, memberId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Skeleton className="h-12 w-12 rounded-full" />
          <div>
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <FadeIn>
        <div className="rounded-xl border border-border/50 bg-card/50 py-16 text-center animate-in-scale">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Member not found</h3>
          <p className="text-muted-foreground mb-6">
            The member you're looking for doesn't exist
          </p>
          <Button variant="outline" onClick={() => router.back()}>
            Go back
          </Button>
        </div>
      </FadeIn>
    );
  }

  const hasBalance = member.balanceCents > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="rounded-xl hover:bg-secondary/50"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <AvatarGradient name={member.displayName} size="lg" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{member.displayName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={member.status === 'ACTIVE' ? 'secondary' : 'outline'}
                  className="text-xs"
                >
                  {member.status}
                </Badge>
                <Badge variant="outline" className="text-xs">{member.role}</Badge>
              </div>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Balance Stats */}
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
            {member.charges?.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Receipt className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium mb-1">No charges yet</p>
                <p className="text-xs text-muted-foreground">Charges assigned to this member will appear here</p>
              </div>
            ) : (
              <StaggerChildren className="space-y-3">
                {member.charges?.map((charge: any) => (
                  <StaggerItem key={charge.id}>
                    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-all duration-200">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate" title={charge.title}>{charge.title}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Badge variant="outline" className="text-xs">{charge.category}</Badge>
                          {charge.dueDate && (
                            <>
                              <span className="opacity-30">•</span>
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
            {member.payments?.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center mx-auto mb-3">
                  <CreditCard className="h-6 w-6 text-success" />
                </div>
                <p className="text-sm font-medium mb-1">No payments yet</p>
                <p className="text-xs text-muted-foreground">Payments from this member will appear here</p>
              </div>
            ) : (
              <StaggerChildren className="space-y-3">
                {member.payments?.map((payment: any) => (
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
                                <Money cents={a.amountCents} size="xs" inline /> → <span className="truncate">{a.chargeTitle}</span>
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
