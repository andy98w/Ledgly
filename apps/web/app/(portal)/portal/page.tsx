'use client';

import { useState, useMemo } from 'react';
import { Receipt, CreditCard, Clock, CheckCircle2, Info } from 'lucide-react';
import { useMyMembership } from '@/lib/queries/portal';
import { useAuthStore } from '@/lib/stores/auth';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { PaymentLinks } from '@/components/portal/payment-links';

export default function PortalPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const { data: memberData, isLoading } = useMyMembership(currentOrgId);
  const member = memberData as (typeof memberData & {
    paymentInstructions?: string | null;
    paymentHandles?: Record<string, string>;
    enabledPaymentSources?: string[];
  });

  const [chargeFilter, setChargeFilter] = useState<'all' | 'unpaid' | 'paid'>('all');

  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);
  const firstName = member?.displayName?.split(' ')[0] || user?.name?.split(' ')[0] || 'there';

  const filteredCharges = useMemo(() => {
    if (!member?.charges) return [];
    let charges = [...member.charges];
    if (chargeFilter === 'unpaid') charges = charges.filter((c: any) => c.balanceDueCents > 0);
    else if (chargeFilter === 'paid') charges = charges.filter((c: any) => c.balanceDueCents === 0);
    else {
      charges.sort((a: any, b: any) => {
        if (a.balanceDueCents > 0 && b.balanceDueCents === 0) return -1;
        if (a.balanceDueCents === 0 && b.balanceDueCents > 0) return 1;
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        return 0;
      });
    }
    return charges;
  }, [member?.charges, chargeFilter]);

  const payments = member?.payments || [];

  if (isLoading) {
    return (
      <div className="space-y-6 px-1">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
    );
  }

  if (!member) {
    return (
      <EmptyState
        icon={Receipt}
        title="No membership found"
        description="We couldn't find your membership details. Please contact your organization admin."
      />
    );
  }

  const hasBalance = member.balanceCents > 0;
  const isOverdue = member.overdueCharges > 0;
  const paymentHandles = member.paymentHandles || {};
  const enabledSources = member.enabledPaymentSources || [];
  const hasPaymentLinks = enabledSources.some((s) => paymentHandles[s]?.trim());

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hi, {firstName}</h1>
        {currentMembership?.orgName && (
          <p className="text-muted-foreground text-sm mt-0.5">{currentMembership.orgName}</p>
        )}
      </div>

      {/* Balance — the hero */}
      <div className={cn(
        'rounded-2xl p-6',
        hasBalance
          ? 'bg-destructive/5 border border-destructive/20'
          : 'bg-success/5 border border-success/20',
      )}>
        {hasBalance ? (
          <>
            <p className="text-sm font-medium text-muted-foreground">You owe</p>
            <p className="text-4xl font-bold tracking-tight text-destructive mt-1 font-mono-numbers">
              <span className="opacity-70">$</span>
              {(member.balanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            {isOverdue && (
              <div className="flex items-center gap-1.5 mt-3">
                <Clock className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive font-medium">
                  {member.overdueCharges} overdue
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-success/10 shrink-0">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <div>
              <p className="text-lg font-semibold text-success">You're all paid up</p>
              <p className="text-sm text-muted-foreground">No balance due</p>
            </div>
          </div>
        )}
      </div>

      {/* Payment Instructions */}
      {member.paymentInstructions && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/10 shrink-0">
            <Info className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">How to Pay</p>
            <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-line">{member.paymentInstructions}</p>
          </div>
        </div>
      )}

      {/* Charges */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Charges</h2>
          <div className="flex items-center rounded-lg border border-border/50 bg-secondary/30 p-0.5">
            {(['all', 'unpaid', 'paid'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setChargeFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  chargeFilter === f
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f === 'all' ? 'All' : f === 'unpaid' ? 'Unpaid' : 'Paid'}
              </button>
            ))}
          </div>
        </div>

        {filteredCharges.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No charges"
            description={chargeFilter === 'all' ? 'No charges yet.' : `No ${chargeFilter} charges.`}
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {filteredCharges.map((charge: any) => {
              const isUnpaid = charge.balanceDueCents > 0;
              const isPartial = isUnpaid && charge.balanceDueCents < charge.amountCents;
              const paidPercent = isPartial
                ? Math.round(((charge.amountCents - charge.balanceDueCents) / charge.amountCents) * 100)
                : 0;

              return (
                <div
                  key={charge.id}
                  className={cn(
                    'rounded-2xl p-4 transition-colors',
                    isUnpaid
                      ? 'bg-card border border-border shadow-sm'
                      : 'bg-secondary/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'font-medium truncate',
                        isUnpaid ? 'text-foreground' : 'text-muted-foreground',
                      )}>
                        {charge.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                        <Badge variant="outline" className="text-xs">{charge.category}</Badge>
                        {charge.dueDate && (
                          <span className="text-xs text-muted-foreground">
                            Due {formatDate(charge.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {isUnpaid ? (
                        <>
                          <Money cents={charge.balanceDueCents} size="sm" className="text-destructive" />
                          {isPartial && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              of <Money cents={charge.amountCents} size="xs" inline />
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          <Money cents={charge.amountCents} size="sm" className="text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>

                  {isPartial && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${paidPercent}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{paidPercent}% paid</p>
                    </div>
                  )}

                  {isUnpaid && hasPaymentLinks && (
                    <PaymentLinks
                      handles={paymentHandles}
                      enabledSources={enabledSources}
                      amountCents={charge.balanceDueCents}
                      note={charge.title}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Payments */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Payments</h2>
        {payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments yet"
            description="Your payment history will appear here."
            className="py-8"
          />
        ) : (
          <div className="space-y-3">
            {payments.map((payment: any) => (
              <div
                key={payment.id}
                className="rounded-2xl bg-secondary/30 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Money cents={payment.amountCents} size="sm" />
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDate(payment.paidAt)} &middot; {payment.source}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  </div>
                </div>
                {payment.allocations?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {payment.allocations.map((a: any) => (
                      <Badge key={a.id} variant="secondary" className="text-xs">
                        <Money cents={a.amountCents} size="xs" inline className="mr-1" />
                        <span className="truncate max-w-[140px]">{a.chargeTitle}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
