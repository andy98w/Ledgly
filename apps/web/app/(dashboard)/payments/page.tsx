'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, CreditCard, AlertCircle, TrendingUp, Wallet, Search, MoreHorizontal, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, Link2, Receipt, Check, Users, Info, Circle, CheckCircle2 } from 'lucide-react';
import { useAutoAllocateToCharge } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface EditPaymentData {
  id: string;
  amountCents: number;
  paidAt: string;
  rawPayerName: string;
  memo: string;
}

interface CreateChargeFromPayment {
  payment: any;
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
  isSelected = false,
  onToggleSelect,
}: {
  payment: any;
  onEdit: (payment: any) => void;
  onDelete: (payment: any) => void;
  onAllocate: (payment: any) => void;
  onCreateCharge: (payment: any) => void;
  isAdmin?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const hasUnallocated = payment.unallocatedCents > 0;

  return (
    <StaggerItem>
      <MotionCard>
        <MotionCardContent className="p-4">
          <div className="flex items-start gap-4">
            {isAdmin && onToggleSelect && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect();
                }}
                className="mt-1 flex items-center justify-center transition-colors shrink-0"
                title={isSelected ? "Deselect" : "Select"}
              >
                {isSelected ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                )}
              </button>
            )}
            <AvatarGradient
              name={payment.rawPayerName || 'Unknown'}
              size="md"
              className="shrink-0"
            />
            <div className="flex-1 min-w-0 space-y-1">
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
            <div className="flex items-center gap-3 shrink-0">
              <Money cents={payment.amountCents} size="sm" />
              {hasUnallocated ? (
                <Badge variant="warning" className="text-xs">Unallocated</Badge>
              ) : (
                <Badge variant="success" className="text-xs">Allocated</Badge>
              )}
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
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());

  // State for similar payments allocation flow
  const [similarPaymentsDialog, setSimilarPaymentsDialog] = useState<{
    chargeId: string;
    chargeTitle: string;
    sourcePaymentId: string;
    similarPayments: any[];
  } | null>(null);
  const [selectedSimilarPayments, setSelectedSimilarPayments] = useState<Set<string>>(new Set());

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
  const autoAllocate = useAutoAllocateToCharge();

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

  // Filtered members for create charge dialog
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const query = memberSearch.toLowerCase();
    return members.filter((m) =>
      (m.displayName || m.name || m.user?.name || '').toLowerCase().includes(query)
    );
  }, [members, memberSearch]);

  const toggleMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
    setSelectAll(newSelected.size === members.length);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedMembers(new Set());
      setSelectAll(false);
    } else {
      setSelectedMembers(new Set(members.map((m) => m.id)));
      setSelectAll(true);
    }
  };

  const handleCreateChargeFromPayment = (payment: any) => {
    // Pre-select the member if payment has membershipId
    if (payment.membershipId) {
      setSelectedMembers(new Set([payment.membershipId]));
    } else {
      setSelectedMembers(new Set());
    }
    setSelectAll(false);
    setMemberSearch('');

    setCreatingChargeFromPayment({
      payment,
      category: 'DUES',
      title: payment.memo || 'Charge from payment',
      amountCents: payment.unallocatedCents,
      dueDate: new Date().toISOString().split('T')[0],
    });
  };

  const resetCreateChargeDialog = () => {
    setCreatingChargeFromPayment(null);
    setSelectedMembers(new Set());
    setSelectAll(false);
    setMemberSearch('');
  };

  const handleConfirmCreateCharge = async () => {
    if (!creatingChargeFromPayment || !currentOrgId) return;

    if (selectedMembers.size === 0) {
      toast({ title: 'Please select at least one member', variant: 'destructive' });
      return;
    }

    try {
      const sourcePayment = creatingChargeFromPayment.payment;

      // Create charges for all selected members
      const charges = await createCharge.mutateAsync({
        orgId: currentOrgId,
        data: {
          membershipIds: Array.from(selectedMembers),
          category: creatingChargeFromPayment.category as any,
          title: creatingChargeFromPayment.title,
          amountCents: creatingChargeFromPayment.amountCents,
          dueDate: creatingChargeFromPayment.dueDate
            ? new Date(creatingChargeFromPayment.dueDate).toISOString()
            : undefined,
        },
      });

      const chargeArray = Array.isArray(charges) ? charges : [charges];
      const createdCharge = chargeArray[0]; // Use the first charge for allocation

      // Immediately allocate the source payment to the created charge
      if (sourcePayment && sourcePayment.unallocatedCents > 0) {
        try {
          const allocationAmount = Math.min(sourcePayment.unallocatedCents, creatingChargeFromPayment.amountCents);
          await allocatePayment.mutateAsync({
            orgId: currentOrgId,
            paymentId: sourcePayment.id,
            allocations: [{ chargeId: createdCharge.id, amountCents: allocationAmount }],
          });
        } catch {
          // Ignore allocation error for source payment
        }
      }

      // Find similar unallocated payments (sorted by amount similarity)
      const allPayments = data?.data || [];
      const similarPayments = allPayments
        .filter((p) =>
          p.id !== sourcePayment.id &&
          p.unallocatedCents > 0
        )
        .map((p) => ({
          ...p,
          amountDiff: Math.abs(p.unallocatedCents - creatingChargeFromPayment.amountCents),
        }))
        .sort((a, b) => a.amountDiff - b.amountDiff)
        .slice(0, 10); // Show top 10 similar payments

      toast({
        title: `Charge created`,
        description: `Payment from ${sourcePayment.rawPayerName || 'Unknown'} has been allocated.`,
      });

      resetCreateChargeDialog();

      // If there are similar payments, show the dialog
      if (similarPayments.length > 0) {
        setSimilarPaymentsDialog({
          chargeId: createdCharge.id,
          chargeTitle: creatingChargeFromPayment.title,
          sourcePaymentId: sourcePayment.id,
          similarPayments,
        });
        setSelectedSimilarPayments(new Set());
      }
    } catch (error: any) {
      toast({
        title: 'Error creating charge',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleAllocateSimilarPayments = async () => {
    if (!similarPaymentsDialog || !currentOrgId || selectedSimilarPayments.size === 0) return;

    let allocatedCount = 0;
    let totalAllocated = 0;

    for (const paymentId of Array.from(selectedSimilarPayments)) {
      const payment = similarPaymentsDialog.similarPayments.find((p) => p.id === paymentId);
      if (!payment) continue;

      try {
        const allocationAmount = Math.min(payment.unallocatedCents, payment.unallocatedCents);
        await allocatePayment.mutateAsync({
          orgId: currentOrgId,
          paymentId,
          allocations: [{ chargeId: similarPaymentsDialog.chargeId, amountCents: allocationAmount }],
        });
        allocatedCount++;
        totalAllocated += allocationAmount;
      } catch {
        // Continue with other allocations
      }
    }

    if (allocatedCount > 0) {
      toast({
        title: `Allocated ${allocatedCount} payment${allocatedCount > 1 ? 's' : ''}`,
        description: `Total: $${(totalAllocated / 100).toFixed(2)} allocated to "${similarPaymentsDialog.chargeTitle}"`,
      });
    }

    setSimilarPaymentsDialog(null);
    setSelectedSimilarPayments(new Set());
  };

  const toggleSimilarPayment = (paymentId: string) => {
    setSelectedSimilarPayments((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) {
        next.delete(paymentId);
      } else {
        next.add(paymentId);
      }
      return next;
    });
  };

  const togglePaymentSelection = (paymentId: string) => {
    setSelectedPayments((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) {
        next.delete(paymentId);
      } else {
        next.add(paymentId);
      }
      return next;
    });
  };

  const toggleSelectAllPayments = () => {
    if (selectedPayments.size === paginatedPayments.length) {
      setSelectedPayments(new Set());
    } else {
      setSelectedPayments(new Set(paginatedPayments.map((p) => p.id)));
    }
  };

  const isAllPaymentsSelected = paginatedPayments.length > 0 && selectedPayments.size === paginatedPayments.length;

  const handleBulkDeletePayments = async () => {
    if (!currentOrgId || selectedPayments.size === 0) return;

    const paymentIds = Array.from(selectedPayments);
    const deletedPaymentIds: string[] = [];

    for (const paymentId of paymentIds) {
      try {
        await deletePayment.mutateAsync({ orgId: currentOrgId, paymentId });
        deletedPaymentIds.push(paymentId);
      } catch (error) {
        // Continue with other deletions
      }
    }

    setSelectedPayments(new Set());

    const handleUndo = async () => {
      let restoredCount = 0;
      for (const paymentId of deletedPaymentIds) {
        try {
          await restorePayment.mutateAsync({ orgId: currentOrgId, paymentId });
          restoredCount++;
        } catch (error) {
          // Continue with other restorations
        }
      }
      toast({ title: `Restored ${restoredCount} payment${restoredCount !== 1 ? 's' : ''}` });
    };

    toast({
      title: `Deleted ${deletedPaymentIds.length} payment${deletedPaymentIds.length !== 1 ? 's' : ''}`,
      action: (
        <button
          onClick={handleUndo}
          className="text-xs font-medium text-primary hover:underline"
        >
          Undo
        </button>
      ),
    });
  };

  // Reset selection when filters change
  useEffect(() => {
    setSelectedPayments(new Set());
  }, [showUnallocated, searchQuery, page]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">View and manage payments. Allocate payments to charges or create new charges from unallocated payments. Use selection checkboxes for bulk actions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
          <div className="space-y-3">
            {/* Select All Row */}
            {isAdmin && paginatedPayments.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 flex items-center justify-between">
                <button
                  onClick={toggleSelectAllPayments}
                  className="flex items-center gap-3 transition-colors"
                  title={isAllPaymentsSelected ? "Deselect all" : "Select all"}
                >
                  {isAllPaymentsSelected ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {isAllPaymentsSelected ? 'Deselect all' : 'Select all'}
                  </span>
                </button>
                {selectedPayments.size > 0 && (
                  <button
                    onClick={handleBulkDeletePayments}
                    className="w-7 h-7 flex items-center justify-center transition-colors hover:text-destructive"
                    title={`Delete ${selectedPayments.size} selected`}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            )}
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
                  isSelected={selectedPayments.has(payment.id)}
                  onToggleSelect={() => togglePaymentSelection(payment.id)}
                />
              ))}
            </StaggerChildren>
          </div>

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
{openCharges.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No open charges available</p>
                ) : (
                  <Select value={selectedChargeId} onValueChange={setSelectedChargeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a charge" />
                    </SelectTrigger>
                    <SelectContent>
                      {openCharges.map((charge) => (
                        <SelectItem key={charge.id} value={charge.id}>
                          {charge.title} - {charge.membership?.name || charge.membership?.user?.name || 'Unknown'} (
                          <Money cents={charge.balanceDueCents} size="xs" inline /> due)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
        onOpenChange={(open) => !open && resetCreateChargeDialog()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Charge from Payment</DialogTitle>
            <DialogDescription>
              Create a new charge and automatically allocate this payment to it.
            </DialogDescription>
          </DialogHeader>
          {creatingChargeFromPayment && (
            <div className="space-y-6 py-4">
              {/* Payment Info Banner */}
              <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Payment from</p>
                    <p className="font-medium">{creatingChargeFromPayment.payment.rawPayerName || 'Unknown Payer'}</p>
                  </div>
                  <Money cents={creatingChargeFromPayment.payment.unallocatedCents} size="lg" className="text-success" />
                </div>
              </div>

              {/* Charge Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Charge Details</h3>
                <div className="grid gap-4 md:grid-cols-2">
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
                      placeholder="e.g., Spring 2025 Dues"
                      value={creatingChargeFromPayment.title}
                      onChange={(e) =>
                        setCreatingChargeFromPayment({ ...creatingChargeFromPayment, title: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={(creatingChargeFromPayment.amountCents / 100).toFixed(2)}
                      disabled
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground">Amount is locked to match the payment</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date (optional)</Label>
                    <Input
                      type="date"
                      value={creatingChargeFromPayment.dueDate}
                      onChange={(e) =>
                        setCreatingChargeFromPayment({ ...creatingChargeFromPayment, dueDate: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Member Selection */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium">
                  Select Members
                  <span className="ml-2 text-muted-foreground font-normal">
                    ({selectedMembers.size} selected)
                  </span>
                </h3>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search members..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No active members. Add members first.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {/* Select All Row */}
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                        selectAll
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 hover:bg-secondary/50',
                      )}
                    >
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                          selectAll
                            ? 'bg-gradient-to-br from-primary to-blue-400 border-transparent'
                            : 'border-muted-foreground/30',
                        )}
                      >
                        {selectAll && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">All Members</span>
                      <span className="text-xs text-muted-foreground ml-auto">{members.length}</span>
                    </button>

                    {/* Member List */}
                    {filteredMembers.filter((m) => m.id).map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleMember(member.id)}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                          selectedMembers.has(member.id)
                            ? 'border-primary bg-primary/10'
                            : 'border-border/50 hover:bg-secondary/50',
                        )}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                            selectedMembers.has(member.id)
                              ? 'bg-gradient-to-br from-primary to-blue-400 border-transparent'
                              : 'border-muted-foreground/30',
                          )}
                        >
                          {selectedMembers.has(member.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <AvatarGradient name={member.displayName || member.name || 'Unknown'} size="sm" />
                        <span className="font-medium">{member.displayName || member.name || member.user?.name || 'Unknown'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={resetCreateChargeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreateCharge}
              disabled={createCharge.isPending || allocatePayment.isPending || selectedMembers.size === 0}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {(createCharge.isPending || allocatePayment.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                `Create Charge${selectedMembers.size > 1 ? 's' : ''} & Allocate`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Similar Payments Allocation Dialog */}
      <Dialog
        open={!!similarPaymentsDialog}
        onOpenChange={(open) => !open && setSimilarPaymentsDialog(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Allocate Similar Payments?</DialogTitle>
            <DialogDescription>
              Would you like to allocate any of these similar payments to "{similarPaymentsDialog?.chargeTitle}"?
            </DialogDescription>
          </DialogHeader>
          {similarPaymentsDialog && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Payments sorted by similarity to the charge amount. Select any to allocate:
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {similarPaymentsDialog.similarPayments.map((payment) => (
                  <button
                    key={payment.id}
                    type="button"
                    onClick={() => toggleSimilarPayment(payment.id)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                      selectedSimilarPayments.has(payment.id)
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 hover:bg-secondary/50',
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0',
                        selectedSimilarPayments.has(payment.id)
                          ? 'bg-gradient-to-br from-primary to-blue-400 border-transparent'
                          : 'border-muted-foreground/30',
                      )}
                    >
                      {selectedSimilarPayments.has(payment.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <AvatarGradient name={payment.rawPayerName || 'Unknown'} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{payment.rawPayerName || 'Unknown Payer'}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(payment.paidAt)}
                        {payment.memo && ` • "${payment.memo}"`}
                      </p>
                    </div>
                    <Money cents={payment.unallocatedCents} size="sm" />
                  </button>
                ))}
              </div>
              {selectedSimilarPayments.size > 0 && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm">
                    <span className="font-medium">{selectedSimilarPayments.size}</span> payment{selectedSimilarPayments.size > 1 ? 's' : ''} selected
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimilarPaymentsDialog(null)}>
              Skip
            </Button>
            <Button
              onClick={handleAllocateSimilarPayments}
              disabled={allocatePayment.isPending || selectedSimilarPayments.size === 0}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {allocatePayment.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Allocating...
                </>
              ) : (
                `Allocate ${selectedSimilarPayments.size > 0 ? selectedSimilarPayments.size : ''} Payment${selectedSimilarPayments.size !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
