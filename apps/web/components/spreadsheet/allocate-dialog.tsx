'use client';

import { useState, useMemo } from 'react';
import { Search, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Money } from '@/components/ui/money';
import { cn, formatDate } from '@/lib/utils';
import type { useAllocatePayment, useAutoAllocateToCharge } from '@/lib/queries/payments';
import type { useToast } from '@/components/ui/use-toast';

export interface AllocatePaymentsRow {
  id: string;
  description: string;
  member?: string;
  outstandingCents: number;
}

export interface AllocatePaymentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charges: AllocatePaymentsRow[];
  chargesMap: Map<string, any>;
  payments: any[];
  orgId: string | null;
  allocatePayment: ReturnType<typeof useAllocatePayment>;
  autoAllocate: ReturnType<typeof useAutoAllocateToCharge>;
  onSuccess: () => void;
  toast: ReturnType<typeof useToast>['toast'];
}

export function AllocatePaymentsDialog({
  open,
  onOpenChange,
  charges,
  chargesMap,
  payments,
  orgId,
  allocatePayment,
  autoAllocate,
  onSuccess,
  toast,
}: AllocatePaymentsDialogProps) {
  const [selectedPaymentId, setSelectedPaymentId] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [isAutoAllocating, setIsAutoAllocating] = useState(false);

  const filteredPayments = useMemo(() => {
    if (!paymentSearch.trim()) return payments;
    const q = paymentSearch.toLowerCase();
    return payments.filter(
      (p: any) =>
        p.rawPayerName?.toLowerCase().includes(q) ||
        p.memo?.toLowerCase().includes(q),
    );
  }, [payments, paymentSearch]);

  const selectedPayment = payments.find((p: any) => p.id === selectedPaymentId);

  const allocationPreview = useMemo(() => {
    if (!selectedPayment) return [];
    let remaining = selectedPayment.unallocatedCents;
    return charges.map((charge) => {
      const amount = Math.min(remaining, charge.outstandingCents);
      remaining -= amount;
      return { chargeId: charge.id, description: charge.description, member: charge.member, outstandingCents: charge.outstandingCents, allocateCents: amount };
    });
  }, [selectedPayment, charges]);

  const totalToAllocate = allocationPreview.reduce((sum, a) => sum + a.allocateCents, 0);
  const remainingAfter = selectedPayment ? selectedPayment.unallocatedCents - totalToAllocate : 0;

  const handleClose = () => {
    setSelectedPaymentId('');
    setPaymentSearch('');
    onOpenChange(false);
  };

  const handleManualAllocate = async () => {
    if (!orgId || !selectedPaymentId || totalToAllocate <= 0) return;
    const allocations = allocationPreview
      .filter((a) => a.allocateCents > 0)
      .map((a) => ({ chargeId: a.chargeId, amountCents: a.allocateCents }));
    try {
      await allocatePayment.mutateAsync({ orgId, paymentId: selectedPaymentId, allocations });
      toast({ title: `Matched payment to ${allocations.length} charge${allocations.length !== 1 ? 's' : ''}` });
      setSelectedPaymentId('');
      setPaymentSearch('');
      onSuccess();
    } catch (error: any) {
      toast({ title: 'Match failed', description: error.message || 'Please try again', variant: 'destructive' });
    }
  };

  const handleAutoAllocateAll = async () => {
    if (!orgId) return;
    setIsAutoAllocating(true);
    let successCount = 0;
    for (const charge of charges) {
      try {
        await autoAllocate.mutateAsync({ orgId, chargeId: charge.id });
        successCount++;
      } catch {
        // continue with remaining charges
      }
    }
    setIsAutoAllocating(false);
    if (successCount > 0) {
      toast({ title: `Auto-matched ${successCount} charge${successCount !== 1 ? 's' : ''}` });
      setSelectedPaymentId('');
      setPaymentSearch('');
      onSuccess();
    } else {
      toast({ title: 'No payments could be auto-matched', description: 'No matching unallocated payments found for these members', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o ? handleClose() : onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Match Payments</DialogTitle>
          <DialogDescription>
            {charges.length} unpaid charge{charges.length !== 1 ? 's' : ''} selected
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {charges.map((charge) => (
            <div key={charge.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{charge.description}</p>
                <p className="text-xs text-muted-foreground">{charge.member || 'No member'}</p>
              </div>
              <Money cents={charge.outstandingCents} size="sm" className="text-warning shrink-0 ml-2" />
            </div>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search payments..."
            aria-label="Search payments"
            value={paymentSearch}
            onChange={(e) => setPaymentSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-none" style={{ maxHeight: '30vh' }}>
          <div className="space-y-2 py-1">
            {filteredPayments.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {paymentSearch ? 'No matching payments found' : 'No unallocated payments available'}
                </p>
              </div>
            ) : (
              filteredPayments.map((payment: any) => (
                <button
                  key={payment.id}
                  type="button"
                  onClick={() => setSelectedPaymentId(payment.id)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                    selectedPaymentId === payment.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border/50 hover:bg-secondary/50',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{payment.rawPayerName || 'Unknown Payer'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(payment.paidAt)}
                      {payment.memo && ` \u2022 "${payment.memo}"`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <Money cents={payment.unallocatedCents} size="sm" />
                    <p className="text-xs text-muted-foreground">available</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {selectedPayment && (
          <div className="space-y-2 pt-2 border-t border-border/30">
            <p className="text-xs font-medium text-muted-foreground">Match Preview</p>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {allocationPreview.map((a) => (
                <div key={a.chargeId} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-secondary/30">
                  <span className="truncate mr-2">{a.description}</span>
                  {a.allocateCents > 0 ? (
                    <Money cents={a.allocateCents} size="sm" className="text-success shrink-0" />
                  ) : (
                    <span className="text-muted-foreground shrink-0">$0.00</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
              <span>Remaining on payment after</span>
              <Money cents={remainingAfter} size="sm" />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoAllocateAll}
            disabled={isAutoAllocating || allocatePayment.isPending}
          >
            {isAutoAllocating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Auto-Matching...
              </>
            ) : (
              'Auto-Match All'
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleManualAllocate}
              disabled={allocatePayment.isPending || !selectedPaymentId || totalToAllocate <= 0}
            >
              {allocatePayment.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Matching...
                </>
              ) : (
                'Match'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
