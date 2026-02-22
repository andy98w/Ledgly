'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus, Search, Users, AlertCircle, MoreHorizontal, Pencil, Trash2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Info, Circle, CheckCircle2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useMembers, useCreateMembers, useUpdateMember, useDeleteMember, useRestoreMember } from '@/lib/queries/members';
import { useAuthStore } from '@/lib/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { MemberWithBalance } from '@ledgly/shared';

function MemberCard({
  member,
  index,
  onEdit,
  onDelete,
  isAdmin,
  isSelected,
  onToggleSelect,
}: {
  member: MemberWithBalance;
  index: number;
  onEdit: (member: MemberWithBalance) => void;
  onDelete: (member: MemberWithBalance) => void;
  isAdmin: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const hasBalance = member.balanceCents > 0;
  const isOverdue = member.overdueCharges > 0;

  return (
    <StaggerItem>
      <MotionCard className="cursor-pointer">
        <MotionCardContent className="p-4">
          <div className="flex items-center justify-between">
            {isAdmin && onToggleSelect && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onToggleSelect();
                }}
                className="mr-3 flex items-center justify-center transition-colors"
                title={isSelected ? "Deselect" : "Select"}
              >
                {isSelected ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                )}
              </button>
            )}
            <Link href={`/members/${member.id}`} className="flex items-center gap-3 flex-1">
              <AvatarGradient name={member.displayName} size="md" />
              <div>
                <p className="font-medium">{member.displayName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    variant={member.status === 'ACTIVE' ? 'secondary' : 'outline'}
                    className="text-xs"
                  >
                    {member.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Joined {formatDate(member.joinedAt)}
                  </span>
                  {isOverdue && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Overdue
                    </Badge>
                  )}
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-4">
              <div className="text-right">
                {hasBalance ? (
                  <div className="flex items-center gap-1 text-destructive">
                    <span className="text-sm">Owes</span>
                    <Money cents={member.balanceCents} size="sm" className="text-destructive" />
                  </div>
                ) : (
                  <Badge variant="success" className="text-xs">Paid up</Badge>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  <Money cents={member.totalPaidCents} size="xs" inline /> paid
                </p>
              </div>
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(member)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(member)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
}

function MemberCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div>
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>
        <div className="text-right">
          <Skeleton className="h-5 w-20 mb-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
}

function EditMemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member: MemberWithBalance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(member?.displayName || '');
  const [role, setRole] = useState(member?.role || 'MEMBER');
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const updateMember = useUpdateMember();

  // Reset form when member changes
  useState(() => {
    if (member) {
      setName(member.displayName);
      setRole(member.role);
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrgId || !member || !name.trim()) return;

    try {
      await updateMember.mutateAsync({
        orgId: currentOrgId,
        memberId: member.id,
        data: { name: name.trim(), role },
      });
      toast({ title: 'Member updated successfully' });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update member',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Member</DialogTitle>
            <DialogDescription>
              Update member details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-sm font-medium">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role" className="text-sm font-medium">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'ADMIN' | 'TREASURER' | 'MEMBER')}>
                <SelectTrigger className="h-11 bg-secondary/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="TREASURER">Treasurer</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateMember.isPending}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {updateMember.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const createMembers = useCreateMembers();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrgId || !name.trim()) return;

    try {
      await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name: name.trim(), email: email.trim() || undefined }],
      });
      toast({ title: 'Member added successfully' });
      setOpen(false);
      setName('');
      setEmail('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add member',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-primary to-blue-400 hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>
              Add a new member to your organization
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMembers.isPending}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              {createMembers.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MembersPage() {
  const [search, setSearch] = useState('');
  const [editingMember, setEditingMember] = useState<MemberWithBalance | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'joinedAt' | 'balance'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);
  const isAdmin = currentMembership?.role === 'ADMIN' || currentMembership?.role === 'TREASURER';
  const { data, isLoading } = useMembers(currentOrgId, { search });
  const deleteMember = useDeleteMember();
  const restoreMember = useRestoreMember();

  // Sort and paginate members
  const sortedMembers = useMemo(() => {
    if (!data?.data) return [];
    const members = [...data.data];
    members.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.displayName.localeCompare(b.displayName);
      } else if (sortBy === 'joinedAt') {
        comparison = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
      } else if (sortBy === 'balance') {
        comparison = a.balanceCents - b.balanceCents;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return members;
  }, [data?.data, sortBy, sortOrder]);

  const totalPages = Math.ceil(sortedMembers.length / pageSize);
  const paginatedMembers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedMembers.slice(start, start + pageSize);
  }, [sortedMembers, page, pageSize]);

  // Reset to page 1 and clear selection when filters change
  useEffect(() => {
    setPage(1);
    setSelectedRows(new Set());
  }, [search, sortBy, sortOrder, pageSize]);

  const handleEdit = (member: MemberWithBalance) => {
    setEditingMember(member);
    setEditDialogOpen(true);
  };

  const handleDelete = (member: MemberWithBalance) => {
    if (!currentOrgId) return;

    deleteMember.mutate(
      { orgId: currentOrgId, memberId: member.id },
      {
        onSuccess: () => {
          toast({
            title: 'Member removed',
            description: `${member.displayName} has been removed.`,
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(member.id, member.displayName)}
              >
                Undo
              </Button>
            ),
          });
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to remove member',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleRestore = (memberId: string, memberName: string) => {
    if (!currentOrgId) return;

    restoreMember.mutate(
      { orgId: currentOrgId, memberId },
      {
        onSuccess: () => {
          toast({ title: `${memberName} has been restored` });
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to restore member',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const toggleRowSelection = (memberId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === paginatedMembers.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedMembers.map((m) => m.id)));
    }
  };

  const isAllSelected = paginatedMembers.length > 0 && selectedRows.size === paginatedMembers.length;

  const handleBulkDelete = async () => {
    if (!currentOrgId || selectedRows.size === 0) return;

    const membersToDelete = paginatedMembers.filter((m) => selectedRows.has(m.id));
    const deletedMembers: Array<{ id: string; name: string }> = [];

    for (const member of membersToDelete) {
      try {
        await deleteMember.mutateAsync({ orgId: currentOrgId, memberId: member.id });
        deletedMembers.push({ id: member.id, name: member.displayName });
      } catch (error) {
        // Continue with other deletions
      }
    }

    setSelectedRows(new Set());

    const handleUndo = async () => {
      let restoredCount = 0;
      for (const member of deletedMembers) {
        try {
          await restoreMember.mutateAsync({ orgId: currentOrgId, memberId: member.id });
          restoredCount++;
        } catch (error) {
          // Continue with other restorations
        }
      }
      toast({ title: `Restored ${restoredCount} member${restoredCount !== 1 ? 's' : ''}` });
    };

    toast({
      title: `Removed ${deletedMembers.length} member${deletedMembers.length !== 1 ? 's' : ''}`,
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Members</h1>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">Add and manage organization members. Members can have charges assigned to them and receive payment allocations. Use selection checkboxes to select multiple members for bulk actions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <AddMemberDialog />
        </div>
      </FadeIn>

      {/* Search and Filters */}
      <FadeIn delay={0.1}>
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9 bg-secondary/30 border-border/50 focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-32 h-8 bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="joinedAt">Date Joined</SelectItem>
                <SelectItem value="balance">Balance</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </FadeIn>

      {/* Pagination Controls - Top */}
      {sortedMembers.length > 0 && (
        <FadeIn delay={0.15}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {sortedMembers.length} members
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Per page:</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="w-20 h-8 bg-secondary/30 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                  {page} of {totalPages || 1}
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
          </div>
        </FadeIn>
      )}

      {/* Members List */}
      {isLoading ? (
        <div className="space-y-3">
          <MemberCardSkeleton />
          <MemberCardSkeleton />
          <MemberCardSkeleton />
        </div>
      ) : sortedMembers.length === 0 ? (
        <FadeIn delay={0.2}>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-border/50 bg-card/50 py-16 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No members yet</h3>
            <p className="text-muted-foreground mb-6">
              Start by adding members to your organization
            </p>
            <AddMemberDialog />
          </motion.div>
        </FadeIn>
      ) : (
        <div className="space-y-3">
          {/* Select All Row */}
          {isAdmin && paginatedMembers.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 flex items-center justify-between">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-3 transition-colors"
                title={isAllSelected ? "Deselect all" : "Select all"}
              >
                {isAllSelected ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                )}
                <span className="text-sm text-muted-foreground">
                  {isAllSelected ? 'Deselect all' : 'Select all'}
                </span>
              </button>
              {selectedRows.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="w-7 h-7 flex items-center justify-center transition-colors hover:text-destructive"
                  title={`Remove ${selectedRows.size} selected`}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                </button>
              )}
            </div>
          )}
          <StaggerChildren className="space-y-3">
            {paginatedMembers.map((member, index) => (
              <MemberCard
                key={member.id}
                member={member}
                index={index}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isAdmin={isAdmin}
                isSelected={selectedRows.has(member.id)}
                onToggleSelect={() => toggleRowSelection(member.id)}
              />
            ))}
          </StaggerChildren>
        </div>
      )}

      {/* Pagination Controls - Bottom */}
      {sortedMembers.length > 0 && (
        <FadeIn delay={0.3}>
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[80px] text-center">
              {page} of {totalPages || 1}
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
        </FadeIn>
      )}

      <EditMemberDialog
        member={editingMember}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </div>
  );
}
