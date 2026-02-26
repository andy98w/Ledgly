'use client';

import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import Link from 'next/link';
import { Plus, CreditCard, AlertCircle, TrendingUp, Wallet, Search, MoreHorizontal, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight, ChevronDown, Link2, Check, Users, Circle, CheckCircle2, X } from 'lucide-react';
import { useAutoAllocateToCharge, useRemoveAllocation, useBulkAutoAllocate } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
import { groupCharges } from '@/lib/utils/charge-grouping';
import { calculateNameSimilarity, deriveCategoryFromMemo } from '@/lib/utils/name-similarity';
import { usePayments, useUpdatePayment, useDeletePayment, useRestorePayment, useAllocatePayment, useBulkDeletePayments } from '@/lib/queries/payments';
import { useCharges, useCreateCharge } from '@/lib/queries/charges';
import { useMembers, useCreateMembers } from '@/lib/queries/members';
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
import { FadeIn } from '@/components/ui/page-transition';
import { AnimatedList } from '@/components/ui/animated-list';
import { PageHeader } from '@/components/ui/page-header';
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

const PaymentCard = memo(function PaymentCard({
  payment,
  onEdit,
  onDelete,
  onApplyToCharge,
  onUnallocate,
  isAdmin = false,
  isSelected = false,
  isDuplicate = false,
  onToggleSelect,
}: {
  payment: any;
  onEdit: (payment: any) => void;
  onDelete: (payment: any) => void;
  onApplyToCharge: (payment: any) => void;
  onUnallocate?: (allocation: { id: string; chargeId: string; amountCents: number }, paymentId: string) => void;
  isAdmin?: boolean;
  isSelected?: boolean;
  isDuplicate?: boolean;
  onToggleSelect?: () => void;
}) {
  const hasUnallocated = payment.unallocatedCents > 0;

  return (
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
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-medium truncate" title={payment.rawPayerName || 'Unknown Payer'}>
                  {payment.rawPayerName || 'Unknown Payer'}
                </p>
                {isDuplicate && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Possible Duplicate
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
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      {hasUnallocated ? (
                        <AlertCircle className="w-4 h-4 text-warning" />
                      ) : (
                        <Check className="w-4 h-4 text-success" />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{hasUnallocated ? 'Unallocated' : 'Allocated'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isAdmin ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onApplyToCharge(payment)}>
                      <Link2 className="h-4 w-4 mr-2" />
                      {hasUnallocated ? 'Apply to Charge' : 'Manage Allocations'}
                    </DropdownMenuItem>
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
              ) : (
                <div className="w-8 h-8" />
              )}
            </div>
          </div>
          {payment.allocations?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-2">Applied to:</p>
              <div className="flex flex-wrap gap-1">
                {payment.allocations.map((a: any) => (
                  <Badge key={a.id} variant="secondary" className="text-xs gap-1 pr-1">
                    {a.chargeTitle}: <Money cents={a.amountCents} size="xs" inline />
                    {isAdmin && onUnallocate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnallocate({ id: a.id, chargeId: a.chargeId, amountCents: a.amountCents }, payment.id);
                        }}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                        title="Remove allocation"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </MotionCardContent>
      </MotionCard>
  );
});

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
  const [allocationFilter, setAllocationFilter] = useState<'all' | 'allocated' | 'unallocated'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingPayment, setEditingPayment] = useState<EditPaymentData | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<any | null>(null);
  const [chargeDialogPayment, setChargeDialogPayment] = useState<any | null>(null);
  const [chargeDialogTab, setChargeDialogTab] = useState<'existing' | 'new'>('existing');
  const [selectedChargeId, setSelectedChargeId] = useState<string>('');
  const [allocationAmount, setAllocationAmount] = useState<number>(0);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [newChargeCategory, setNewChargeCategory] = useState<string>('DUES');
  const [newChargeTitle, setNewChargeTitle] = useState<string>('');
  const [newChargeAmountCents, setNewChargeAmountCents] = useState<number>(0);
  const [newChargeDueDate, setNewChargeDueDate] = useState<string>('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());

  // State for similar payments allocation flow
  const [similarPaymentsDialog, setSimilarPaymentsDialog] = useState<{
    chargeIds: string[];
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
  const { data, isLoading } = usePayments(currentOrgId);

  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();
  const restorePayment = useRestorePayment();
  const bulkDeletePayments = useBulkDeletePayments();
  const allocatePayment = useAllocatePayment();
  const createCharge = useCreateCharge();
  const createMembers = useCreateMembers();
  const autoAllocate = useAutoAllocateToCharge();
  const removeAllocation = useRemoveAllocation();
  const bulkAutoAllocate = useBulkAutoAllocate();

  // Fetch charges for allocation and members for creating charges
  const { data: chargesData } = useCharges(currentOrgId, { status: 'OPEN' });
  const { data: membersData } = useMembers(currentOrgId);
  const openCharges = chargesData?.data || [];
  const members = membersData?.data || [];
  const chargeGroups = useMemo(() => groupCharges(openCharges), [openCharges]);

  // Suggested charges based on name similarity to the current payment
  const suggestedCharges = useMemo(() => {
    if (!chargeDialogPayment?.rawPayerName || openCharges.length === 0) return [];
    const payerName = chargeDialogPayment.rawPayerName;
    return openCharges
      .map((charge) => {
        const memberName = (charge.membership as any)?.displayName || charge.membership?.name || charge.membership?.user?.name || '';
        const similarity = memberName ? calculateNameSimilarity(payerName, memberName) : 0;
        return { charge, similarity };
      })
      .filter((c) => c.similarity >= 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }, [chargeDialogPayment?.rawPayerName, openCharges]);

  // Check if the payer name matches an existing member (for hiding "create member" option)
  const payerMatchesMember = useMemo(() => {
    if (!chargeDialogPayment?.rawPayerName || members.length === 0) return null;
    const payerName = chargeDialogPayment.rawPayerName.toLowerCase().trim();
    for (const member of members) {
      const memberName = (member.displayName || member.name || member.user?.name || '').toLowerCase().trim();
      if (!memberName) continue;
      if (calculateNameSimilarity(chargeDialogPayment.rawPayerName, memberName) >= 0.8) return member.id;
      if (memberName.includes(payerName) || payerName.includes(memberName)) return member.id;
    }
    return null;
  }, [chargeDialogPayment?.rawPayerName, members]);

  // Auto-select matching member when dialog opens on "new" tab
  useEffect(() => {
    if (payerMatchesMember && chargeDialogPayment) {
      setSelectedMembers((prev) => {
        if (prev.size === 0) return new Set([payerMatchesMember]);
        return prev;
      });
    }
  }, [payerMatchesMember, chargeDialogPayment]);

  // Detect duplicate payments by fingerprint
  const duplicatePaymentIds = useMemo(() => {
    const payments = data?.data || [];
    const fingerprints = new Map<string, string[]>();
    for (const p of payments) {
      const dateStr = new Date(p.paidAt).toISOString().split('T')[0];
      const key = `${p.rawPayerName || ''}|${p.amountCents}|${dateStr}|${p.memo || ''}|${p.source || ''}`;
      const ids = fingerprints.get(key) || [];
      ids.push(p.id);
      fingerprints.set(key, ids);
    }
    const dupes = new Set<string>();
    fingerprints.forEach((ids) => {
      if (ids.length > 1) ids.forEach((id: string) => dupes.add(id));
    });
    return dupes;
  }, [data?.data]);

  // Filter payments by allocation status and search query
  const filteredPayments = data?.data.filter((payment) => {
    // Allocation filter
    if (allocationFilter === 'unallocated' && payment.unallocatedCents <= 0) return false;
    if (allocationFilter === 'allocated' && payment.unallocatedCents > 0) return false;

    // Search filter
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
  }, [allocationFilter, searchQuery]);

  // Calculate summary stats
  const totalPayments = filteredPayments.length;
  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amountCents, 0);
  const totalUnallocated = filteredPayments.reduce((sum, p) => sum + p.unallocatedCents, 0);

  const handleEdit = useCallback((payment: any) => {
    setEditingPayment({
      id: payment.id,
      amountCents: payment.amountCents,
      paidAt: new Date(payment.paidAt).toISOString().split('T')[0],
      rawPayerName: payment.rawPayerName || '',
      memo: payment.memo || '',
    });
  }, []);

  const handleSaveEdit = () => {
    if (!editingPayment || !currentOrgId) return;

    // Capture original values for undo
    const original = data?.data.find((p) => p.id === editingPayment.id);
    const undoData = original ? {
      amountCents: original.amountCents,
      paidAt: new Date(original.paidAt).toISOString().split('T')[0],
      rawPayerName: original.rawPayerName || '',
      memo: original.memo || '',
    } : null;
    const paymentId = editingPayment.id;

    updatePayment.mutate(
      {
        orgId: currentOrgId,
        paymentId,
        data: {
          amountCents: editingPayment.amountCents,
          paidAt: editingPayment.paidAt,
          rawPayerName: editingPayment.rawPayerName,
          memo: editingPayment.memo,
        },
      },
      {
        onSuccess: () => {
          toast({
            title: 'Payment updated',
            action: undoData ? (
              <button
                onClick={() => {
                  const redoData = { amountCents: editingPayment.amountCents, paidAt: editingPayment.paidAt, rawPayerName: editingPayment.rawPayerName, memo: editingPayment.memo };
                  updatePayment.mutate(
                    { orgId: currentOrgId!, paymentId, data: undoData },
                    {
                      onSuccess: () => toast({
                        title: 'Change reverted',
                        action: (
                          <button
                            onClick={() => updatePayment.mutate(
                              { orgId: currentOrgId!, paymentId, data: redoData },
                              { onSuccess: () => toast({ title: 'Payment updated' }) },
                            )}
                            className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                          >
                            Redo
                          </button>
                        ),
                      }),
                      onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
                    },
                  );
                }}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
              >
                Undo
              </button>
            ) : undefined,
          });
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

  const handleDelete = useCallback((payment: any) => {
    setDeletingPayment(payment);
  }, []);

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
              <button
                onClick={() => handleRestorePayment(paymentId)}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
              >
                Undo
              </button>
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
          toast({
            title: 'Payment restored',
            action: (
              <button
                onClick={() => deletePayment.mutate(
                  { orgId: currentOrgId!, paymentId },
                  { onSuccess: () => toast({ title: 'Payment deleted' }) },
                )}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
              >
                Redo
              </button>
            ),
          });
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

  const handleUnallocate = useCallback((allocation: { id: string; chargeId: string; amountCents: number }, paymentId: string) => {
    if (!currentOrgId) return;
    removeAllocation.mutate(
      { orgId: currentOrgId, allocationId: allocation.id },
      {
        onSuccess: () => {
          toast({
            title: 'Allocation removed',
            action: (
              <button
                onClick={() => {
                  allocatePayment.mutate(
                    { orgId: currentOrgId!, paymentId, allocations: [{ chargeId: allocation.chargeId, amountCents: allocation.amountCents }] },
                    {
                      onSuccess: (result: any) => {
                        const newAllocId = result?.allocations?.[0]?.id;
                        toast({
                          title: 'Allocation restored',
                          action: newAllocId ? (
                            <button
                              onClick={() => removeAllocation.mutate(
                                { orgId: currentOrgId!, allocationId: newAllocId },
                                { onSuccess: () => toast({ title: 'Allocation removed' }) },
                              )}
                              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                            >
                              Redo
                            </button>
                          ) : undefined,
                        });
                      },
                      onError: () => toast({ title: 'Failed to restore allocation', variant: 'destructive' }),
                    },
                  );
                }}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
              >
                Undo
              </button>
            ),
          });
        },
        onError: (error: any) => toast({ title: 'Error removing allocation', description: error.message || 'Please try again', variant: 'destructive' }),
      },
    );
  }, [currentOrgId, removeAllocation, allocatePayment, toast]);

  const openChargeDialog = useCallback((payment: any, tab: 'existing' | 'new') => {
    setChargeDialogPayment(payment);
    setChargeDialogTab(tab);
    setSelectedChargeId('');
    setAllocationAmount(payment.unallocatedCents);
    setExpandedGroupKey(null);
    setNewChargeCategory(deriveCategoryFromMemo(payment.memo || '') || 'DUES');
    setNewChargeTitle(payment.memo || 'Charge from payment');
    setNewChargeAmountCents(payment.unallocatedCents);
    setNewChargeDueDate(new Date().toISOString().split('T')[0]);
    if (payment.membershipId) {
      setSelectedMembers(new Set([payment.membershipId]));
    } else {
      setSelectedMembers(new Set());
    }
    setSelectAll(false);
    setMemberSearch('');
    setNewMemberName(payment.rawPayerName || '');
  }, []);

  const handleApplyToCharge = useCallback((payment: any) => {
    openChargeDialog(payment, 'existing');
  }, [openChargeDialog]);

  const closeChargeDialog = useCallback(() => {
    setChargeDialogPayment(null);
    setSelectedChargeId('');
    setAllocationAmount(0);
    setExpandedGroupKey(null);
    setSelectedMembers(new Set());
    setSelectAll(false);
    setMemberSearch('');
    setNewMemberName('');
  }, []);

  const handleInlineCreateMember = async () => {
    if (!currentOrgId || !newMemberName.trim()) return;
    try {
      const created = await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name: newMemberName.trim() }],
      });
      if (created.length > 0) {
        setSelectedMembers((prev) => { const next = new Set(prev); next.add(created[0].id); return next; });
        setNewMemberName('');
        toast({ title: `Added ${created[0].name}` });
      }
    } catch (error: any) {
      toast({
        title: 'Error adding member',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleConfirmAllocate = () => {
    if (!chargeDialogPayment || !currentOrgId || !selectedChargeId) return;

    allocatePayment.mutate(
      {
        orgId: currentOrgId,
        paymentId: chargeDialogPayment.id,
        allocations: [{ chargeId: selectedChargeId, amountCents: allocationAmount }],
      },
      {
        onSuccess: (result: any) => {
          const allocationId = result?.allocations?.[0]?.id;
          const redoPaymentId = chargeDialogPayment.id;
          const redoChargeId = selectedChargeId;
          const redoAmount = allocationAmount;
          toast({
            title: 'Payment allocated',
            action: allocationId ? (
              <button
                onClick={() => removeAllocation.mutate(
                  { orgId: currentOrgId!, allocationId },
                  {
                    onSuccess: () => toast({
                      title: 'Allocation removed',
                      action: (
                        <button
                          onClick={() => allocatePayment.mutate(
                            { orgId: currentOrgId!, paymentId: redoPaymentId, allocations: [{ chargeId: redoChargeId, amountCents: redoAmount }] },
                            { onSuccess: () => toast({ title: 'Payment allocated' }) },
                          )}
                          className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                          Redo
                        </button>
                      ),
                    }),
                    onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
                  },
                )}
                className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
              >
                Undo
              </button>
            ) : undefined,
          });
          closeChargeDialog();
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

  const handleConfirmCreateCharge = async () => {
    if (!chargeDialogPayment || !currentOrgId) return;

    if (selectedMembers.size === 0) {
      toast({ title: 'Please select at least one member', variant: 'destructive' });
      return;
    }

    try {
      const sourcePayment = chargeDialogPayment;

      const charges = await createCharge.mutateAsync({
        orgId: currentOrgId,
        data: {
          membershipIds: Array.from(selectedMembers),
          category: newChargeCategory as any,
          title: newChargeTitle,
          amountCents: newChargeAmountCents,
          dueDate: newChargeDueDate
            ? new Date(newChargeDueDate).toISOString()
            : undefined,
        },
      });

      const chargeArray = Array.isArray(charges) ? charges : [charges];
      const createdCharge = chargeArray[0];

      if (sourcePayment.unallocatedCents > 0) {
        try {
          const allocAmt = Math.min(sourcePayment.unallocatedCents, newChargeAmountCents);
          await allocatePayment.mutateAsync({
            orgId: currentOrgId,
            paymentId: sourcePayment.id,
            allocations: [{ chargeId: createdCharge.id, amountCents: allocAmt }],
          });
        } catch {
          // Ignore allocation error for source payment
        }
      }

      const allPayments = data?.data || [];
      const similarPayments = allPayments
        .filter((p) => p.id !== sourcePayment.id && p.unallocatedCents > 0)
        .map((p) => ({
          ...p,
          amountDiff: Math.abs(p.unallocatedCents - newChargeAmountCents),
        }))
        .sort((a, b) => a.amountDiff - b.amountDiff)
        .slice(0, 10);

      toast({
        title: `Charge created`,
        description: `Payment from ${sourcePayment.rawPayerName || 'Unknown'} has been allocated.`,
      });

      closeChargeDialog();

      // Collect all charge IDs (excluding the one the source payment was allocated to)
      const remainingChargeIds = chargeArray
        .filter((c: any) => c.id !== createdCharge.id)
        .map((c: any) => c.id);

      if (similarPayments.length > 0 && remainingChargeIds.length > 0) {
        setSimilarPaymentsDialog({
          chargeIds: remainingChargeIds,
          chargeTitle: newChargeTitle,
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
    let failedCount = 0;
    const availableChargeIds = [...similarPaymentsDialog.chargeIds];
    let chargeIndex = 0;

    for (const paymentId of Array.from(selectedSimilarPayments)) {
      if (chargeIndex >= availableChargeIds.length) break;

      const payment = similarPaymentsDialog.similarPayments.find((p) => p.id === paymentId);
      if (!payment) continue;

      try {
        await allocatePayment.mutateAsync({
          orgId: currentOrgId,
          paymentId,
          allocations: [{ chargeId: availableChargeIds[chargeIndex], amountCents: payment.unallocatedCents }],
        });
        allocatedCount++;
        totalAllocated += payment.unallocatedCents;
        chargeIndex++;
      } catch {
        failedCount++;
        chargeIndex++;
      }
    }

    if (allocatedCount > 0) {
      toast({
        title: `Allocated ${allocatedCount} payment${allocatedCount > 1 ? 's' : ''}`,
        description: `Total: $${(totalAllocated / 100).toFixed(2)} allocated to "${similarPaymentsDialog.chargeTitle}"`,
      });
    }
    if (failedCount > 0 && allocatedCount === 0) {
      toast({
        title: 'Allocation failed',
        description: 'No available charges remaining to allocate to.',
        variant: 'destructive',
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

  const togglePaymentSelection = useCallback((paymentId: string) => {
    setSelectedPayments((prev) => {
      const next = new Set(prev);
      if (next.has(paymentId)) {
        next.delete(paymentId);
      } else {
        next.add(paymentId);
      }
      return next;
    });
  }, []);

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

    try {
      const result = await bulkDeletePayments.mutateAsync({ orgId: currentOrgId, paymentIds });
      const deletedCount = result.deletedCount;
      setSelectedPayments(new Set());

      toast({
        title: `Deleted ${deletedCount} payment${deletedCount !== 1 ? 's' : ''}`,
        action: (
          <button
            onClick={async () => {
              let restoredCount = 0;
              for (const paymentId of paymentIds) {
                try { await restorePayment.mutateAsync({ orgId: currentOrgId, paymentId }); restoredCount++; } catch { /* continue */ }
              }
              toast({
                title: `Restored ${restoredCount} payment${restoredCount !== 1 ? 's' : ''}`,
                action: (
                  <button
                    onClick={async () => {
                      const redoResult = await bulkDeletePayments.mutateAsync({ orgId: currentOrgId, paymentIds });
                      toast({ title: `Deleted ${redoResult.deletedCount} payment${redoResult.deletedCount !== 1 ? 's' : ''}` });
                    }}
                    className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    Redo
                  </button>
                ),
              });
            }}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
          >
            Undo
          </button>
        ),
      });
    } catch {
      setSelectedPayments(new Set());
    }
  };

  const handleBulkAutoAllocate = async () => {
    if (!currentOrgId || selectedPayments.size === 0) return;

    const paymentIds = Array.from(selectedPayments);

    try {
      const result = await bulkAutoAllocate.mutateAsync({ orgId: currentOrgId, paymentIds });
      setSelectedPayments(new Set());

      if (result.successCount > 0) {
        toast({
          title: `Auto-allocated ${result.successCount} payment${result.successCount !== 1 ? 's' : ''}`,
          description: `$${(result.totalAllocatedCents / 100).toFixed(2)} allocated to matching charges.${result.skippedCount > 0 ? ` ${result.skippedCount} skipped (no match).` : ''}`,
        });
      } else {
        toast({
          title: 'No payments allocated',
          description: 'No matching members or open charges found for the selected payments.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Auto-allocation failed',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Reset selection when filters change
  useEffect(() => {
    setSelectedPayments(new Set());
  }, [allocationFilter, searchQuery, page]);

  return (
    <div data-tour="payments-list" className="space-y-8">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Payments"
          helpText="View and manage payments. Allocate payments to charges or create new charges from unallocated payments. Use selection checkboxes for bulk actions."
          actions={isAdmin && (
            <Button asChild className="bg-gradient-to-r from-primary to-blue-400 hover:opacity-90 transition-opacity">
              <Link href="/payments/new">
                <Plus className="w-4 h-4 mr-2" />
                Record Payment
              </Link>
            </Button>
          )}
        />
      </FadeIn>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Payments"
          value={totalPayments}
          description="Payments received"
          icon={CreditCard}
          delay={0}
          color="amber"
        />
        <StatCard
          title="Total Received"
          value={totalAmount}
          isMoney
          description="All time received"
          icon={TrendingUp}
          delay={0.1}
          color="emerald"
        />
        <StatCard
          title="Unallocated"
          value={totalUnallocated}
          isMoney
          description={totalUnallocated > 0 ? 'Needs attention' : 'All allocated'}
          icon={Wallet}
          delay={0.2}
          color="rose"
        />
      </div>

      {/* Filter */}
      <FadeIn delay={0.2}>
        <div className="flex items-center justify-between gap-4">
          <Select value={allocationFilter} onValueChange={(v) => setAllocationFilter(v as any)}>
            <SelectTrigger className="w-[160px] h-9 bg-secondary/30 border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="allocated">Allocated</SelectItem>
              <SelectItem value="unallocated">Unallocated</SelectItem>
            </SelectContent>
          </Select>
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
          <div className="rounded-xl border border-border/50 bg-card/50 py-16 text-center animate-in-scale">
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
            {!searchQuery && isAdmin && (
              <Button asChild className="bg-gradient-to-r from-primary to-blue-400">
                <Link href="/payments/new">Record your first payment</Link>
              </Button>
            )}
          </div>
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
                <div className={cn(
                  "flex items-center gap-1",
                  selectedPayments.size === 0 && "invisible"
                )}>
                  <button
                    onClick={handleBulkAutoAllocate}
                    className="w-7 h-7 flex items-center justify-center transition-all hover:text-primary"
                    title={`Auto-allocate ${selectedPayments.size} selected`}
                    disabled={bulkAutoAllocate.isPending}
                  >
                    {bulkAutoAllocate.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Link2 className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    )}
                  </button>
                  <button
                    onClick={handleBulkDeletePayments}
                    className="w-7 h-7 flex items-center justify-center transition-all hover:text-destructive"
                    title={`Delete ${selectedPayments.size} selected`}
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            )}
            <AnimatedList
              items={paginatedPayments}
              getKey={(p) => p.id}
              className="space-y-3"
              renderItem={(payment) => (
                <PaymentCard
                  payment={payment}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onApplyToCharge={handleApplyToCharge}
                  onUnallocate={handleUnallocate}
                  isAdmin={isAdmin}
                  isSelected={selectedPayments.has(payment.id)}
                  isDuplicate={duplicatePaymentIds.has(payment.id)}
                  onToggleSelect={() => togglePaymentSelection(payment.id)}
                />
              )}
            />
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

      {/* Apply to Charge Dialog */}
      <Dialog open={!!chargeDialogPayment} onOpenChange={(open) => !open && closeChargeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {chargeDialogPayment && chargeDialogPayment.unallocatedCents > 0 ? 'Apply to Charge' : 'Manage Allocations'}
            </DialogTitle>
            <DialogDescription>
              {chargeDialogPayment && chargeDialogPayment.unallocatedCents > 0
                ? 'Allocate this payment to an existing charge or create a new one.'
                : 'View and manage current allocations for this payment.'}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            // Use live payment data so allocations update after removal
            const livePayment = chargeDialogPayment
              ? data?.data.find((p) => p.id === chargeDialogPayment.id) || chargeDialogPayment
              : null;
            if (!livePayment) return null;
            const hasUnallocatedFunds = livePayment.unallocatedCents > 0;
            const hasAllocations = livePayment.allocations?.length > 0;
            return (
            <>
              {/* Payment info banner */}
              <div className="p-4 rounded-xl bg-success/10 border border-success/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Payment from</p>
                    <p className="font-medium">{livePayment.rawPayerName || 'Unknown Payer'}</p>
                  </div>
                  <div className="text-right">
                    <Money cents={livePayment.unallocatedCents} size="lg" className="text-success" />
                    <p className="text-xs text-muted-foreground">unallocated</p>
                  </div>
                </div>
              </div>

              {/* Current allocations */}
              {hasAllocations && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Current Allocations</p>
                  <div className="space-y-1">
                    {livePayment.allocations.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-secondary/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="secondary" className="text-xs shrink-0">{a.chargeTitle}</Badge>
                          <Money cents={a.amountCents} size="xs" inline />
                        </div>
                        <button
                          onClick={() => handleUnallocate({ id: a.id, chargeId: a.chargeId, amountCents: a.amountCents }, livePayment.id)}
                          className="ml-2 rounded-full p-1 hover:bg-destructive/20 hover:text-destructive transition-colors shrink-0"
                          title="Remove allocation"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab switcher - only when there are unallocated funds */}
              {hasUnallocatedFunds ? (
                <>
                  <div className="flex rounded-lg bg-secondary/50 p-1">
                    <button
                      onClick={() => setChargeDialogTab('existing')}
                      className={cn(
                        'flex-1 text-sm font-medium py-2 px-3 rounded-md transition-all',
                        chargeDialogTab === 'existing'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Existing Charge
                    </button>
                    <button
                      onClick={() => setChargeDialogTab('new')}
                      className={cn(
                        'flex-1 text-sm font-medium py-2 px-3 rounded-md transition-all',
                        chargeDialogTab === 'new'
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      New Charge
                    </button>
                  </div>

                  {/* Tab content */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-none">
                    {chargeDialogTab === 'existing' ? (
                  <div className="space-y-2 py-2">
                    {/* Suggested charges based on payer name similarity */}
                    {suggestedCharges.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Suggested</p>
                        {suggestedCharges.map(({ charge, similarity }) => {
                          const memberName = (charge.membership as any)?.displayName || charge.membership?.name || charge.membership?.user?.name || 'Unknown';
                          return (
                            <button
                              key={charge.id}
                              type="button"
                              onClick={() => {
                                setSelectedChargeId(charge.id);
                                setAllocationAmount(Math.min(chargeDialogPayment.unallocatedCents, charge.balanceDueCents));
                              }}
                              className={cn(
                                'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                                selectedChargeId === charge.id
                                  ? 'border-primary bg-primary/10'
                                  : 'border-primary/30 hover:bg-primary/5',
                              )}
                            >
                              <AvatarGradient name={memberName} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{charge.title}</p>
                                <p className="text-xs text-muted-foreground">{memberName}</p>
                              </div>
                              <Money cents={charge.balanceDueCents} size="sm" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {chargeGroups.length === 0 && suggestedCharges.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No open charges available</p>
                    ) : (
                      <>
                      {suggestedCharges.length > 0 && chargeGroups.length > 0 && (
                        <p className="text-xs font-medium text-muted-foreground pt-2">All Charges</p>
                      )}
                      {chargeGroups.map((group) => {
                        const isSingleMember = group.charges.length === 1;
                        const isExpanded = expandedGroupKey === group.key;

                        if (isSingleMember) {
                          const charge = group.charges[0];
                          const memberName = charge.membership?.displayName || charge.membership?.name || charge.membership?.user?.name || 'Unknown';
                          return (
                            <button
                              key={group.key}
                              type="button"
                              onClick={() => {
                                setSelectedChargeId(charge.id);
                                setAllocationAmount(Math.min(chargeDialogPayment.unallocatedCents, charge.balanceDueCents));
                              }}
                              className={cn(
                                'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                                selectedChargeId === charge.id
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border/50 hover:bg-secondary/50',
                              )}
                            >
                              <AvatarGradient name={memberName} size="sm" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{charge.title}</p>
                                <p className="text-xs text-muted-foreground">{memberName}</p>
                              </div>
                              <Money cents={charge.balanceDueCents} size="sm" />
                            </button>
                          );
                        }

                        // Multi-member group
                        const hasSelectedCharge = group.charges.some((c: any) => selectedChargeId === c.id);
                        return (
                          <div key={group.key}>
                            <button
                              type="button"
                              onClick={() => setExpandedGroupKey(isExpanded ? null : group.key)}
                              className={cn(
                                'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                                hasSelectedCharge && !isExpanded
                                  ? 'border-primary/50 bg-primary/5'
                                  : 'border-border/50 hover:bg-secondary/50',
                              )}
                            >
                              <div className="w-8 h-8 rounded-full bg-secondary/50 flex items-center justify-center shrink-0">
                                <Users className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{group.title}</p>
                                <Badge variant="secondary" className="text-xs">{group.memberCount} members</Badge>
                              </div>
                              <Money cents={group.totalAmount - group.totalPaid} size="sm" />
                              <ChevronDown className={cn(
                                'w-4 h-4 text-muted-foreground transition-transform',
                                isExpanded && 'rotate-180'
                              )} />
                            </button>
                            {isExpanded && (
                              <div className="ml-4 mt-1 space-y-1">
                                {group.charges.map((charge: any) => {
                                  const memberName = charge.membership?.displayName || charge.membership?.name || charge.membership?.user?.name || 'Unknown';
                                  return (
                                    <button
                                      key={charge.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedChargeId(charge.id);
                                        setAllocationAmount(Math.min(chargeDialogPayment.unallocatedCents, charge.balanceDueCents));
                                      }}
                                      className={cn(
                                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                                        selectedChargeId === charge.id
                                          ? 'border-primary bg-primary/10'
                                          : 'border-border/50 hover:bg-secondary/50',
                                      )}
                                    >
                                      <AvatarGradient name={memberName} size="sm" />
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{memberName}</p>
                                      </div>
                                      <Money cents={charge.balanceDueCents} size="sm" />
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      </>
                    )}

                    {/* Allocation amount input */}
                    {selectedChargeId && (
                      <div className="space-y-2 pt-2 border-t border-border/30">
                        <Label>Amount to Allocate ($)</Label>
                        <Input
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
                  </div>
                ) : (
                  /* New Charge tab */
                  <div className="space-y-4 py-2">
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 min-w-0">
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs">Category</Label>
                          <Select value={newChargeCategory} onValueChange={setNewChargeCategory}>
                            <SelectTrigger className="h-9">
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
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs">Title</Label>
                          <Input
                            placeholder="e.g., Spring 2025 Dues"
                            value={newChargeTitle}
                            onChange={(e) => setNewChargeTitle(e.target.value)}
                            className="h-9 min-w-0"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 min-w-0">
                        <div className="space-y-1 min-w-0">
                          <Label className="text-xs">Amount ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={(newChargeAmountCents / 100).toFixed(2)}
                            disabled
                            className="h-9 bg-muted cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Due Date (optional)</Label>
                          <Input
                            type="date"
                            value={newChargeDueDate}
                            onChange={(e) => setNewChargeDueDate(e.target.value)}
                            className="h-9"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Member Selection */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">
                          Members
                          <span className="ml-1 text-muted-foreground font-normal">
                            ({selectedMembers.size})
                          </span>
                        </h3>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search members..."
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          className="pl-9 h-9"
                        />
                      </div>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-none">
                        {/* Inline new member creation (hidden when payer matches existing member) */}
                        {!payerMatchesMember && (
                        <div className="flex items-center gap-2 p-2 rounded-xl border border-dashed border-border/50">
                          <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                          <Input
                            placeholder="New member name..."
                            value={newMemberName}
                            onChange={(e) => setNewMemberName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleInlineCreateMember()}
                            className="h-7 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleInlineCreateMember}
                            disabled={!newMemberName.trim() || createMembers.isPending}
                            className="h-7 px-2 text-xs shrink-0"
                          >
                            {createMembers.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                          </Button>
                        </div>
                        )}
                        {/* Select All */}
                        {members.length > 0 && (
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className={cn(
                              'flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all w-full',
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
                            <span className="font-medium text-sm text-muted-foreground">All Members</span>
                            <span className="text-xs text-muted-foreground ml-auto">{members.length}</span>
                          </button>
                        )}
                        {/* Member List */}
                        {filteredMembers.filter((m) => m.id).map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => toggleMember(member.id)}
                            className={cn(
                              'flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all w-full',
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
                            <span className="font-medium text-sm">{member.displayName || member.name || member.user?.name || 'Unknown'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                  </div>
                </>
              ) : hasAllocations ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Remove an allocation above to reallocate funds.
                </p>
              ) : null}
            </>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={closeChargeDialog}>
              {chargeDialogPayment && (data?.data.find((p) => p.id === chargeDialogPayment.id) || chargeDialogPayment).unallocatedCents > 0
                ? 'Cancel'
                : 'Done'}
            </Button>
            {chargeDialogPayment && (data?.data.find((p) => p.id === chargeDialogPayment.id) || chargeDialogPayment).unallocatedCents > 0 && (
              chargeDialogTab === 'existing' ? (
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
              ) : (
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
              )
            )}
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
              <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-none">
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
