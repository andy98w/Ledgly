'use client';

import { useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Receipt, TrendingUp, Percent, Search, ChevronRight, ChevronLeft, Trash2, Info, Circle, CheckCircle2 } from 'lucide-react';
import { useCharges, useUpdateCharge, useVoidCharge, useRestoreCharge, useCreateCharge } from '@/lib/queries/charges';
import { useMembers, useCreateMembers } from '@/lib/queries/members';
import { usePayments, useAutoAllocateToCharge, useRemoveAllocation, useAllocatePayment } from '@/lib/queries/payments';
import { useAuthStore } from '@/lib/stores/auth';
import { cn, formatCents, parseCents } from '@/lib/utils';
import type { ChargeCategory } from '@ledgly/shared';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { FadeIn, StaggerChildren } from '@/components/ui/page-transition';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { groupCharges, type ChargeGroup } from '@/lib/utils/charge-grouping';
import { ChargeGroupCard } from '@/components/charges/charge-group-card';
import { ChargeCardSkeleton } from '@/components/charges/charge-card-skeleton';
import { ChargeEditDialog, type EditChargeData } from '@/components/charges/charge-edit-dialog';
import { ChargeDeleteDialog } from '@/components/charges/charge-delete-dialog';
import { ChargeGroupEditDialog } from '@/components/charges/charge-group-edit-dialog';
import { ChargeGroupDeleteDialog } from '@/components/charges/charge-group-delete-dialog';
import { ChargeCreateDialog } from '@/components/charges/charge-create-dialog';
import { ChargeAllocatePaymentDialog } from '@/components/charges/charge-allocate-payment-dialog';
import { useChargeFilters } from '@/hooks/use-charge-filters';
import { useBulkSelection } from '@/hooks/use-bulk-selection';

import { useState } from 'react';

export default function ChargesPage() {
  const {
    statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter,
    searchQuery, setSearchQuery,
    page, setPage,
    pageSize, handlePageSizeChange,
  } = useChargeFilters();

  const [editingCharge, setEditingCharge] = useState<EditChargeData | null>(null);
  const [deletingCharge, setDeletingCharge] = useState<any | null>(null);
  const [editingGroup, setEditingGroup] = useState<ChargeGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<ChargeGroup | null>(null);
  const [groupEditData, setGroupEditData] = useState({ title: '', amountCents: 0, dueDate: null as string | null });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [allocatingCharge, setAllocatingCharge] = useState<any | null>(null);

  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);
  const isAdmin = currentMembership?.role === 'ADMIN' || currentMembership?.role === 'TREASURER';
  const { toast } = useToast();

  const { data, isLoading } = useCharges(currentOrgId, {
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
  });

  const updateCharge = useUpdateCharge();
  const voidCharge = useVoidCharge();
  const restoreCharge = useRestoreCharge();
  const createCharge = useCreateCharge();
  const autoAllocate = useAutoAllocateToCharge();
  const removeAllocation = useRemoveAllocation();
  const allocatePayment = useAllocatePayment();
  const { data: paymentsData } = usePayments(currentOrgId);
  const { data: membersData, isLoading: loadingMembers } = useMembers(currentOrgId, { status: 'ACTIVE', limit: 100 });
  const members = membersData?.data || [];
  const createMembers = useCreateMembers();

  // Filter charges by search query
  const filteredCharges = data?.data.filter((charge) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const memberName = charge.membership?.name || charge.membership?.user?.name || '';
    return (
      charge.title?.toLowerCase().includes(query) ||
      memberName.toLowerCase().includes(query) ||
      charge.category?.toLowerCase().includes(query)
    );
  }) || [];

  // Group and paginate
  const groupedCharges = useMemo(() => groupCharges(filteredCharges), [filteredCharges]);
  const totalPages = Math.ceil(groupedCharges.length / pageSize);
  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return groupedCharges.slice(start, start + pageSize);
  }, [groupedCharges, page, pageSize]);

  // Bulk selection
  const allChargeIds = useMemo(
    () => paginatedGroups.flatMap((g) => g.charges.map((c) => c.id)),
    [paginatedGroups],
  );
  const { selected: selectedCharges, toggle: toggleChargeSelection, toggleAll: toggleSelectAllCharges, toggleGroup: toggleGroupSelection, clear: clearSelection, isAllSelected: isAllChargesSelected } = useBulkSelection(allChargeIds);

  // Reset selection when filters change
  useEffect(() => {
    clearSelection();
  }, [statusFilter, categoryFilter, searchQuery, page, clearSelection]);

  // Stats
  const totalCharges = filteredCharges.length;
  const totalAmount = filteredCharges.reduce((sum, c) => sum + c.amountCents, 0);
  const totalCollected = filteredCharges.reduce((sum, c) => sum + c.allocatedCents, 0);
  const collectionRate = totalAmount > 0 ? Math.round((totalCollected / totalAmount) * 100) : 0;

  // Handlers
  const handleEdit = (charge: any) => {
    setEditingCharge({
      id: charge.id,
      title: charge.title,
      amountCents: charge.amountCents,
      dueDate: charge.dueDate ? new Date(charge.dueDate).toISOString().split('T')[0] : null,
    });
  };

  const handleSaveEdit = () => {
    if (!editingCharge || !currentOrgId) return;
    // Capture original values for undo
    const original = data?.data.find((c) => c.id === editingCharge.id);
    const undoData = original
      ? { title: original.title, amountCents: original.amountCents, dueDate: original.dueDate ? new Date(original.dueDate).toISOString().split('T')[0] : null }
      : null;
    const chargeId = editingCharge.id;
    updateCharge.mutate(
      { orgId: currentOrgId, chargeId, data: { title: editingCharge.title, amountCents: editingCharge.amountCents, dueDate: editingCharge.dueDate || null } },
      {
        onSuccess: () => {
          toast({
            title: 'Charge updated',
            action: undoData ? (
              <button
                onClick={() => {
                  const redoData = { title: editingCharge.title, amountCents: editingCharge.amountCents, dueDate: editingCharge.dueDate || null };
                  updateCharge.mutate(
                    { orgId: currentOrgId!, chargeId, data: undoData },
                    {
                      onSuccess: () => toast({
                        title: 'Change reverted',
                        action: (
                          <button
                            onClick={() => updateCharge.mutate(
                              { orgId: currentOrgId!, chargeId, data: redoData },
                              { onSuccess: () => toast({ title: 'Charge updated' }) },
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
          setEditingCharge(null);
        },
        onError: (error: any) => { toast({ title: 'Error updating charge', description: error.message || 'Please try again', variant: 'destructive' }); },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!deletingCharge || !currentOrgId) return;
    const chargeId = deletingCharge.id;
    voidCharge.mutate(
      { orgId: currentOrgId, chargeId },
      {
        onSuccess: () => {
          toast({
            title: 'Charge deleted',
            description: 'You can undo this action.',
            action: <button onClick={() => handleRestoreCharge(chargeId)} className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors">Undo</button>,
          });
          setDeletingCharge(null);
        },
        onError: (error: any) => { toast({ title: 'Error deleting charge', description: error.message || 'Please try again', variant: 'destructive' }); },
      },
    );
  };

  const handleRestoreCharge = (chargeId: string) => {
    if (!currentOrgId) return;
    restoreCharge.mutate(
      { orgId: currentOrgId, chargeId },
      {
        onSuccess: () => toast({
          title: 'Charge restored',
          action: (
            <button
              onClick={() => voidCharge.mutate(
                { orgId: currentOrgId!, chargeId },
                { onSuccess: () => toast({ title: 'Charge deleted' }) },
              )}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
            >
              Redo
            </button>
          ),
        }),
        onError: (error: any) => { toast({ title: 'Error restoring charge', description: error.message || 'Please try again', variant: 'destructive' }); },
      },
    );
  };

  const handleEditGroup = (group: ChargeGroup) => {
    setEditingGroup(group);
    setGroupEditData({
      title: group.title,
      amountCents: group.amountCents,
      dueDate: group.dueDate ? new Date(group.dueDate).toISOString().split('T')[0] : null,
    });
  };

  const handleSaveGroupEdit = async () => {
    if (!editingGroup || !currentOrgId) return;
    try {
      await Promise.all(
        editingGroup.charges.map((charge) =>
          updateCharge.mutateAsync({
            orgId: currentOrgId,
            chargeId: charge.id,
            data: { title: groupEditData.title, amountCents: groupEditData.amountCents, dueDate: groupEditData.dueDate || null },
          }),
        ),
      );
      toast({ title: `Updated ${editingGroup.memberCount} charges successfully` });
      setEditingGroup(null);
    } catch (error: any) {
      toast({ title: 'Error updating charges', description: error.message || 'Please try again', variant: 'destructive' });
    }
  };

  const handleConfirmDeleteGroup = async () => {
    if (!deletingGroup || !currentOrgId) return;
    try {
      await Promise.all(
        deletingGroup.charges.map((c) => voidCharge.mutateAsync({ orgId: currentOrgId, chargeId: c.id })),
      );
      toast({ title: `Deleted ${deletingGroup.memberCount} charges`, description: 'You can undo individual charges from the list.' });
      setDeletingGroup(null);
    } catch (error: any) {
      toast({ title: 'Error deleting charges', description: error.message || 'Please try again', variant: 'destructive' });
    }
  };

  const handleBulkDeleteCharges = async () => {
    if (!currentOrgId || selectedCharges.size === 0) return;
    const chargeIds = Array.from(selectedCharges);
    const deletedChargeIds: string[] = [];

    for (const chargeId of chargeIds) {
      try {
        await voidCharge.mutateAsync({ orgId: currentOrgId, chargeId });
        deletedChargeIds.push(chargeId);
      } catch { /* continue */ }
    }
    clearSelection();

    toast({
      title: `Deleted ${deletedChargeIds.length} charge${deletedChargeIds.length !== 1 ? 's' : ''}`,
      action: (
        <button
          onClick={async () => {
            let restoredCount = 0;
            for (const chargeId of deletedChargeIds) {
              try { await restoreCharge.mutateAsync({ orgId: currentOrgId, chargeId }); restoredCount++; } catch { /* continue */ }
            }
            toast({
              title: `Restored ${restoredCount} charge${restoredCount !== 1 ? 's' : ''}`,
              action: (
                <button
                  onClick={async () => {
                    let redoneCount = 0;
                    for (const chargeId of deletedChargeIds) {
                      try { await voidCharge.mutateAsync({ orgId: currentOrgId, chargeId }); redoneCount++; } catch { /* continue */ }
                    }
                    toast({ title: `Deleted ${redoneCount} charge${redoneCount !== 1 ? 's' : ''}` });
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
  };

  const handleUnallocate = (allocation: { id: string; paymentId: string; amountCents: number }, chargeId: string) => {
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
                    { orgId: currentOrgId!, paymentId: allocation.paymentId, allocations: [{ chargeId, amountCents: allocation.amountCents }] },
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
  };

  const handleAllocatePaymentToCharge = (paymentId: string, chargeId: string, amountCents: number) => {
    if (!currentOrgId) return;
    allocatePayment.mutate(
      { orgId: currentOrgId, paymentId, allocations: [{ chargeId, amountCents }] },
      {
        onSuccess: (result: any) => {
          const allocationId = result?.allocations?.[0]?.id;
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
                            { orgId: currentOrgId!, paymentId, allocations: [{ chargeId, amountCents }] },
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
          setAllocatingCharge(null);
        },
        onError: (error: any) => {
          toast({ title: 'Error allocating payment', description: error.message || 'Please try again', variant: 'destructive' });
        },
      },
    );
  };

  const handleAddMember = async (name: string): Promise<{ id: string; displayName: string } | null> => {
    if (!currentOrgId) return null;
    try {
      const result = await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name }],
      });
      const newMember = result[0];
      if (newMember) {
        toast({ title: `Added ${newMember.name}` });
        return { id: newMember.id, displayName: newMember.name };
      }
      return null;
    } catch (error: any) {
      toast({ title: 'Failed to add member', description: error.message || 'Please try again', variant: 'destructive' });
      return null;
    }
  };

  const handleCreateCharge = async (formData: { category: ChargeCategory; title: string; amount: string; dueDate: string; membershipIds: string[] }) => {
    if (!currentOrgId) return;
    if (formData.membershipIds.length === 0) { toast({ title: 'Please select at least one member', variant: 'destructive' }); return; }
    if (!formData.title.trim()) { toast({ title: 'Please enter a title', variant: 'destructive' }); return; }
    if (!formData.amount) { toast({ title: 'Please enter an amount', variant: 'destructive' }); return; }

    try {
      const charges = await createCharge.mutateAsync({
        orgId: currentOrgId,
        data: {
          membershipIds: formData.membershipIds,
          category: formData.category,
          title: formData.title,
          amountCents: parseCents(formData.amount),
          dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
        },
      });

      let totalAllocated = 0;
      const chargeArray = Array.isArray(charges) ? charges : [charges];
      for (const charge of chargeArray) {
        try {
          const result = await autoAllocate.mutateAsync({ orgId: currentOrgId, chargeId: charge.id });
          totalAllocated += result.allocatedCents || 0;
        } catch { /* ignore allocation errors */ }
      }

      toast({
        title: 'Charge created successfully',
        ...(totalAllocated > 0 && { description: `Auto-allocated ${formatCents(totalAllocated)} from existing payments` }),
      });
      setShowCreateDialog(false);
    } catch (error: any) {
      toast({ title: 'Error creating charge', description: error.message || 'Please try again', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Charges</h1>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">Create charges for dues, events, fines, or other fees. Assign to one or multiple members and track payment status. Use selection checkboxes for bulk actions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-gradient-to-r from-primary to-blue-400 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Charge
          </Button>
        </div>
      </FadeIn>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Total Charges" value={totalCharges} description="All time charges" icon={Receipt} delay={0} />
        <StatCard title="Total Amount" value={totalAmount} isMoney description="Amount billed" icon={TrendingUp} delay={0.1} />
        <StatCard title="Collection Rate" value={`${collectionRate}%`} description={`${totalCollected > 0 ? `$${(totalCollected / 100).toFixed(0)}` : '$0'} collected`} icon={Percent} delay={0.2} />
      </div>

      {/* Filters */}
      <FadeIn delay={0.2}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3">
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[150px] bg-secondary/30 border-border/50">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="PARTIALLY_PAID">Partial</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[150px] bg-secondary/30 border-border/50">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="DUES">Dues</SelectItem>
                <SelectItem value="EVENT">Event</SelectItem>
                <SelectItem value="FINE">Fine</SelectItem>
                <SelectItem value="MERCH">Merchandise</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search title, member..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-secondary/30 border-border/50"
            />
          </div>
        </div>
      </FadeIn>

      {/* Pagination Top */}
      {!isLoading && groupedCharges.length > 0 && (
        <FadeIn delay={0.25}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show</span>
              <Select value={String(pageSize)} onValueChange={(v) => handlePageSizeChange(Number(v))}>
                <SelectTrigger className="w-[70px] h-8 bg-secondary/30 border-border/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[80px] text-center">{page} / {totalPages || 1}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Charges List */}
      {isLoading ? (
        <div className="space-y-3">
          <ChargeCardSkeleton />
          <ChargeCardSkeleton />
          <ChargeCardSkeleton />
        </div>
      ) : filteredCharges.length === 0 ? (
        <FadeIn delay={0.3}>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-border/50 bg-card/50 py-16 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Receipt className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{searchQuery ? 'No charges found' : 'No charges yet'}</h3>
            <p className="text-muted-foreground mb-6">{searchQuery ? 'Try adjusting your search' : 'Create your first charge to start collecting'}</p>
            {!searchQuery && (
              <Button onClick={() => setShowCreateDialog(true)} className="bg-gradient-to-r from-primary to-blue-400">Create your first charge</Button>
            )}
          </motion.div>
        </FadeIn>
      ) : (
        <>
          <div className="space-y-3">
            {isAdmin && paginatedGroups.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 flex items-center justify-between">
                <button onClick={toggleSelectAllCharges} className="flex items-center gap-3 transition-colors" title={isAllChargesSelected ? "Deselect all" : "Select all"}>
                  {isAllChargesSelected ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />}
                  <span className="text-sm text-muted-foreground">{isAllChargesSelected ? 'Deselect all' : 'Select all'}</span>
                </button>
                <button onClick={handleBulkDeleteCharges} className={cn("w-7 h-7 flex items-center justify-center transition-all hover:text-destructive", selectedCharges.size === 0 && "invisible")} title={`Delete ${selectedCharges.size} selected`}>
                  <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            )}
            <StaggerChildren className="space-y-3">
              {paginatedGroups.map((group) => (
                <ChargeGroupCard
                  key={group.key}
                  group={group}
                  onEdit={handleEdit}
                  onDelete={(charge) => setDeletingCharge(charge)}
                  onEditGroup={handleEditGroup}
                  onDeleteGroup={(group) => setDeletingGroup(group)}
                  onUnallocate={handleUnallocate}
                  onAllocatePayment={(charge) => setAllocatingCharge(charge)}
                  isAdmin={isAdmin}
                  selectedCharges={selectedCharges}
                  onToggleSelect={toggleChargeSelection}
                  onToggleSelectGroup={toggleGroupSelection}
                />
              ))}
            </StaggerChildren>
          </div>

          {/* Pagination Bottom */}
          {groupedCharges.length > pageSize && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[80px] text-center">{page} / {totalPages}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <ChargeEditDialog charge={editingCharge} onChange={setEditingCharge} onSave={handleSaveEdit} isPending={updateCharge.isPending} />
      <ChargeDeleteDialog charge={deletingCharge} onClose={() => setDeletingCharge(null)} onConfirm={handleConfirmDelete} isPending={voidCharge.isPending} />
      <ChargeGroupEditDialog group={editingGroup} editData={groupEditData} onEditDataChange={setGroupEditData} onClose={() => setEditingGroup(null)} onSave={handleSaveGroupEdit} isPending={updateCharge.isPending} />
      <ChargeGroupDeleteDialog group={deletingGroup} onClose={() => setDeletingGroup(null)} onConfirm={handleConfirmDeleteGroup} isPending={voidCharge.isPending} />
      <ChargeCreateDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} onCreate={handleCreateCharge} members={members} loadingMembers={loadingMembers} isPending={createCharge.isPending} onAddMember={handleAddMember} isAddingMember={createMembers.isPending} />
      <ChargeAllocatePaymentDialog charge={allocatingCharge} payments={paymentsData?.data || []} onClose={() => setAllocatingCharge(null)} onAllocate={handleAllocatePaymentToCharge} isPending={allocatePayment.isPending} />
    </div>
  );
}
