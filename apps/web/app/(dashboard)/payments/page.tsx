'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, CreditCard, AlertCircle, TrendingUp, Wallet, Search, MoreHorizontal, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Link2, Receipt } from 'lucide-react';
import { usePayments, useUpdatePayment, useDeletePayment, useRestorePayment, useAllocatePayment } from '@/lib/queries/payments';
import { useCharges, useCreateCharge } from '@/lib/queries/charges';
import { useMembers } from '@/lib/queries/members';
import { CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS } from '@ledgly/shared';
import { useAuthStore } from '@/lib/stores/auth';
import { formatDate } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { StatCard } from '@/components/ui/stat-card';
import { MotionCard, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';

interface EditPaymentData {
  id: string;
  amountCents: number;
  paidAt: string;
  rawPayerName: string;
  memo: string;
}

interface CreateChargeFromPayment {
  payment: any;
  membershipId: string;
  category: string;
  title: string;
  amountCents: number;
  dueDate: string;
}

function PaymentCard({
  payment,
  onEdit,
  onDelete,
  onAllocate,
  onCreateCharge,
  isAdmin = false,
}: {
  payment: any;
  onEdit: (payment: any) => void;
  onDelete: (payment: any) => void;
  onAllocate: (payment: any) => void;
  onCreateCharge: (payment: any) => void;
  isAdmin?: boolean;
}) {
  const hasUnallocated = payment.unallocatedCents > 0;

  return (
    <StaggerItem>
      <MotionCard>
        <MotionCardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AvatarGradient
                name={payment.rawPayerName || 'Unknown'}
                size="md"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">
                    {payment.rawPayerName || 'Unknown Payer'}
                  </p>
                  {hasUnallocated && (
                    <Badge variant="warning" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Unallocated
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatDate(payment.paidAt)}</span>
                  <span className="opacity-30">•</span>
                  <Badge variant="outline" className="text-xs">{payment.source}</Badge>
                  {payment.memo && (
                    <>
                      <span className="opacity-30">•</span>
                      <span className="truncate max-w-[200px]">"{payment.memo}"</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <Money cents={payment.amountCents} size="sm" />
                {hasUnallocated ? (
                  <Badge variant="warning" className="text-xs">Unallocated</Badge>
                ) : (
                  <Badge variant="success" className="text-xs">Allocated</Badge>
                )}
              </div>
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {hasUnallocated && (
                      <>
                        <DropdownMenuItem onClick={() => onAllocate(payment)}>
                          <Link2 className="h-4 w-4 mr-2" />
                          Allocate to Charge
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onCreateCharge(payment)}>
                          <Receipt className="h-4 w-4 mr-2" />
                          Create Charge
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem onClick={() => onEdit(payment)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(payment)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          {payment.allocations?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-2">Applied to:</p>
              <div className="flex flex-wrap gap-1">
                {payment.allocations.map((a: any) => (
                  <Badge key={a.id} variant="secondary" className="text-xs">
                    {a.chargeTitle}: <Money cents={a.amountCents} size="xs" inline />
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
}

function PaymentCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="text-right space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const [showUnallocated, setShowUnallocated] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingPayment, setEditingPayment] = useState<EditPaymentData | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<any | null>(null);
  const [allocatingPayment, setAllocatingPayment] = useState<any | null>(null);
  const [selectedChargeId, setSelectedChargeId] = useState<string>('');
  const [allocationAmount, setAllocationAmount] = useState<number>(0);
  const [creatingChargeFromPayment, setCreatingChargeFromPayment] = useState<CreateChargeFromPayment | null>(null);

  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);
  const isAdmin = currentMembership?.role === 'ADMIN' || currentMembership?.role === 'TREASURER';
  const { toast } = useToast();
  const { data, isLoading } = usePayments(currentOrgId, {
    unallocated: showUnallocated || undefined,
  });

  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();
  const restorePayment = useRestorePayment();
  const allocatePayment = useAllocatePayment();
  const createCharge = useCreateCharge();

  // Fetch charges for allocation and members for creating charges
  const { data: chargesData } = useCharges(currentOrgId, { status: 'OPEN' });
  const { data: membersData } = useMembers(currentOrgId);
  const openCharges = chargesData?.data || [];
  const members = membersData?.data || [];

  // Filter payments by search query
  const filteredPayments = data?.data.filter((payment) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      payment.rawPayerName?.toLowerCase().includes(query) ||
      payment.memo?.toLowerCase().includes(query) ||
      payment.source?.toLowerCase().includes(query)
    );
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredPayments.length / pageSize);
  const paginatedPayments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, page, pageSize]);

  // Reset to page 1 when filters change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  // Reset page when filters or search changes
  useEffect(() => {
    setPage(1);
  }, [showUnallocated, searchQuery]);

  // Calculate summary stats
  const totalPayments = filteredPayments.length;
  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amountCents, 0);
  const totalUnallocated = filteredPayments.reduce((sum, p) => sum + p.unallocatedCents, 0);

  const handleEdit = (payment: any) => {
    setEditingPayment({
      id: payment.id,
      amountCents: payment.amountCents,
      paidAt: new Date(payment.paidAt).toISOString().split('T')[0],
      rawPayerName: payment.rawPayerName || '',
      memo: payment.memo || '',
    });
  };

  const handleSaveEdit = () => {
    if (!editingPayment || !currentOrgId) return;

    updatePayment.mutate(
      {
        orgId: currentOrgId,
        paymentId: editingPayment.id,
        data: {
          amountCents: editingPayment.amountCents,
          paidAt: editingPayment.paidAt,
          rawPayerName: editingPayment.rawPayerName,
          memo: editingPayment.memo,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Payment updated successfully' });
          setEditingPayment(null);
        },
        onError: (error: any) => {
          toast({
            title: 'Error updating payment',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleDelete = (payment: any) => {
    setDeletingPayment(payment);
  };

  const handleConfirmDelete = () => {
    if (!deletingPayment || !currentOrgId) return;
    const paymentId = deletingPayment.id;

    deletePayment.mutate(
      { orgId: currentOrgId, paymentId },
      {
        onSuccess: () => {
          toast({
            title: 'Payment deleted',
            description: 'You can undo this action.',
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestorePayment(paymentId)}
              >
                Undo
              </Button>
            ),
          });
          setDeletingPayment(null);
        },
        onError: (error: any) => {
          toast({
            title: 'Error deleting payment',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleRestorePayment = (paymentId: string) => {
    if (!currentOrgId) return;

    restorePayment.mutate(
      { orgId: currentOrgId, paymentId },
      {
        onSuccess: () => {
          toast({ title: 'Payment restored' });
        },
        onError: (error: any) => {
          toast({
            title: 'Error restoring payment',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleAllocate = (payment: any) => {
    setAllocatingPayment(payment);
    setSelectedChargeId('');
    setAllocationAmount(payment.unallocatedCents);
  };

  const handleConfirmAllocate = () => {
    if (!allocatingPayment || !currentOrgId || !selectedChargeId) return;

    allocatePayment.mutate(
      {
        orgId: currentOrgId,
        paymentId: allocatingPayment.id,
        allocations: [{ chargeId: selectedChargeId, amountCents: allocationAmount }],
      },
      {
        onSuccess: () => {
          toast({ title: 'Payment allocated successfully' });
          setAllocatingPayment(null);
          setSelectedChargeId('');
          setAllocationAmount(0);
        },
        onError: (error: any) => {
          toast({
            title: 'Error allocating payment',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleCreateChargeFromPayment = (payment: any) => {
    // Find member from membershipId if available
    const member = payment.membershipId
      ? members.find((m) => m.id === payment.membershipId)
      : null;

    setCreatingChargeFromPayment({
      payment,
      membershipId: payment.membershipId || '',
      category: 'DUES',
      title: payment.memo || 'Charge from payment',
      amountCents: payment.unallocatedCents,
      dueDate: new Date().toISOString().split('T')[0],
    });
  };

  const handleConfirmCreateCharge = async () => {
    if (!creatingChargeFromPayment || !currentOrgId || !creatingChargeFromPayment.membershipId) {
      toast({ title: 'Please select a member', variant: 'destructive' });
      return;
    }

    try {
      // Create the charge
      const charges = await createCharge.mutateAsync({
        orgId: currentOrgId,
        data: {
          membershipIds: [creatingChargeFromPayment.membershipId],
          category: creatingChargeFromPayment.category as any,
          title: creatingChargeFromPayment.title,
          amountCents: creatingChargeFromPayment.amountCents,
          dueDate: creatingChargeFromPayment.dueDate
            ? new Date(creatingChargeFromPayment.dueDate).toISOString()
            : undefined,
        },
      });

      // Allocate the payment to the new charge
      const chargeArray = Array.isArray(charges) ? charges : [charges];
      if (chargeArray[0]) {
        await allocatePayment.mutateAsync({
          orgId: currentOrgId,
          paymentId: creatingChargeFromPayment.payment.id,
          allocations: [{
            chargeId: chargeArray[0].id,
            amountCents: Math.min(
              creatingChargeFromPayment.amountCents,
              creatingChargeFromPayment.payment.unallocatedCents
            ),
          }],
        });
      }

      toast({ title: 'Charge created and payment allocated' });
      setCreatingChargeFromPayment(null);
    } catch (error: any) {
      toast({
        title: 'Error creating charge',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
            <p className="text-muted-foreground mt-1">Track and allocate payments</p>
          </div>
          <Button asChild className="bg-gradient-to-r from-primary to-blue-400 hover:opacity-90 transition-opacity">
            <Link href="/payments/new">
              <Plus className="w-4 h-4 mr-2" />
              Record Payment
            </Link>
          </Button>
        </div>
      </FadeIn>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Payments"
          value={totalPayments}
          description="Payments received"
          icon={CreditCard}
          delay={0}
        />
        <StatCard
          title="Total Received"
          value={totalAmount}
          isMoney
          description="All time received"
          icon={TrendingUp}
          delay={0.1}
        />
        <StatCard
          title="Unallocated"
          value={totalUnallocated}
          isMoney
          description={totalUnallocated > 0 ? 'Needs attention' : 'All allocated'}
          icon={Wallet}
          delay={0.2}
        />
      </div>

      {/* Filter */}
      <FadeIn delay={0.2}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <Button
              variant={!showUnallocated ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowUnallocated(false)}
              className={!showUnallocated ? 'bg-gradient-to-r from-primary to-blue-400' : ''}
            >
              All Payments
            </Button>
            <Button
              variant={showUnallocated ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowUnallocated(true)}
              className={showUnallocated ? 'bg-gradient-to-r from-primary to-blue-400' : ''}
            >
              Unallocated Only
            </Button>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search payer, memo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-secondary/30 border-border/50"
            />
          </div>
        </div>
      </FadeIn>

      {/* Pagination Controls - Top */}
      {!isLoading && filteredPayments.length > 0 && (
        <FadeIn delay={0.25}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show</span>
              <Select value={String(pageSize)} onValueChange={(v) => handlePageSizeChange(Number(v))}>
                <SelectTrigger className="w-[70px] h-8 bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                {page} / {totalPages || 1}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Payments List */}
      {isLoading ? (
        <div className="space-y-3">
          <PaymentCardSkeleton />
          <PaymentCardSkeleton />
          <PaymentCardSkeleton />
        </div>
      ) : filteredPayments.length === 0 ? (
        <FadeIn delay={0.3}>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-border/50 bg-card/50 py-16 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? 'No payments found' : 'No payments yet'}
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery
                ? 'Try adjusting your search'
                : 'Record your first payment to start tracking'}
            </p>
            {!searchQuery && (
              <Button asChild className="bg-gradient-to-r from-primary to-blue-400">
                <Link href="/payments/new">Record your first payment</Link>
              </Button>
            )}
          </motion.div>
        </FadeIn>
      ) : (
        <>
          <StaggerChildren className="space-y-3">
            {paginatedPayments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAllocate={handleAllocate}
                onCreateCharge={handleCreateChargeFromPayment}
                isAdmin={isAdmin}
              />
            ))}
          </StaggerChildren>

          {/* Pagination Controls - Bottom */}
          {filteredPayments.length > pageSize && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingPayment} onOpenChange={(open) => !open && setEditingPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            <DialogDescription>
              Update the payment details below.
            </DialogDescription>
          </DialogHeader>
          {editingPayment && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="rawPayerName">Payer Name</Label>
                <Input
                  id="rawPayerName"
                  value={editingPayment.rawPayerName}
                  onChange={(e) => setEditingPayment({ ...editingPayment, rawPayerName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={(editingPayment.amountCents / 100).toFixed(2)}
                  onChange={(e) => setEditingPayment({
                    ...editingPayment,
                    amountCents: Math.round(parseFloat(e.target.value || '0') * 100)
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paidAt">Payment Date</Label>
                <Input
                  id="paidAt"
                  type="date"
                  value={editingPayment.paidAt}
                  onChange={(e) => setEditingPayment({ ...editingPayment, paidAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="memo">Memo</Label>
                <Input
                  id="memo"
                  value={editingPayment.memo}
                  onChange={(e) => setEditingPayment({ ...editingPayment, memo: e.target.value })}
                  placeholder="Optional note"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPayment(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updatePayment.isPending}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {updatePayment.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingPayment} onOpenChange={(open) => !open && setDeletingPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment? This will also remove any allocations to charges.
            </DialogDescription>
          </DialogHeader>
          {deletingPayment && (
            <div className="py-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="font-medium">{deletingPayment.rawPayerName || 'Unknown Payer'}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(deletingPayment.paidAt)} • <Money cents={deletingPayment.amountCents} size="xs" inline />
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingPayment(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deletePayment.isPending}
            >
              {deletePayment.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Payment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allocate Payment Dialog */}
      <Dialog open={!!allocatingPayment} onOpenChange={(open) => !open && setAllocatingPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate Payment</DialogTitle>
            <DialogDescription>
              Allocate this payment to an existing open charge.
            </DialogDescription>
          </DialogHeader>
          {allocatingPayment && (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="font-medium">{allocatingPayment.rawPayerName || 'Unknown Payer'}</p>
                <p className="text-sm text-muted-foreground">
                  Unallocated: <Money cents={allocatingPayment.unallocatedCents} size="xs" inline />
                </p>
              </div>
              <div className="space-y-2">
                <Label>Select Charge</Label>
                <Select value={selectedChargeId} onValueChange={setSelectedChargeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a charge" />
                  </SelectTrigger>
                  <SelectContent>
                    {openCharges.length === 0 ? (
                      <SelectItem value="" disabled>No open charges available</SelectItem>
                    ) : (
                      openCharges.map((charge) => (
                        <SelectItem key={charge.id} value={charge.id}>
                          {charge.title} - {charge.membership?.displayName || 'Unknown'} (
                          <Money cents={charge.balanceDueCents} size="xs" inline /> due)
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount to Allocate ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(allocationAmount / 100).toFixed(2)}
                  onChange={(e) =>
                    setAllocationAmount(Math.round(parseFloat(e.target.value || '0') * 100))
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocatingPayment(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAllocate}
              disabled={allocatePayment.isPending || !selectedChargeId}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {allocatePayment.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Allocating...
                </>
              ) : (
                'Allocate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Charge from Payment Dialog */}
      <Dialog
        open={!!creatingChargeFromPayment}
        onOpenChange={(open) => !open && setCreatingChargeFromPayment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Charge from Payment</DialogTitle>
            <DialogDescription>
              Create a new charge and automatically allocate this payment to it.
            </DialogDescription>
          </DialogHeader>
          {creatingChargeFromPayment && (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="font-medium">{creatingChargeFromPayment.payment.rawPayerName || 'Unknown Payer'}</p>
                <p className="text-sm text-muted-foreground">
                  Payment: <Money cents={creatingChargeFromPayment.payment.unallocatedCents} size="xs" inline />
                </p>
              </div>
              <div className="space-y-2">
                <Label>Member</Label>
                <Select
                  value={creatingChargeFromPayment.membershipId}
                  onValueChange={(v) =>
                    setCreatingChargeFromPayment({ ...creatingChargeFromPayment, membershipId: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName || m.name || m.user?.name || 'Unknown'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={creatingChargeFromPayment.category}
                  onValueChange={(v) =>
                    setCreatingChargeFromPayment({ ...creatingChargeFromPayment, category: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHARGE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CHARGE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={creatingChargeFromPayment.title}
                  onChange={(e) =>
                    setCreatingChargeFromPayment({ ...creatingChargeFromPayment, title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={(creatingChargeFromPayment.amountCents / 100).toFixed(2)}
                  onChange={(e) =>
                    setCreatingChargeFromPayment({
                      ...creatingChargeFromPayment,
                      amountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={creatingChargeFromPayment.dueDate}
                  onChange={(e) =>
                    setCreatingChargeFromPayment({ ...creatingChargeFromPayment, dueDate: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingChargeFromPayment(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreateCharge}
              disabled={createCharge.isPending || allocatePayment.isPending}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {(createCharge.isPending || allocatePayment.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Charge & Allocate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
