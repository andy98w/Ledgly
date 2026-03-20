'use client';

import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import Link from 'next/link';

import { Plus, Search, Users, AlertCircle, MoreHorizontal, Pencil, Trash2, CheckCircle2, Mail, Clock, Upload, MoreVertical, FileSpreadsheet, FileText, X, Eye } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useMembers, useCreateMembers, useUpdateMember, useDeleteMember, useRestoreMember, useResendInvitation, useBulkDeleteMembers, useApproveMember } from '@/lib/queries/members';
import { useAuthStore, useIsAdminOrTreasurer, useIsOwner, useCurrentMembership } from '@/lib/stores/auth';
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
import { usePageKeyboard } from '@/hooks/use-page-keyboard';
import { PageHeader } from '@/components/ui/page-header';
import { ToastUndoButton } from '@/components/ui/toast-undo-button';
import { EmptyState } from '@/components/ui/empty-state';
import { BatchActionsBar } from '@/components/ui/batch-actions-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ExportDropdown } from '@/components/export-dropdown';
import { CSVImportDialog, type ImportField } from '@/components/import/csv-import-dialog';
import { exportCSV, exportPDF } from '@/lib/export';
import type { MemberWithBalance } from '@ledgly/shared';

const MEMBER_IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['full name', 'member name', 'first name'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email address', 'e-mail'] },
  { key: 'role', label: 'Role', required: false, aliases: ['member role', 'type'] },
];

const ROLE_RANK: Record<string, number> = { OWNER: 3, ADMIN: 2, TREASURER: 1, MEMBER: 0 };

const MemberCard = memo(function MemberCard({
  member,
  index,
  onEdit,
  onDelete,
  onResendInvitation,
  onApprove,
  isAdmin,
  actorRole,
  isSelf,
  isSelected,
  onToggleSelect,
}: {
  member: MemberWithBalance;
  index: number;
  onEdit: (member: MemberWithBalance) => void;
  onDelete: (member: MemberWithBalance) => void;
  onResendInvitation?: (member: MemberWithBalance) => void;
  onApprove?: (member: MemberWithBalance) => void;
  isAdmin: boolean;
  actorRole?: string;
  isSelf?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const hasBalance = member.balanceCents > 0;
  const isOverdue = member.overdueCharges > 0;
  const isInvited = member.status === 'INVITED';
  const isPending = member.status === 'PENDING';
  const isExpiredInvite = isInvited && member.inviteExpired;
  // Actor can manage this member if they outrank them (or are OWNER)
  const canManage = isAdmin && !isSelf && (
    actorRole === 'OWNER' || (ROLE_RANK[actorRole ?? ''] ?? 0) > (ROLE_RANK[member.role] ?? 0)
  );

  return (
    <MotionCard
      className={cn(
        'cursor-pointer transition-colors',
        isSelected && 'ring-2 ring-primary/50 bg-primary/5',
      )}
      onClick={() => onToggleSelect?.()}
    >
      <MotionCardContent className="p-4">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <AvatarGradient name={member.displayName} size="md" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {member.displayName}
                  {isSelf && <span className="text-muted-foreground font-normal"> (You)</span>}
                </p>
                {(member.user?.email || member.invitedEmail) && (
                  <p className="text-xs text-muted-foreground truncate">{member.user?.email || member.invitedEmail}</p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge
                    variant={member.role === 'OWNER' ? 'default' : member.role === 'ADMIN' ? 'default' : member.role === 'TREASURER' ? 'secondary' : 'outline'}
                    className="text-xs"
                  >
                    {member.role === 'OWNER' ? 'Owner' : member.role === 'ADMIN' ? 'Admin' : member.role === 'TREASURER' ? 'Treasurer' : 'Member'}
                  </Badge>
                  {isExpiredInvite ? (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Invitation Expired
                    </Badge>
                  ) : isPending ? (
                    <Badge variant="warning" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending Approval
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
            </div>
            <div className="flex items-center gap-4">
              {!isInvited && !isPending && (
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
              {isPending && isAdmin && onApprove && (
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onApprove(member); }}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Member actions" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/members/${member.id}`}>
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  {canManage && (
                    <>
                      {isInvited && onResendInvitation && (
                        <DropdownMenuItem onClick={() => onResendInvitation(member)}>
                          <Mail className="h-4 w-4 mr-2" />
                          Resend Invitation
                        </DropdownMenuItem>
                      )}
                      {!isInvited && !isPending && (
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
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
  const [aliases, setAliases] = useState<string[]>(member?.paymentAliases || []);
  const [newAlias, setNewAlias] = useState('');
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const currentMembership = useCurrentMembership();
  const updateMember = useUpdateMember();
  const actorRank = ROLE_RANK[currentMembership?.role ?? ''] ?? 0;
  const targetRank = ROLE_RANK[member?.role ?? ''] ?? 0;
  const canEditRole = currentMembership?.role === 'OWNER' || actorRank > targetRank;

  // Reset form when member changes
  useEffect(() => {
    if (member) {
      setName(member.displayName);
      setRole(member.role);
      setAliases(member.paymentAliases || []);
      setNewAlias('');
    }
  }, [member]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrgId || !member || !name.trim()) return;

    // Capture original values for undo
    const oldName = member.displayName;
    const oldRole = member.role;
    const oldAliases = member.paymentAliases || [];
    const memberId = member.id;

    try {
      await updateMember.mutateAsync({
        orgId: currentOrgId,
        memberId,
        data: { name: name.trim(), role, paymentAliases: aliases },
      });
      toast({
        title: 'Member updated',
        action: (
          <ToastUndoButton
            onClick={() => {
              const redoName = name.trim();
              const redoRole = role;
              const redoAliases = aliases;
              updateMember.mutate(
                { orgId: currentOrgId!, memberId, data: { name: oldName, role: oldRole, paymentAliases: oldAliases } },
                {
                  onSuccess: () => toast({
                    title: 'Change reverted',
                    action: (
                      <ToastUndoButton
                        onClick={() => updateMember.mutate(
                          { orgId: currentOrgId!, memberId, data: { name: redoName, role: redoRole, paymentAliases: redoAliases } },
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
                maxLength={100}
                className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                required
              />
            </div>
            {(member?.user?.email || member?.invitedEmail) && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Email</Label>
                <p className="text-sm text-muted-foreground bg-secondary/30 px-3 py-2.5 rounded-lg">
                  {member.user?.email || member.invitedEmail}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-role" className="text-sm font-medium">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'ADMIN' | 'TREASURER' | 'MEMBER')} disabled={!canEditRole}>
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
              <Label className="text-sm font-medium">Payment Aliases</Label>
              <p className="text-xs text-muted-foreground">
                Names this member uses on Venmo, Zelle, CashApp, etc. Aliases are also learned automatically when you confirm payments.
              </p>
              {aliases.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {aliases.map((alias, i) => (
                    <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                      {alias}
                      <button
                        type="button"
                        onClick={() => setAliases(aliases.filter((_, j) => j !== i))}
                        className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                        aria-label={`Remove alias ${alias}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {aliases.length < 20 && (
                <div className="flex gap-2">
                  <Input
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = newAlias.trim();
                        if (trimmed && !aliases.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
                          setAliases([...aliases, trimmed]);
                          setNewAlias('');
                        }
                      }
                    }}
                    placeholder="e.g. Johnny D"
                    className="h-9 bg-secondary/50 border-border/50 focus:border-primary"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() => {
                      const trimmed = newAlias.trim();
                      if (trimmed && !aliases.some(a => a.toLowerCase() === trimmed.toLowerCase())) {
                        setAliases([...aliases, trimmed]);
                        setNewAlias('');
                      }
                    }}
                    disabled={!newAlias.trim()}
                  >
                    Add
                  </Button>
                </div>
              )}
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
      const result = await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name: name.trim(), email: email.trim() || undefined, role }],
      });
      const createdName = name.trim();
      const createdId = result.created[0]?.id;
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
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const isAdmin = useIsAdminOrTreasurer();
  const isOwner = useIsOwner();
  const currentMembership = useCurrentMembership();
  const { data, isLoading, isError, refetch } = useMembers(currentOrgId, { search });
  const deleteMember = useDeleteMember();
  const restoreMember = useRestoreMember();
  const resendInvitation = useResendInvitation();
  const bulkDeleteMembers = useBulkDeleteMembers();
  const approveMember = useApproveMember();
  const createMembersForImport = useCreateMembers();

  const handleImportMembers = async (records: Record<string, string>[]) => {
    if (!currentOrgId) throw new Error('No org selected');
    const members = records
      .filter((r) => r.name?.trim())
      .map((r) => ({
        name: r.name.trim(),
        email: r.email?.trim() || undefined,
        role: (() => { const upper = r.role?.trim()?.toUpperCase(); return upper === 'ADMIN' || upper === 'OWNER' ? 'ADMIN' : upper === 'TREASURER' ? 'TREASURER' : 'MEMBER'; })(),
      }));
    if (members.length === 0) throw new Error('No valid members found');
    const result = await createMembersForImport.mutateAsync({ orgId: currentOrgId, members });
    return { success: result.created.length, errors: result.errors.length };
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

  usePageKeyboard(page, totalPages, setPage);

  // Reset to page 1 and clear selection when filters change
  useEffect(() => {
    setPage(1);
    setSelectedRows(new Set());
  }, [search, sortBy, sortOrder, pageSize]);

  const handleApprove = useCallback((member: MemberWithBalance) => {
    if (!currentOrgId) return;
    approveMember.mutate(
      { orgId: currentOrgId, memberId: member.id },
      {
        onSuccess: () => toast({ title: `${member.displayName} approved` }),
        onError: (error: any) => toast({
          title: 'Error',
          description: error.message || 'Failed to approve member',
          variant: 'destructive',
        }),
      },
    );
  }, [currentOrgId, approveMember, toast]);

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

    if (memberIds.length === 0) {
      toast({ title: 'You cannot remove yourself', variant: 'destructive' });
      return;
    }

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
          helpText="Add and manage organization members. Members can have dues assigned to them and receive payments."
          actions={
            <div className="flex items-center gap-2">
              {isAdmin && <AddMemberDialog />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setShowImport(true)} className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Import CSV
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => handleExportMembers('csv')} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportMembers('pdf')} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      </FadeIn>

      {/* Search + Sort */}
      <FadeIn delay={0.1}>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search members..."
              aria-label="Search members"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9 bg-secondary/30 border-border/50 focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={`${sortBy}-${sortOrder}`}
              onValueChange={(v) => {
                const [field, order] = v.split('-') as [typeof sortBy, typeof sortOrder];
                setSortBy(field);
                setSortOrder(order);
              }}
            >
              <SelectTrigger className="w-[160px] h-8 bg-secondary/30 border-border/50 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                <SelectItem value="joinedAt-desc">Joined (Newest)</SelectItem>
                <SelectItem value="joinedAt-asc">Joined (Oldest)</SelectItem>
                <SelectItem value="balance-desc">Balance (High-Low)</SelectItem>
                <SelectItem value="balance-asc">Balance (Low-High)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FadeIn>

      {/* Members List */}
      {isLoading ? (
        <div className="space-y-3">
          <MemberCardSkeleton />
          <MemberCardSkeleton />
          <MemberCardSkeleton />
        </div>
      ) : isError ? (
        <FadeIn delay={0.2}>
          <EmptyState
            icon={AlertCircle}
            title="Failed to load members"
            description="Something went wrong loading member data."
            action={<Button onClick={() => refetch()} variant="outline">Try Again</Button>}
            className="rounded-xl border border-border/50 bg-card/50"
          />
        </FadeIn>
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
          {isAdmin && paginatedMembers.length > 0 && (
            <div className="flex items-center justify-between px-1 h-6">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {isAllSelected ? 'Deselect all' : 'Select all'}
                {selectedRows.size > 0 && !isAllSelected && ` (${selectedRows.size} selected)`}
              </button>
              {selectedRows.size > 0 && (
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                >
                  Remove {selectedRows.size}
                </button>
              )}
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
                onApprove={handleApprove}
                isAdmin={isAdmin}
                actorRole={currentMembership?.role}
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
        <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteConfirm(true)} className="h-8">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Delete
        </Button>
      </BatchActionsBar>

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={`Remove ${selectedRows.size} member${selectedRows.size !== 1 ? 's' : ''}?`}
        description="This will remove the selected members and all their associated charges and payment records. This can be undone."
        confirmLabel="Remove"
        isPending={bulkDeleteMembers.isPending}
        onConfirm={() => {
          handleBulkDelete();
          setShowBulkDeleteConfirm(false);
        }}
      />

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
