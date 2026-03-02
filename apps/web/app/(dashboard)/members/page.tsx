'use client';

import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import Link from 'next/link';

import { Plus, Search, Users, AlertCircle, MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, Circle, CheckCircle2, Mail, Clock, Upload } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useMembers, useCreateMembers, useUpdateMember, useDeleteMember, useRestoreMember, useResendInvitation, useBulkDeleteMembers } from '@/lib/queries/members';
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
import { FadeIn } from '@/components/ui/page-transition';
import { AnimatedList } from '@/components/ui/animated-list';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/ui/page-header';
import { ToastUndoButton } from '@/components/ui/toast-undo-button';
import { EmptyState } from '@/components/ui/empty-state';
import { BatchActionsBar } from '@/components/ui/batch-actions-bar';
import { ExportDropdown } from '@/components/export-dropdown';
import { CSVImportDialog, type ImportField } from '@/components/import/csv-import-dialog';
import { exportCSV, exportPDF } from '@/lib/export';
import type { MemberWithBalance } from '@ledgly/shared';

const MEMBER_IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['full name', 'member name', 'first name'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email address', 'e-mail'] },
  { key: 'role', label: 'Role', required: false, aliases: ['member role', 'type'] },
];

const MemberCard = memo(function MemberCard({
  member,
  index,
  onEdit,
  onDelete,
  onResendInvitation,
  isAdmin,
  isSelf,
  isSelected,
  onToggleSelect,
}: {
  member: MemberWithBalance;
  index: number;
  onEdit: (member: MemberWithBalance) => void;
  onDelete: (member: MemberWithBalance) => void;
  onResendInvitation?: (member: MemberWithBalance) => void;
  isAdmin: boolean;
  isSelf?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const hasBalance = member.balanceCents > 0;
  const isOverdue = member.overdueCharges > 0;
  const isInvited = member.status === 'INVITED';
  const isExpiredInvite = isInvited && member.inviteExpired;

  return (
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
            <Link href={`/members/${member.id}`} className="flex items-center gap-3 flex-1 min-w-0">
              <AvatarGradient name={member.displayName} size="md" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {member.displayName}
                  {isSelf && <span className="text-muted-foreground font-normal"> (You)</span>}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge
                    variant={member.role === 'ADMIN' ? 'default' : member.role === 'TREASURER' ? 'secondary' : 'outline'}
                    className="text-xs"
                  >
                    {member.role === 'ADMIN' ? 'Admin' : member.role === 'TREASURER' ? 'Treasurer' : 'Member'}
                  </Badge>
                  {isExpiredInvite ? (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Invitation Expired
                    </Badge>
                  ) : isInvited ? (
                    <Badge variant="warning" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending Invitation
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Joined {formatDate(member.joinedAt)}
                    </span>
                  )}
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
              {!isInvited && (
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
              )}
              {isAdmin && !isSelf ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isInvited && onResendInvitation && (
                      <DropdownMenuItem onClick={() => onResendInvitation(member)}>
                        <Mail className="h-4 w-4 mr-2" />
                        Resend Invitation
                      </DropdownMenuItem>
                    )}
                    {!isInvited && (
                      <DropdownMenuItem onClick={() => onEdit(member)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDelete(member)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="w-8 h-8" />
              )}
            </div>
          </div>
        </MotionCardContent>
      </MotionCard>
  );
});

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
  useEffect(() => {
    if (member) {
      setName(member.displayName);
      setRole(member.role);
    }
  }, [member]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrgId || !member || !name.trim()) return;

    // Capture original values for undo
    const oldName = member.displayName;
    const oldRole = member.role;
    const memberId = member.id;

    try {
      await updateMember.mutateAsync({
        orgId: currentOrgId,
        memberId,
        data: { name: name.trim(), role },
      });
      toast({
        title: 'Member updated',
        action: (
          <ToastUndoButton
            onClick={() => {
              const redoName = name.trim();
              const redoRole = role;
              updateMember.mutate(
                { orgId: currentOrgId!, memberId, data: { name: oldName, role: oldRole } },
                {
                  onSuccess: () => toast({
                    title: 'Change reverted',
                    action: (
                      <ToastUndoButton
                        onClick={() => updateMember.mutate(
                          { orgId: currentOrgId!, memberId, data: { name: redoName, role: redoRole } },
                          { onSuccess: () => toast({ title: 'Member updated' }) },
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
        ),
      });
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
  const [role, setRole] = useState<'MEMBER' | 'TREASURER' | 'ADMIN'>('MEMBER');
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const createMembers = useCreateMembers();
  const restoreMember = useRestoreMember();
  const deleteMemberMutation = useDeleteMember();

  const requiresEmail = role === 'ADMIN' || role === 'TREASURER';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrgId || !name.trim()) return;

    try {
      const created = await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name: name.trim(), email: email.trim() || undefined, role }],
      });
      const createdName = name.trim();
      const createdId = created[0]?.id;
      toast({
        title: `${createdName} added`,
        action: createdId ? (
          <ToastUndoButton
            onClick={() => {
              deleteMemberMutation.mutate(
                { orgId: currentOrgId, memberId: createdId },
                {
                  onSuccess: () => toast({
                    title: `${createdName} removed`,
                    action: (
                      <ToastUndoButton
                        onClick={() => restoreMember.mutate(
                          { orgId: currentOrgId!, memberId: createdId },
                          { onSuccess: () => toast({ title: `${createdName} restored` }) },
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
      setOpen(false);
      setName('');
      setEmail('');
      setRole('MEMBER');
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
        <Button size="sm" className="hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4 mr-1.5" />
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
              <Label htmlFor="add-role" className="text-sm font-medium">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'MEMBER' | 'TREASURER' | 'ADMIN')}>
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
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email {requiresEmail ? '*' : '(optional)'}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                required={requiresEmail}
              />
              {requiresEmail && (
                <p className="text-xs text-muted-foreground">
                  An invitation email will be sent to join as {role === 'ADMIN' ? 'an admin' : 'a treasurer'}.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMembers.isPending}
             
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
  const [showImport, setShowImport] = useState(false);
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);
  const isAdmin = currentMembership?.role === 'ADMIN' || currentMembership?.role === 'TREASURER';
  const { data, isLoading } = useMembers(currentOrgId, { search });
  const deleteMember = useDeleteMember();
  const restoreMember = useRestoreMember();
  const resendInvitation = useResendInvitation();
  const bulkDeleteMembers = useBulkDeleteMembers();
  const createMembersForImport = useCreateMembers();

  const handleImportMembers = async (records: Record<string, string>[]) => {
    if (!currentOrgId) throw new Error('No org selected');
    const members = records
      .filter((r) => r.name?.trim())
      .map((r) => ({
        name: r.name.trim(),
        email: r.email?.trim() || undefined,
        role: r.role?.trim()?.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MEMBER',
      }));
    if (members.length === 0) throw new Error('No valid members found');
    const result = await createMembersForImport.mutateAsync({ orgId: currentOrgId, members });
    return { success: result.length, errors: records.length - result.length };
  };

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

  const handleResendInvitation = useCallback((member: MemberWithBalance) => {
    if (!currentOrgId) return;
    resendInvitation.mutate(
      { orgId: currentOrgId, memberId: member.id },
      {
        onSuccess: () => toast({ title: `Invitation resent to ${member.displayName}` }),
        onError: (error: any) => toast({
          title: 'Error',
          description: error.message || 'Failed to resend invitation',
          variant: 'destructive',
        }),
      },
    );
  }, [currentOrgId, resendInvitation, toast]);

  const handleEdit = useCallback((member: MemberWithBalance) => {
    setEditingMember(member);
    setEditDialogOpen(true);
  }, []);

  const handleDelete = useCallback((member: MemberWithBalance) => {
    if (!currentOrgId) return;

    deleteMember.mutate(
      { orgId: currentOrgId, memberId: member.id },
      {
        onSuccess: () => {
          toast({
            title: 'Member removed',
            description: `${member.displayName} has been removed.`,
            action: (
              <ToastUndoButton
                onClick={() => handleRestore(member.id, member.displayName)}
              />
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
  }, [currentOrgId, deleteMember, restoreMember, toast]);

  const handleRestore = useCallback((memberId: string, memberName: string) => {
    if (!currentOrgId) return;

    restoreMember.mutate(
      { orgId: currentOrgId, memberId },
      {
        onSuccess: () => {
          toast({
            title: `${memberName} has been restored`,
            action: (
              <ToastUndoButton
                onClick={() => deleteMember.mutate(
                  { orgId: currentOrgId!, memberId },
                  { onSuccess: () => toast({ title: `${memberName} removed` }) },
                )}
                label="Redo"
              />
            ),
          });
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
  }, [currentOrgId, restoreMember, deleteMember, toast]);

  const toggleRowSelection = useCallback((memberId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }, []);

  const selectableMembers = paginatedMembers.filter((m) => m.id !== currentMembership?.id);

  const toggleSelectAll = () => {
    if (selectedRows.size === selectableMembers.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(selectableMembers.map((m) => m.id)));
    }
  };

  const isAllSelected = selectableMembers.length > 0 && selectedRows.size === selectableMembers.length;

  const handleBulkDelete = async () => {
    if (!currentOrgId || selectedRows.size === 0) return;

    // Never delete yourself
    const memberIds = paginatedMembers
      .filter((m) => selectedRows.has(m.id) && m.id !== currentMembership?.id)
      .map((m) => m.id);

    if (memberIds.length === 0) return;

    try {
      const result = await bulkDeleteMembers.mutateAsync({ orgId: currentOrgId, memberIds });
      const deletedCount = result.deletedCount;
      setSelectedRows(new Set());

      toast({
        title: `Removed ${deletedCount} member${deletedCount !== 1 ? 's' : ''}`,
        action: (
          <ToastUndoButton
            onClick={async () => {
              let restoredCount = 0;
              for (const memberId of memberIds) {
                try { await restoreMember.mutateAsync({ orgId: currentOrgId, memberId }); restoredCount++; } catch { /* continue */ }
              }
              toast({
                title: `Restored ${restoredCount} member${restoredCount !== 1 ? 's' : ''}`,
                action: (
                  <ToastUndoButton
                    onClick={async () => {
                      const redoResult = await bulkDeleteMembers.mutateAsync({ orgId: currentOrgId, memberIds });
                      toast({ title: `Removed ${redoResult.deletedCount} member${redoResult.deletedCount !== 1 ? 's' : ''}` });
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
      setSelectedRows(new Set());
    }
  };

  const handleExportMembers = (format: 'csv' | 'pdf') => {
    const members = sortedMembers;
    const headers = ['Name', 'Email', 'Role', 'Status', 'Balance', 'Total Charged', 'Total Paid'];
    const rows = members.map((m) => [
      m.displayName,
      m.invitedEmail || '',
      m.role,
      m.status,
      `$${(m.balanceCents / 100).toFixed(2)}`,
      `$${(m.totalChargedCents / 100).toFixed(2)}`,
      `$${(m.totalPaidCents / 100).toFixed(2)}`,
    ]);
    const filename = `members-${new Date().toISOString().split('T')[0]}`;
    if (format === 'csv') exportCSV(headers, rows, filename);
    else exportPDF('Members', headers, rows, filename);
  };

  return (
    <div data-tour="members-list" className="space-y-8">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Members"
          helpText="Add and manage organization members. Members can have charges assigned to them and receive payment allocations. Use selection checkboxes to select multiple members for bulk actions."
          actions={
            <div className="flex items-center gap-2">
              <ExportDropdown
                onExportCSV={() => handleExportMembers('csv')}
                onExportPDF={() => handleExportMembers('pdf')}
              />
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                  <Upload className="w-4 h-4 mr-1.5" />
                  Import
                </Button>
              )}
              {isAdmin && <AddMemberDialog />}
            </div>
          }
        />
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
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
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
          <EmptyState
            icon={Users}
            title="No members found"
            description="Start by adding members to your organization"
            action={isAdmin && <AddMemberDialog />}
            className="rounded-xl border border-border/50 bg-card/50"
          />
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
              <button
                onClick={handleBulkDelete}
                className={cn(
                  "w-7 h-7 flex items-center justify-center transition-all hover:text-destructive",
                  selectedRows.size === 0 && "invisible"
                )}
                title={`Remove ${selectedRows.size} selected`}
              >
                <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          )}
          <AnimatedList
            items={paginatedMembers}
            getKey={(m) => m.id}
            className="space-y-3"
            renderItem={(member, index) => (
              <MemberCard
                member={member}
                index={index}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onResendInvitation={handleResendInvitation}
                isAdmin={isAdmin}
                isSelf={member.id === currentMembership?.id}
                isSelected={selectedRows.has(member.id)}
                onToggleSelect={() => toggleRowSelection(member.id)}
              />
            )}
          />
        </div>
      )}

      {/* Pagination Controls - Bottom */}
      {sortedMembers.length > 0 && (
        <FadeIn delay={0.3}>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="justify-center pt-4" />
        </FadeIn>
      )}

      <EditMemberDialog
        member={editingMember}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      <BatchActionsBar selectedCount={selectedRows.size} onClear={() => setSelectedRows(new Set())}>
        <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="h-8">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Delete
        </Button>
      </BatchActionsBar>

      <CSVImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        title="Import Members"
        description="Upload a CSV file to bulk import members"
        fields={MEMBER_IMPORT_FIELDS}
        onImport={handleImportMembers}
      />
    </div>
  );
}
