'use client';

import { useState, useMemo } from 'react';
import { Loader2, Search, CreditCard } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ChargeAllocatePaymentDialogProps {
  charge: any | null;
  payments: any[];
  onClose: () => void;
  onAllocate: (paymentId: string, chargeId: string, amountCents: number) => void;
  isPending: boolean;
}

export function ChargeAllocatePaymentDialog({
  charge,
  payments,
  onClose,
  onAllocate,
  isPending,
}: ChargeAllocatePaymentDialogProps) {
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('');
  const [allocationAmount, setAllocationAmount] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter to only unallocated payments
  const unallocatedPayments = useMemo(() => {
    let filtered = payments.filter((p) => p.unallocatedCents > 0);
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p) =>
        p.rawPayerName?.toLowerCase().includes(query) ||
        p.memo?.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [payments, searchQuery]);

  const handleSelect = (payment: any) => {
    setSelectedPaymentId(payment.id);
    const balanceDue = charge?.balanceDueCents || 0;
    setAllocationAmount(Math.min(payment.unallocatedCents, balanceDue));
  };

  const handleConfirm = () => {
    if (!charge || !selectedPaymentId || allocationAmount <= 0) return;
    onAllocate(selectedPaymentId, charge.id, allocationAmount);
  };

  const handleClose = () => {
    setSelectedPaymentId('');
    setAllocationAmount(0);
    setSearchQuery('');
    onClose();
  };

  return (
    <Dialog open={!!charge} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Match Payment</DialogTitle>
          <DialogDescription>
            Choose a payment to match to this charge.
          </DialogDescription>
        </DialogHeader>
        {charge && (
          <>
            {/* Charge info banner */}
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Charge</p>
                  <p className="font-medium">{charge.title}</p>
                  <p className="text-xs text-muted-foreground">{charge.membership?.displayName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Balance due</p>
                  <Money cents={charge.balanceDueCents} size="lg" className="text-primary" />
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Search payments..."
                aria-label="Search payments"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* Payment list */}
            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-none px-0.5 -mx-0.5" style={{ maxHeight: '40vh' }}>
              <div className="space-y-2 py-1">
                {unallocatedPayments.length === 0 ? (
                  <div className="text-center py-8">
                    <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'No matching payments found' : 'No unmatched payments available'}
                    </p>
                  </div>
                ) : (
                  unallocatedPayments.map((payment) => (
                    <button
                      key={payment.id}
                      type="button"
                      onClick={() => handleSelect(payment)}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                        selectedPaymentId === payment.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 hover:bg-secondary/50',
                      )}
                    >
                      <AvatarGradient name={payment.rawPayerName || 'Unknown'} size="sm" />
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

            {/* Allocation amount input */}
            {selectedPaymentId && (
              <div className="space-y-2 pt-2 border-t border-border/30">
                <Label htmlFor="allocation-amount">Amount to Match ($)</Label>
                <Input
                  id="allocation-amount"
                  type="number"
                  step="0.01"
                  value={(allocationAmount / 100).toFixed(2)}
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  onChange={(e) =>
                    setAllocationAmount(Math.round(parseFloat(e.target.value || '0') * 100))
                  }
                />
              </div>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending || !selectedPaymentId || allocationAmount <= 0}
           
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Matching...
              </>
            ) : (
              'Match'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
