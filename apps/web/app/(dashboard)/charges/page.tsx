'use client';

import { useCallback, useMemo, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Receipt, TrendingUp, Percent, Search, Trash2, Circle, CheckCircle2 } from 'lucide-react';
import { useCharges, useUpdateCharge, useVoidCharge, useRestoreCharge, useCreateCharge, useBulkVoidCharges } from '@/lib/queries/charges';
import { useMembers, useCreateMembers } from '@/lib/queries/members';
import { usePayments, useAutoAllocateToCharge, useRemoveAllocation, useAllocatePayment } from '@/lib/queries/payments';
import { useAuthStore } from '@/lib/stores/auth';
import { cn, formatCents, parseCents } from '@/lib/utils';
import { CHARGE_CATEGORY_LABELS, type ChargeCategory } from '@ledgly/shared';
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
import { FadeIn } from '@/components/ui/page-transition';
import { AnimatedList } from '@/components/ui/animated-list';
import { PageHeader } from '@/components/ui/page-header';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastUndoButton } from '@/components/ui/toast-undo-button';


import { groupCharges, type ChargeGroup } from '@/lib/utils/charge-grouping';
import { ChargeGroupCard } from '@/components/charges/charge-group-card';
import { ChargeCardSkeleton } from '@/components/charges/charge-card-skeleton';
import { ChargeEditDialog, type EditChargeData } from '@/components/charges/charge-edit-dialog';
import { ChargeDeleteDialog } from '@/components/charges/charge-delete-dialog';
import { ChargeGroupEditDialog } from '@/components/charges/charge-group-edit-dialog';
import { ChargeGroupDeleteDialog } from '@/components/charges/charge-group-delete-dialog';
import { ChargeCreateDialog } from '@/components/charges/charge-create-dialog';
import { ChargeAllocatePaymentDialog } from '@/components/charges/charge-allocate-payment-dialog';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { useChargeFilters } from '@/hooks/use-charge-filters';
import { useBulkSelection } from '@/hooks/use-bulk-selection';
import { BatchActionsBar } from '@/components/ui/batch-actions-bar';
import { ExportDropdown } from '@/components/export-dropdown';
import { exportCSV, exportPDF } from '@/lib/export';


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
  const bulkVoidCharges = useBulkVoidCharges();
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
  const handleEdit = useCallback((charge: any) => {
    setEditingCharge({
      id: charge.id,
      title: charge.title,
      amountCents: charge.amountCents,
      dueDate: charge.dueDate ? new Date(charge.dueDate).toISOString().split('T')[0] : null,
    });
  }, []);

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
              <ToastUndoButton
                onClick={() => {
                  const redoData = { title: editingCharge.title, amountCents: editingCharge.amountCents, dueDate: editingCharge.dueDate || null };
                  updateCharge.mutate(
                    { orgId: currentOrgId!, chargeId, data: undoData },
                    {
                      onSuccess: () => toast({
                        title: 'Change reverted',
                        action: (
                          <ToastUndoButton
                            onClick={() => updateCharge.mutate(
                              { orgId: currentOrgId!, chargeId, data: redoData },
                              { onSuccess: () => toast({ title: 'Charge updated' }) },
                            )}
                            label="Redo"
                          />
                        ),
                      }),
                      onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
                    },
                  );
                }}
              />
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
            action: <ToastUndoButton onClick={() => handleRestoreCharge(chargeId)} />,
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
            <ToastUndoButton
              onClick={() => voidCharge.mutate(
                { orgId: currentOrgId!, chargeId },
                { onSuccess: () => toast({ title: 'Charge deleted' }) },
              )}
              label="Redo"
            />
          ),
        }),
        onError: (error: any) => { toast({ title: 'Error restoring charge', description: error.message || 'Please try again', variant: 'destructive' }); },
      },
    );
  };

  const handleEditGroup = useCallback((group: ChargeGroup) => {
    setEditingGroup(group);
    setGroupEditData({
      title: group.title,
      amountCents: group.amountCents,
      dueDate: group.dueDate ? new Date(group.dueDate).toISOString().split('T')[0] : null,
    });
  }, []);

  const handleSaveGroupEdit = async (addedMemberIds: string[] = [], removedMemberIds: string[] = []) => {
    if (!editingGroup || !currentOrgId) return;
    try {
      // Update existing charges
      await Promise.all(
        editingGroup.charges
          .filter((c) => !removedMemberIds.includes(c.membershipId))
          .map((charge) =>
            updateCharge.mutateAsync({
              orgId: currentOrgId,
              chargeId: charge.id,
              data: { title: groupEditData.title, amountCents: groupEditData.amountCents, dueDate: groupEditData.dueDate || null },
            }),
          ),
      );

      // Void charges for removed members
      if (removedMemberIds.length > 0) {
        const chargesToVoid = editingGroup.charges.filter((c) => removedMemberIds.includes(c.membershipId));
        await Promise.all(
          chargesToVoid.map((c) => voidCharge.mutateAsync({ orgId: currentOrgId, chargeId: c.id })),
        );
      }

      // Create charges for added members
      if (addedMemberIds.length > 0) {
        await createCharge.mutateAsync({
          orgId: currentOrgId,
          data: {
            membershipIds: addedMemberIds,
            category: editingGroup.category as any,
            title: groupEditData.title,
            amountCents: groupEditData.amountCents,
            dueDate: groupEditData.dueDate ? new Date(groupEditData.dueDate).toISOString() : undefined,
          },
        });
      }

      const parts: string[] = [];
      const updatedCount = editingGroup.charges.length - removedMemberIds.length;
      if (updatedCount > 0) parts.push(`Updated ${updatedCount}`);
      if (addedMemberIds.length > 0) parts.push(`added ${addedMemberIds.length}`);
      if (removedMemberIds.length > 0) parts.push(`removed ${removedMemberIds.length}`);
      toast({ title: `${parts.join(', ')} charge${updatedCount + addedMemberIds.length !== 1 ? 's' : ''}` });
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

    try {
      const result = await bulkVoidCharges.mutateAsync({ orgId: currentOrgId, chargeIds });
      const deletedCount = result.voidedCount;
      clearSelection();

      toast({
        title: `Deleted ${deletedCount} charge${deletedCount !== 1 ? 's' : ''}`,
        action: (
          <ToastUndoButton
            onClick={async () => {
              let restoredCount = 0;
              for (const chargeId of chargeIds) {
                try { await restoreCharge.mutateAsync({ orgId: currentOrgId, chargeId }); restoredCount++; } catch { /* continue */ }
              }
              toast({
                title: `Restored ${restoredCount} charge${restoredCount !== 1 ? 's' : ''}`,
                action: (
                  <ToastUndoButton
                    onClick={async () => {
                      const redoResult = await bulkVoidCharges.mutateAsync({ orgId: currentOrgId, chargeIds });
                      toast({ title: `Deleted ${redoResult.voidedCount} charge${redoResult.voidedCount !== 1 ? 's' : ''}` });
                    }}
                    label="Redo"
                  />
                ),
              });
            }}
          />
        ),
      });
    } catch {
      clearSelection();
    }
  };

  const handleUnallocate = useCallback((allocation: { id: string; paymentId: string; amountCents: number }, chargeId: string) => {
    if (!currentOrgId) return;
    removeAllocation.mutate(
      { orgId: currentOrgId, allocationId: allocation.id },
      {
        onSuccess: () => {
          toast({
            title: 'Allocation removed',
            action: (
              <ToastUndoButton
                onClick={() => {
                  allocatePayment.mutate(
                    { orgId: currentOrgId!, paymentId: allocation.paymentId, allocations: [{ chargeId, amountCents: allocation.amountCents }] },
                    {
                      onSuccess: (result: any) => {
                        const newAllocId = result?.allocations?.[0]?.id;
                        toast({
                          title: 'Allocation restored',
                          action: newAllocId ? (
                            <ToastUndoButton
                              onClick={() => removeAllocation.mutate(
                                { orgId: currentOrgId!, allocationId: newAllocId },
                                { onSuccess: () => toast({ title: 'Allocation removed' }) },
                              )}
                              label="Redo"
                            />
                          ) : undefined,
                        });
                      },
                      onError: () => toast({ title: 'Failed to restore allocation', variant: 'destructive' }),
                    },
                  );
                }}
              />
            ),
          });
        },
        onError: (error: any) => toast({ title: 'Error removing allocation', description: error.message || 'Please try again', variant: 'destructive' }),
      },
    );
  }, [currentOrgId, removeAllocation, allocatePayment, toast]);

  const handleAllocatePaymentToCharge = useCallback((paymentId: string, chargeId: string, amountCents: number) => {
    if (!currentOrgId) return;
    allocatePayment.mutate(
      { orgId: currentOrgId, paymentId, allocations: [{ chargeId, amountCents }] },
      {
        onSuccess: (result: any) => {
          const allocationId = result?.allocations?.[0]?.id;
          toast({
            title: 'Payment allocated',
            action: allocationId ? (
              <ToastUndoButton
                onClick={() => removeAllocation.mutate(
                  { orgId: currentOrgId!, allocationId },
                  {
                    onSuccess: () => toast({
                      title: 'Allocation removed',
                      action: (
                        <ToastUndoButton
                          onClick={() => allocatePayment.mutate(
                            { orgId: currentOrgId!, paymentId, allocations: [{ chargeId, amountCents }] },
                            { onSuccess: () => toast({ title: 'Payment allocated' }) },
                          )}
                          label="Redo"
                        />
                      ),
                    }),
                    onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
                  },
                )}
              />
            ) : undefined,
          });
          setAllocatingCharge(null);
        },
        onError: (error: any) => {
          toast({ title: 'Error allocating payment', description: error.message || 'Please try again', variant: 'destructive' });
        },
      },
    );
  }, [currentOrgId, allocatePayment, removeAllocation, toast]);

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

  const handleExportCharges = (format: 'csv' | 'pdf') => {
    const headers = ['Member', 'Category', 'Title', 'Amount', 'Status', 'Due Date'];
    const rows = filteredCharges.map((c: any) => [
      c.membership?.name || c.membership?.user?.name || '',
      CHARGE_CATEGORY_LABELS[c.category as ChargeCategory] || c.category,
      c.title,
      `$${(c.amountCents / 100).toFixed(2)}`,
      c.status,
      c.dueDate ? new Date(c.dueDate).toLocaleDateString() : '',
    ]);
    const filename = `charges-${new Date().toISOString().split('T')[0]}`;
    if (format === 'csv') exportCSV(headers, rows, filename);
    else exportPDF('Charges', headers, rows, filename);
  };

  return (
    <TooltipProvider delayDuration={0}>
    <div data-tour="charges-list" className="space-y-8">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Charges"
          helpText="Create charges for dues, events, fines, or other fees. Assign to one or multiple members and track payment status. Use selection checkboxes for bulk actions."
          actions={
            <div className="flex items-center gap-2">
              <ExportDropdown
                onExportCSV={() => handleExportCharges('csv')}
                onExportPDF={() => handleExportCharges('pdf')}
              />
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={() => setShowCreateDialog(true)}
                  className="hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Create Charge
                </Button>
              )}
            </div>
          }
        />
      </FadeIn>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Total Charges" value={totalCharges} description="All time charges" icon={Receipt} delay={0} color="amber" />
        <StatCard title="Total Amount" value={totalAmount} isMoney description="Amount billed" icon={TrendingUp} delay={0.1} color="emerald" />
        <StatCard title="Collection Rate" value={`${collectionRate}%`} description={`${totalCollected > 0 ? `$${(totalCollected / 100).toFixed(0)}` : '$0'} collected`} icon={Percent} delay={0.2} color="violet" />
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
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
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
          <EmptyState
            icon={Receipt}
            title="No charges yet"
            description="Create your first charge to start tracking dues"
            action={isAdmin && (
              <Button asChild>
                <Link href="/charges/new">Create your first charge</Link>
              </Button>
            )}
            className="rounded-xl border border-border/50 bg-card/50"
          />
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
            <AnimatedList
              items={paginatedGroups}
              getKey={(g) => g.key}
              className="space-y-3"
              renderItem={(group) => (
                <ChargeGroupCard
                  group={group}
                  onEdit={handleEdit}
                  onDelete={setDeletingCharge}
                  onEditGroup={handleEditGroup}
                  onDeleteGroup={setDeletingGroup}
                  onUnallocate={handleUnallocate}
                  onAllocatePayment={setAllocatingCharge}
                  isAdmin={isAdmin}
                  selectedCharges={selectedCharges}
                  onToggleSelect={toggleChargeSelection}
                  onToggleSelectGroup={toggleGroupSelection}
                />
              )}
            />
          </div>

          {/* Pagination Bottom */}
          {groupedCharges.length > pageSize && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="justify-center pt-4" />
          )}
        </>
      )}

      {/* Dialogs */}
      <ChargeEditDialog charge={editingCharge} onChange={setEditingCharge} onSave={handleSaveEdit} isPending={updateCharge.isPending} />
      <ChargeDeleteDialog charge={deletingCharge} onClose={() => setDeletingCharge(null)} onConfirm={handleConfirmDelete} isPending={voidCharge.isPending} />
      <ChargeGroupEditDialog
        group={editingGroup}
        editData={groupEditData}
        onEditDataChange={setGroupEditData}
        onClose={() => setEditingGroup(null)}
        onSave={handleSaveGroupEdit}
        isPending={updateCharge.isPending || voidCharge.isPending || createCharge.isPending}
        members={members.map((m: any) => ({ id: m.id, displayName: m.displayName || m.name || 'Unknown' }))}
        currentMemberIds={editingGroup?.charges.map((c: any) => c.membershipId) || []}
      />
      <ChargeGroupDeleteDialog group={deletingGroup} onClose={() => setDeletingGroup(null)} onConfirm={handleConfirmDeleteGroup} isPending={voidCharge.isPending} />
      <ChargeCreateDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} onCreate={handleCreateCharge} members={members} loadingMembers={loadingMembers} isPending={createCharge.isPending} onAddMember={handleAddMember} isAddingMember={createMembers.isPending} />
      <ChargeAllocatePaymentDialog charge={allocatingCharge} payments={paymentsData?.data || []} onClose={() => setAllocatingCharge(null)} onAllocate={handleAllocatePaymentToCharge} isPending={allocatePayment.isPending} />

      <BatchActionsBar selectedCount={selectedCharges.size} onClear={clearSelection}>
        <Button variant="destructive" size="sm" onClick={handleBulkDeleteCharges} className="h-8">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Void
        </Button>
      </BatchActionsBar>
    </div>
    </TooltipProvider>
  );
}
