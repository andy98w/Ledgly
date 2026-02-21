'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Receipt, AlertCircle, TrendingUp, Percent, Search, MoreHorizontal, Pencil, Trash2, Loader2, ChevronDown, ChevronRight, ChevronLeft, Users, Check } from 'lucide-react';
import { useCharges, useUpdateCharge, useVoidCharge, useRestoreCharge, useCreateCharge } from '@/lib/queries/charges';
import { useMembers } from '@/lib/queries/members';
import { useAutoAllocateToCharge } from '@/lib/queries/payments';
import { useAuthStore } from '@/lib/stores/auth';
import { formatDate, formatCents, parseCents, cn } from '@/lib/utils';
import { CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS, type ChargeCategory } from '@ledgly/shared';
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

interface EditChargeData {
  id: string;
  title: string;
  amountCents: number;
  dueDate: string | null;
}

interface ChargeGroup {
  key: string;
  title: string;
  category: string;
  amountCents: number;
  dueDate: string | null;
  createdAt: string;
  charges: any[];
  totalAmount: number;
  totalPaid: number;
  memberCount: number;
}

// Group charges by title + category + due date + created within 1 minute of each other
function groupCharges(charges: any[]): ChargeGroup[] {
  const groups: Map<string, ChargeGroup> = new Map();

  // Sort by createdAt first
  const sorted = [...charges].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const charge of sorted) {
    // Create a key based on title + category + dueDate
    const dueDateKey = charge.dueDate ? new Date(charge.dueDate).toISOString().split('T')[0] : 'no-due';
    const baseKey = `${charge.title}|${charge.category}|${dueDateKey}`;

    // Find existing group within 1 minute
    let matched = false;
    const groupEntries = Array.from(groups.entries());
    for (const [key, group] of groupEntries) {
      if (key.startsWith(baseKey)) {
        const groupTime = new Date(group.createdAt).getTime();
        const chargeTime = new Date(charge.createdAt).getTime();
        // If within 1 minute (60000 ms) of first charge in group
        if (Math.abs(chargeTime - groupTime) < 60000) {
          group.charges.push(charge);
          group.totalAmount += charge.amountCents;
          group.totalPaid += charge.allocatedCents || 0;
          group.memberCount++;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      const groupKey = `${baseKey}|${charge.createdAt}`;
      groups.set(groupKey, {
        key: groupKey,
        title: charge.title,
        category: charge.category,
        amountCents: charge.amountCents,
        dueDate: charge.dueDate,
        createdAt: charge.createdAt,
        charges: [charge],
        totalAmount: charge.amountCents,
        totalPaid: charge.allocatedCents || 0,
        memberCount: 1,
      });
    }
  }

  // Sort groups by createdAt descending (newest first)
  return Array.from(groups.values()).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function ChargeCard({
  charge,
  onEdit,
  onDelete,
  nested = false,
  isAdmin = false,
}: {
  charge: any;
  onEdit: (charge: any) => void;
  onDelete: (charge: any) => void;
  nested?: boolean;
  isAdmin?: boolean;
}) {
  const isPaid = charge.status === 'PAID';
  const isOverdue =
    !isPaid && charge.dueDate && new Date(charge.dueDate) < new Date();

  const content = (
    <MotionCard className={nested ? 'border-border/30' : ''}>
      <MotionCardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AvatarGradient
              name={charge.membership?.displayName || 'Unknown'}
              size="sm"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{nested ? charge.membership?.displayName : charge.title}</p>
                {isOverdue && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Overdue
                  </Badge>
                )}
              </div>
              {!nested && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{charge.membership?.displayName}</span>
                  <span className="opacity-30">•</span>
                  <Badge variant="outline" className="text-xs">
                    {CHARGE_CATEGORY_LABELS[charge.category as keyof typeof CHARGE_CATEGORY_LABELS]}
                  </Badge>
                  {charge.dueDate && (
                    <>
                      <span className="opacity-30">•</span>
                      <span>Due {formatDate(charge.dueDate)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right space-y-1">
              <div className="flex items-center justify-end gap-2">
                <Money cents={charge.amountCents} size="sm" />
                {isPaid && (
                  <Badge variant="success" className="text-xs">Paid</Badge>
                )}
              </div>
              {!isPaid && (
                <p className="text-sm text-destructive">
                  <Money cents={charge.balanceDueCents} size="xs" inline className="text-destructive" /> due
                </p>
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
                  <DropdownMenuItem onClick={() => onEdit(charge)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(charge)}
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
      </MotionCardContent>
    </MotionCard>
  );

  if (nested) {
    return content;
  }

  return <StaggerItem>{content}</StaggerItem>;
}

function ChargeGroupCard({
  group,
  onEdit,
  onDelete,
  onEditGroup,
  onDeleteGroup,
  isAdmin = false,
}: {
  group: ChargeGroup;
  onEdit: (charge: any) => void;
  onDelete: (charge: any) => void;
  onEditGroup: (group: ChargeGroup) => void;
  onDeleteGroup: (group: ChargeGroup) => void;
  isAdmin?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // If only one charge in group, render as single charge
  if (group.charges.length === 1) {
    return (
      <ChargeCard
        charge={group.charges[0]}
        onEdit={onEdit}
        onDelete={onDelete}
        isAdmin={isAdmin}
      />
    );
  }

  const isOverdue =
    group.dueDate && new Date(group.dueDate) < new Date();
  const paidCount = group.charges.filter(c => c.status === 'PAID').length;
  const allPaid = paidCount === group.charges.length;
  const balanceDue = group.totalAmount - group.totalPaid;

  return (
    <StaggerItem>
      <MotionCard>
        <MotionCardContent className="p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-3 text-left flex-1"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{group.title}</p>
                  <Badge variant="secondary" className="text-xs">
                    {group.memberCount} members
                  </Badge>
                  {isOverdue && !allPaid && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Overdue
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {CHARGE_CATEGORY_LABELS[group.category as keyof typeof CHARGE_CATEGORY_LABELS]}
                  </Badge>
                  {group.dueDate && (
                    <>
                      <span className="opacity-30">•</span>
                      <span>Due {formatDate(group.dueDate)}</span>
                    </>
                  )}
                  <span className="opacity-30">•</span>
                  <span>{paidCount}/{group.memberCount} paid</span>
                </div>
              </div>
            </button>
            <div className="flex items-center gap-4">
              <div className="text-right space-y-1">
                <div className="flex items-center justify-end gap-2">
                  <Money cents={group.totalAmount} size="sm" />
                  {allPaid && (
                    <Badge variant="success" className="text-xs">All Paid</Badge>
                  )}
                </div>
                {!allPaid && (
                  <p className="text-sm text-destructive">
                    <Money cents={balanceDue} size="xs" inline className="text-destructive" /> due
                  </p>
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
                    <DropdownMenuItem onClick={() => onEditGroup(group)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit All ({group.memberCount})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDeleteGroup(group)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete All ({group.memberCount})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
                  {group.charges.map((charge) => (
                    <ChargeCard
                      key={charge.id}
                      charge={charge}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      nested
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
}

function ChargeCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="text-right space-y-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
      </div>
    </div>
  );
}

export default function ChargesPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingCharge, setEditingCharge] = useState<EditChargeData | null>(null);
  const [deletingCharge, setDeletingCharge] = useState<any | null>(null);
  const [editingGroup, setEditingGroup] = useState<ChargeGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<ChargeGroup | null>(null);
  const [groupEditData, setGroupEditData] = useState<{ title: string; amountCents: number; dueDate: string | null }>({ title: '', amountCents: 0, dueDate: null });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [newChargeData, setNewChargeData] = useState({
    category: 'DUES' as ChargeCategory,
    title: '',
    amount: '',
    dueDate: '',
  });

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
  const { data: membersData, isLoading: loadingMembers } = useMembers(currentOrgId, { status: 'ACTIVE', limit: 100 });
  const members = membersData?.data || [];

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

  // Group charges by title/date
  const groupedCharges = useMemo(() => groupCharges(filteredCharges), [filteredCharges]);

  // Pagination
  const totalPages = Math.ceil(groupedCharges.length / pageSize);
  const paginatedGroups = useMemo(() => {
    const start = (page - 1) * pageSize;
    return groupedCharges.slice(start, start + pageSize);
  }, [groupedCharges, page, pageSize]);

  // Reset to page 1 when filters change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  // Reset page when filters or search changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, categoryFilter, searchQuery]);

  // Filtered members for create dialog
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const query = memberSearch.toLowerCase();
    return members.filter((m) => m.displayName?.toLowerCase().includes(query));
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

  const resetCreateDialog = () => {
    setShowCreateDialog(false);
    setSelectedMembers(new Set());
    setSelectAll(false);
    setMemberSearch('');
    setNewChargeData({ category: 'DUES', title: '', amount: '', dueDate: '' });
  };

  const handleCreateCharge = async () => {
    if (!currentOrgId) return;

    if (selectedMembers.size === 0) {
      toast({ title: 'Please select at least one member', variant: 'destructive' });
      return;
    }
    if (!newChargeData.title.trim()) {
      toast({ title: 'Please enter a title', variant: 'destructive' });
      return;
    }
    if (!newChargeData.amount) {
      toast({ title: 'Please enter an amount', variant: 'destructive' });
      return;
    }

    try {
      const charges = await createCharge.mutateAsync({
        orgId: currentOrgId,
        data: {
          membershipIds: Array.from(selectedMembers),
          category: newChargeData.category,
          title: newChargeData.title,
          amountCents: parseCents(newChargeData.amount),
          dueDate: newChargeData.dueDate ? new Date(newChargeData.dueDate).toISOString() : undefined,
        },
      });

      // Try to auto-allocate for each charge
      let totalAllocated = 0;
      const chargeArray = Array.isArray(charges) ? charges : [charges];
      for (const charge of chargeArray) {
        try {
          const result = await autoAllocate.mutateAsync({
            orgId: currentOrgId,
            chargeId: charge.id,
          });
          totalAllocated += result.allocatedCents || 0;
        } catch {
          // Ignore allocation errors
        }
      }

      if (totalAllocated > 0) {
        toast({
          title: 'Charge created successfully',
          description: `Auto-allocated ${formatCents(totalAllocated)} from existing payments`,
        });
      } else {
        toast({ title: 'Charge created successfully' });
      }
      resetCreateDialog();
    } catch (error: any) {
      toast({
        title: 'Error creating charge',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  // Calculate summary stats
  const totalCharges = filteredCharges.length;
  const totalAmount = filteredCharges.reduce((sum, c) => sum + c.amountCents, 0);
  const totalCollected = filteredCharges.reduce((sum, c) => sum + c.allocatedCents, 0);
  const collectionRate = totalAmount > 0 ? Math.round((totalCollected / totalAmount) * 100) : 0;

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

    updateCharge.mutate(
      {
        orgId: currentOrgId,
        chargeId: editingCharge.id,
        data: {
          title: editingCharge.title,
          amountCents: editingCharge.amountCents,
          dueDate: editingCharge.dueDate || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Charge updated successfully' });
          setEditingCharge(null);
        },
        onError: (error: any) => {
          toast({
            title: 'Error updating charge',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleDelete = (charge: any) => {
    setDeletingCharge(charge);
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
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestoreCharge(chargeId)}
              >
                Undo
              </Button>
            ),
          });
          setDeletingCharge(null);
        },
        onError: (error: any) => {
          toast({
            title: 'Error deleting charge',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleRestoreCharge = (chargeId: string) => {
    if (!currentOrgId) return;

    restoreCharge.mutate(
      { orgId: currentOrgId, chargeId },
      {
        onSuccess: () => {
          toast({ title: 'Charge restored' });
        },
        onError: (error: any) => {
          toast({
            title: 'Error restoring charge',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
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

    // Update all charges in the group
    const promises = editingGroup.charges.map((charge) =>
      updateCharge.mutateAsync({
        orgId: currentOrgId,
        chargeId: charge.id,
        data: {
          title: groupEditData.title,
          amountCents: groupEditData.amountCents,
          dueDate: groupEditData.dueDate || null,
        },
      })
    );

    try {
      await Promise.all(promises);
      toast({ title: `Updated ${editingGroup.memberCount} charges successfully` });
      setEditingGroup(null);
    } catch (error: any) {
      toast({
        title: 'Error updating charges',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteGroup = (group: ChargeGroup) => {
    setDeletingGroup(group);
  };

  const handleConfirmDeleteGroup = async () => {
    if (!deletingGroup || !currentOrgId) return;

    const chargeIds = deletingGroup.charges.map(c => c.id);

    // Delete all charges in the group
    const promises = chargeIds.map((chargeId) =>
      voidCharge.mutateAsync({ orgId: currentOrgId, chargeId })
    );

    try {
      await Promise.all(promises);
      toast({
        title: `Deleted ${deletingGroup.memberCount} charges`,
        description: 'You can undo individual charges from the list.',
      });
      setDeletingGroup(null);
    } catch (error: any) {
      toast({
        title: 'Error deleting charges',
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
            <h1 className="text-3xl font-bold tracking-tight">Charges</h1>
            <p className="text-muted-foreground mt-1">Manage dues, fees, and charges</p>
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

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Charges"
          value={totalCharges}
          description="All time charges"
          icon={Receipt}
          delay={0}
        />
        <StatCard
          title="Total Amount"
          value={totalAmount}
          isMoney
          description="Amount billed"
          icon={TrendingUp}
          delay={0.1}
        />
        <StatCard
          title="Collection Rate"
          value={`${collectionRate}%`}
          description={`${totalCollected > 0 ? `$${(totalCollected / 100).toFixed(0)}` : '$0'} collected`}
          icon={Percent}
          delay={0.2}
        />
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

      {/* Pagination Controls - Top */}
      {!isLoading && groupedCharges.length > 0 && (
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
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? 'No charges found' : 'No charges yet'}
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery
                ? 'Try adjusting your search'
                : 'Create your first charge to start collecting'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setShowCreateDialog(true)} className="bg-gradient-to-r from-primary to-blue-400">
                Create your first charge
              </Button>
            )}
          </motion.div>
        </FadeIn>
      ) : (
        <>
          <StaggerChildren className="space-y-3">
            {paginatedGroups.map((group) => (
              <ChargeGroupCard
                key={group.key}
                group={group}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onEditGroup={handleEditGroup}
                onDeleteGroup={handleDeleteGroup}
                isAdmin={isAdmin}
              />
            ))}
          </StaggerChildren>

          {/* Pagination Controls - Bottom */}
          {groupedCharges.length > pageSize && (
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
      <Dialog open={!!editingCharge} onOpenChange={(open) => !open && setEditingCharge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Charge</DialogTitle>
            <DialogDescription>
              Update the charge details below.
            </DialogDescription>
          </DialogHeader>
          {editingCharge && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={editingCharge.title}
                  onChange={(e) => setEditingCharge({ ...editingCharge, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={(editingCharge.amountCents / 100).toFixed(2)}
                  onChange={(e) => setEditingCharge({
                    ...editingCharge,
                    amountCents: Math.round(parseFloat(e.target.value || '0') * 100)
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={editingCharge.dueDate || ''}
                  onChange={(e) => setEditingCharge({ ...editingCharge, dueDate: e.target.value || null })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCharge(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateCharge.isPending}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {updateCharge.isPending ? (
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
      <Dialog open={!!deletingCharge} onOpenChange={(open) => !open && setDeletingCharge(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Charge</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this charge? This action will void the charge and remove any payment allocations.
            </DialogDescription>
          </DialogHeader>
          {deletingCharge && (
            <div className="py-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="font-medium">{deletingCharge.title}</p>
                <p className="text-sm text-muted-foreground">
                  {deletingCharge.membership?.displayName} • <Money cents={deletingCharge.amountCents} size="xs" inline />
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCharge(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={voidCharge.isPending}
            >
              {voidCharge.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Charge'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit All Charges</DialogTitle>
            <DialogDescription>
              Update {editingGroup?.memberCount} charges at once.
            </DialogDescription>
          </DialogHeader>
          {editingGroup && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="group-title">Title</Label>
                <Input
                  id="group-title"
                  value={groupEditData.title}
                  onChange={(e) => setGroupEditData({ ...groupEditData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-amount">Amount ($)</Label>
                <Input
                  id="group-amount"
                  type="number"
                  step="0.01"
                  value={(groupEditData.amountCents / 100).toFixed(2)}
                  onChange={(e) => setGroupEditData({
                    ...groupEditData,
                    amountCents: Math.round(parseFloat(e.target.value || '0') * 100)
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-dueDate">Due Date</Label>
                <Input
                  id="group-dueDate"
                  type="date"
                  value={groupEditData.dueDate || ''}
                  onChange={(e) => setGroupEditData({ ...groupEditData, dueDate: e.target.value || null })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGroup(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveGroupEdit}
              disabled={updateCharge.isPending}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {updateCharge.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                `Update ${editingGroup?.memberCount} Charges`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Confirmation Dialog */}
      <Dialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete All Charges</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deletingGroup?.memberCount} charges? This action will void all charges in this group.
            </DialogDescription>
          </DialogHeader>
          {deletingGroup && (
            <div className="py-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="font-medium">{deletingGroup.title}</p>
                <p className="text-sm text-muted-foreground">
                  {deletingGroup.memberCount} members • <Money cents={deletingGroup.totalAmount} size="xs" inline /> total
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingGroup(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteGroup}
              disabled={voidCharge.isPending}
            >
              {voidCharge.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                `Delete ${deletingGroup?.memberCount} Charges`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Charge Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && resetCreateDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Charge</DialogTitle>
            <DialogDescription>
              Charge dues, fees, or fines to members
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Charge Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Charge Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={newChargeData.category}
                    onValueChange={(v) => setNewChargeData({ ...newChargeData, category: v as ChargeCategory })}
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
                    value={newChargeData.title}
                    onChange={(e) => setNewChargeData({ ...newChargeData, title: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newChargeData.amount}
                    onChange={(e) => setNewChargeData({ ...newChargeData, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Due Date (optional)</Label>
                  <Input
                    type="date"
                    value={newChargeData.dueDate}
                    onChange={(e) => setNewChargeData({ ...newChargeData, dueDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Select Members */}
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
              {loadingMembers ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No active members. Add members first.
                </p>
              ) : (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
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
                    <span className="font-medium text-muted-foreground">All Members</span>
                    <span className="text-xs text-muted-foreground ml-auto">{members.length}</span>
                  </button>

                  {/* Member Rows */}
                  {filteredMembers.map((member) => {
                    const isSelected = selectedMembers.has(member.id);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => toggleMember(member.id)}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border/50 hover:bg-secondary/50',
                        )}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                            isSelected
                              ? 'bg-gradient-to-br from-primary to-blue-400 border-transparent'
                              : 'border-muted-foreground/30',
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <AvatarGradient name={member.displayName} size="sm" />
                        <span className="font-medium">{member.displayName}</span>
                      </button>
                    );
                  })}

                  {filteredMembers.length === 0 && memberSearch && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No members found matching "{memberSearch}"
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetCreateDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCharge}
              disabled={createCharge.isPending || selectedMembers.size === 0}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {createCharge.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Charge'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
