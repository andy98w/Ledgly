'use client';

import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, CreditCard, AlertCircle, TrendingUp, Wallet, Search, MoreHorizontal, Pencil, Trash2, Loader2, ChevronDown, Link2, Check, Users, Circle, CheckCircle2, X, UserPlus, Receipt, MoreVertical, FileSpreadsheet, FileText, Mail, Zap, RefreshCw, ExternalLink, Sparkles, Clock, ArrowDownLeft, ArrowUpRight, Undo2, EyeOff } from 'lucide-react';
import { useAutoAllocateToCharge, useRemoveAllocation, useBulkAutoAllocate } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
import { groupCharges } from '@/lib/utils/charge-grouping';
import { calculateNameSimilarity } from '@/lib/utils/name-similarity';
import { usePayments, useUpdatePayment, useDeletePayment, useRestorePayment, useAllocatePayment, useBulkDeletePayments } from '@/lib/queries/payments';
import { useCharges, useBulkCreateCharges } from '@/lib/queries/charges';
import { useMembers, useCreateMembers, useDeleteMember } from '@/lib/queries/members';
import { useAuthStore, useIsAdminOrTreasurer } from '@/lib/stores/auth';
import { formatDate } from '@/lib/utils';
import {
  useGmailStatus,
  useGmailImports,
  useImportStats,
  useSyncGmail,
  useConfirmImport,
  useIgnoreImport,
  useRestoreImport,
  useUnconfirmImport,
  useDisconnectGmail,
  getGmailConnectUrl,
  type EmailImport,
} from '@/lib/queries/gmail';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
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
import { ToastUndoButton } from '@/components/ui/toast-undo-button';
import { EmptyState } from '@/components/ui/empty-state';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BatchActionsBar } from '@/components/ui/batch-actions-bar';
import { ExportDropdown } from '@/components/export-dropdown';
import { exportCSV, exportPDF } from '@/lib/export';

// ── Import Card (Review tab) ────────────────────────────────────
function ImportCard({
  item,
  members,
  onConfirm,
  onIgnore,
  onCreateMember,
  isConfirming,
  isIgnoring,
  isSelected,
  onToggleSelect,
}: {
  item: EmailImport;
  members: Array<{ id: string; displayName: string }>;
  onConfirm: (membershipId?: string) => void;
  onIgnore: () => void;
  onCreateMember: (name: string) => Promise<string | null>;
  isConfirming: boolean;
  isIgnoring: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('none');
  const [memberSearch, setMemberSearch] = useState('');
  const [isCreatingMember, setIsCreatingMember] = useState(false);

  useEffect(() => {
    if (item.parsedPayerName && members.length > 0) {
      const payerNameLower = item.parsedPayerName.toLowerCase();
      const match = members.find((m) =>
        m.displayName.toLowerCase().includes(payerNameLower) ||
        payerNameLower.includes(m.displayName.toLowerCase()),
      );
      if (match) setSelectedMemberId(match.id);
    }
  }, [item.parsedPayerName, members]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch) return members;
    const query = memberSearch.toLowerCase();
    return members.filter((m) => m.displayName.toLowerCase().includes(query));
  }, [members, memberSearch]);

  const createName = memberSearch.trim() || item.parsedPayerName || '';
  const canCreateNew = createName && !filteredMembers.some(
    (m) => m.displayName.toLowerCase() === createName.toLowerCase()
  );

  const handleCreateAndSelect = async () => {
    if (!createName) return;
    setIsCreatingMember(true);
    const newMemberId = await onCreateMember(createName);
    if (newMemberId) {
      setSelectedMemberId(newMemberId);
      setMemberSearch('');
    }
    setIsCreatingMember(false);
  };

  const sourceColors: Record<string, string> = {
    venmo: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    zelle: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    cashapp: 'bg-green-500/10 text-green-400 border-green-500/30',
    paypal: 'bg-blue-600/10 text-blue-300 border-blue-600/30',
  };

  const isOutgoing = item.parsedDirection === 'outgoing';

  return (
    <MotionCard className={isOutgoing
      ? 'border-l-4 border-l-destructive/30 bg-destructive/5'
      : 'border-l-4 border-l-success/30 bg-success/5'
    }>
      <MotionCardContent className="p-3">
        <div className="space-y-2">
          {/* Top row: checkbox + avatar + info + actions (desktop) */}
          <div className="flex items-start gap-3">
            {onToggleSelect && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
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
            <AvatarGradient name={item.parsedPayerName || 'Unknown'} size="md" className="shrink-0" />
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <p className="font-medium text-sm truncate" title={isOutgoing ? `To: ${item.parsedPayerName || 'Unknown'}` : item.parsedPayerName || 'Unknown Payer'}>
                  {isOutgoing ? `To: ${item.parsedPayerName || 'Unknown'}` : item.parsedPayerName || 'Unknown Payer'}
                </p>
                <Badge variant="outline" className={`text-xs ${isOutgoing ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-success/10 text-success border-success/20'}`}>
                  {isOutgoing ? (<><ArrowUpRight className="w-3 h-3 mr-1" />Out</>) : (<><ArrowDownLeft className="w-3 h-3 mr-1" />In</>)}
                </Badge>
                <Badge variant="outline" className={`text-xs ${sourceColors[item.parsedSource] || ''}`}>
                  {item.parsedSource}
                </Badge>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {item.parsedAmount && <Money cents={item.parsedAmount} size="md" />}
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>{new Date(item.emailDate).toLocaleDateString()}</span>
                  {item.parsedMemo && (<><span className="opacity-30">•</span><span className="truncate max-w-[150px] sm:max-w-none">"{item.parsedMemo}"</span></>)}
                </div>
              </div>
              {item.needsReviewReason && (
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-warning shrink-0" />
                  <p className="text-xs text-warning">{item.needsReviewReason}</p>
                </div>
              )}
            </div>
            {/* Desktop-only actions */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              {!isOutgoing && (
                <Select value={selectedMemberId} onValueChange={(v) => { setSelectedMemberId(v); setMemberSearch(''); }}>
                  <SelectTrigger className="h-8 w-40 text-xs bg-secondary/30 border-border/50">
                    <SelectValue placeholder="Member" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 pb-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                          placeholder="Search or create..."
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          className="h-7 pl-7 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {canCreateNew && (
                      <div
                        className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground text-primary font-medium"
                        onClick={(e) => { e.stopPropagation(); handleCreateAndSelect(); }}
                      >
                        <Plus className="w-3 h-3 mr-2" />
                        {isCreatingMember ? 'Creating...' : `Create "${createName}"`}
                      </div>
                    )}
                    {filteredMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <AvatarGradient name={member.displayName} size="xs" />
                          {member.displayName}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                size="sm"
                variant="outline"
                className={isOutgoing
                  ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                  : 'border-success/30 text-success hover:bg-success/10'
                }
                onClick={() => onConfirm(isOutgoing ? undefined : (selectedMemberId === 'none' ? undefined : selectedMemberId))}
                disabled={isConfirming || isIgnoring || !item.parsedAmount}
              >
                {isConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={onIgnore}
                disabled={isConfirming || isIgnoring}
              >
                {isIgnoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              </Button>
            </div>
          </div>
          {/* Mobile-only actions row */}
          <div className="flex sm:hidden items-center gap-2 pl-8">
            {!isOutgoing && (
              <Select value={selectedMemberId} onValueChange={(v) => { setSelectedMemberId(v); setMemberSearch(''); }}>
                <SelectTrigger className="h-8 flex-1 text-xs bg-secondary/30 border-border/50">
                  <SelectValue placeholder="Member" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        placeholder="Search or create..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="h-7 pl-7 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {canCreateNew && (
                    <div
                      className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground text-primary font-medium"
                      onClick={(e) => { e.stopPropagation(); handleCreateAndSelect(); }}
                    >
                      <Plus className="w-3 h-3 mr-2" />
                      {isCreatingMember ? 'Creating...' : `Create "${createName}"`}
                    </div>
                  )}
                  {filteredMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      <div className="flex items-center gap-2">
                        <AvatarGradient name={member.displayName} size="xs" />
                        {member.displayName}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              variant="outline"
              className={isOutgoing
                ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                : 'border-success/30 text-success hover:bg-success/10'
              }
              onClick={() => onConfirm(isOutgoing ? undefined : (selectedMemberId === 'none' ? undefined : selectedMemberId))}
              disabled={isConfirming || isIgnoring || !item.parsedAmount}
            >
              {isConfirming ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={onIgnore}
              disabled={isConfirming || isIgnoring}
            >
              {isIgnoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </MotionCardContent>
    </MotionCard>
  );
}

function ReviewLoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border/50 bg-card p-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

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
                aria-label={isSelected ? "Deselect payment" : "Select payment"}
                aria-pressed={isSelected}
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
                    <span className="truncate max-w-[120px] sm:max-w-[200px]">"{payment.memo}"</span>
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
                  <TooltipContent>{hasUnallocated ? 'Unmatched' : 'Matched'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isAdmin ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Payment actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onApplyToCharge(payment)}>
                      <Link2 className="h-4 w-4 mr-2" />
                      {hasUnallocated ? 'Apply to Charge' : 'Manage Matches'}
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
                        title="Remove match"
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
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'review' | 'payments'>('payments');
  const [allocationFilter, setAllocationFilter] = useState<'all' | 'allocated' | 'unallocated'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingPayment, setEditingPayment] = useState<EditPaymentData | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<any | null>(null);
  const [chargeDialogPayment, setChargeDialogPayment] = useState<any | null>(null);
  const [selectedChargeId, setSelectedChargeId] = useState<string>('');
  const [allocationAmount, setAllocationAmount] = useState<number>(0);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());

  // Review tab state
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [reviewSubTab, setReviewSubTab] = useState<'pending' | 'ignored'>('pending');
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPerPage, setPendingPerPage] = useState(20);
  const [pendingSearch, setPendingSearch] = useState('');

  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const isAdmin = useIsAdminOrTreasurer();
  const { toast } = useToast();
  const { data, isLoading } = usePayments(currentOrgId);

  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();
  const restorePayment = useRestorePayment();
  const bulkDeletePayments = useBulkDeletePayments();
  const allocatePayment = useAllocatePayment();
  const bulkCreateCharges = useBulkCreateCharges();
  const createMembers = useCreateMembers();
  const deleteMember = useDeleteMember();
  const autoAllocate = useAutoAllocateToCharge();
  const removeAllocation = useRemoveAllocation();
  const bulkAutoAllocate = useBulkAutoAllocate();

  // Gmail / Review tab hooks
  const { data: gmailStatus, isLoading: gmailStatusLoading } = useGmailStatus(currentOrgId);
  const { data: importsData, isLoading: importsLoading } = useGmailImports(currentOrgId, 'pending');
  const { data: ignoredData, isLoading: ignoredLoading } = useGmailImports(currentOrgId, 'ignored');
  const { data: importStats } = useImportStats(currentOrgId);
  const syncGmail = useSyncGmail();
  const confirmImport = useConfirmImport();
  const ignoreImport = useIgnoreImport();
  const restoreImportAction = useRestoreImport();
  const unconfirmImport = useUnconfirmImport();
  const disconnectGmail = useDisconnectGmail();

  const gmailConnected = gmailStatus?.connected;
  const pendingImports = importsData?.data || [];
  const ignoredImports = ignoredData?.data || [];

  // Auto-select review tab when URL has ?tab=review
  useEffect(() => {
    if (searchParams.get('tab') === 'review') setActiveTab('review');
  }, [searchParams]);

  // Auto-select review tab when pending imports exist on first load
  useEffect(() => {
    if (importStats && importStats.pending > 0 && searchParams.get('tab') !== 'review') {
      setActiveTab('review');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importStats?.pending]);

  // Handle Gmail OAuth callback
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === 'true') {
      toast({ title: 'Gmail connected successfully!' });
      if (currentOrgId) syncGmail.mutate({ orgId: currentOrgId });
    } else if (error) {
      toast({ title: 'Connection failed', description: 'Could not connect to Gmail.', variant: 'destructive' });
    }
  }, [searchParams, currentOrgId]);

  // Fetch charges for allocation and members for creating charges
  const { data: chargesData } = useCharges(currentOrgId, { status: 'OPEN' });
  const { data: membersData } = useMembers(currentOrgId, { status: 'ACTIVE', limit: 100 });
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

  // Find a matching member for a payer name
  const findMatchingMember = useCallback((payerName: string) => {
    if (!payerName || members.length === 0) return null;
    const normalizedPayer = payerName.toLowerCase().trim();
    for (const member of members) {
      const memberName = (member.displayName || member.name || member.user?.name || '').toLowerCase().trim();
      if (!memberName) continue;
      if (calculateNameSimilarity(payerName, memberName) >= 0.8) return member;
      if (memberName.includes(normalizedPayer) || normalizedPayer.includes(memberName)) return member;
    }
    return null;
  }, [members]);

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
              <ToastUndoButton
                onClick={() => {
                  const redoData = { amountCents: editingPayment.amountCents, paidAt: editingPayment.paidAt, rawPayerName: editingPayment.rawPayerName, memo: editingPayment.memo };
                  updatePayment.mutate(
                    { orgId: currentOrgId!, paymentId, data: undoData },
                    {
                      onSuccess: () => toast({
                        title: 'Change reverted',
                        action: (
                          <ToastUndoButton
                            onClick={() => updatePayment.mutate(
                              { orgId: currentOrgId!, paymentId, data: redoData },
                              { onSuccess: () => toast({ title: 'Payment updated' }) },
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
              <ToastUndoButton
                onClick={() => handleRestorePayment(paymentId)}
              />
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
              <ToastUndoButton
                onClick={() => deletePayment.mutate(
                  { orgId: currentOrgId!, paymentId },
                  { onSuccess: () => toast({ title: 'Payment deleted' }) },
                )}
                label="Redo"
              />
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
            title: 'Match removed',
            action: (
              <ToastUndoButton
                onClick={() => {
                  allocatePayment.mutate(
                    { orgId: currentOrgId!, paymentId, allocations: [{ chargeId: allocation.chargeId, amountCents: allocation.amountCents }] },
                    {
                      onSuccess: (result: any) => {
                        const newAllocId = result?.allocations?.[0]?.id;
                        toast({
                          title: 'Match restored',
                          action: newAllocId ? (
                            <ToastUndoButton
                              onClick={() => removeAllocation.mutate(
                                { orgId: currentOrgId!, allocationId: newAllocId },
                                { onSuccess: () => toast({ title: 'Match removed' }) },
                              )}
                              label="Redo"
                            />
                          ) : undefined,
                        });
                      },
                      onError: () => toast({ title: 'Failed to restore match', variant: 'destructive' }),
                    },
                  );
                }}
              />
            ),
          });
        },
        onError: (error: any) => toast({ title: 'Error removing match', description: error.message || 'Please try again', variant: 'destructive' }),
      },
    );
  }, [currentOrgId, removeAllocation, allocatePayment, toast]);

  const handleApplyToCharge = useCallback((payment: any) => {
    setChargeDialogPayment(payment);
    setSelectedChargeId('');
    setAllocationAmount(payment.unallocatedCents);
    setExpandedGroupKey(null);
  }, []);

  const closeChargeDialog = useCallback(() => {
    setChargeDialogPayment(null);
    setSelectedChargeId('');
    setAllocationAmount(0);
    setExpandedGroupKey(null);
  }, []);

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
            title: 'Payment matched',
            action: allocationId ? (
              <ToastUndoButton
                onClick={() => removeAllocation.mutate(
                  { orgId: currentOrgId!, allocationId },
                  {
                    onSuccess: () => toast({
                      title: 'Match removed',
                      action: (
                        <ToastUndoButton
                          onClick={() => allocatePayment.mutate(
                            { orgId: currentOrgId!, paymentId: redoPaymentId, allocations: [{ chargeId: redoChargeId, amountCents: redoAmount }] },
                            { onSuccess: () => toast({ title: 'Payment matched' }) },
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
          closeChargeDialog();
        },
        onError: (error: any) => {
          toast({
            title: 'Error matching payment',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      }
    );
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
          <ToastUndoButton
            onClick={async () => {
              let restoredCount = 0;
              for (const paymentId of paymentIds) {
                try { await restorePayment.mutateAsync({ orgId: currentOrgId, paymentId }); restoredCount++; } catch { /* continue */ }
              }
              toast({
                title: `Restored ${restoredCount} payment${restoredCount !== 1 ? 's' : ''}`,
                action: (
                  <ToastUndoButton
                    onClick={async () => {
                      const redoResult = await bulkDeletePayments.mutateAsync({ orgId: currentOrgId, paymentIds });
                      toast({ title: `Deleted ${redoResult.deletedCount} payment${redoResult.deletedCount !== 1 ? 's' : ''}` });
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
          title: `Auto-matched ${result.successCount} payment${result.successCount !== 1 ? 's' : ''}`,
          description: `$${(result.totalAllocatedCents / 100).toFixed(2)} matched to charges.${result.skippedCount > 0 ? ` ${result.skippedCount} skipped (no match).` : ''}`,
        });
      } else {
        toast({
          title: 'No payments matched',
          description: 'No matching members or open charges found for the selected payments.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Auto-matching failed',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleBulkCreateMembers = async () => {
    if (!currentOrgId || selectedPayments.size === 0) return;

    const selectedList = paginatedPayments.filter((p) => selectedPayments.has(p.id));
    const uniqueNames = new Map<string, string>();
    for (const p of selectedList) {
      const name = (p.rawPayerName || '').trim();
      if (name && !uniqueNames.has(name.toLowerCase())) {
        uniqueNames.set(name.toLowerCase(), name);
      }
    }

    const unmatchedNames = Array.from(uniqueNames.values()).filter(
      (name) => !findMatchingMember(name)
    );

    if (unmatchedNames.length === 0) {
      toast({ title: 'All payers already have matching members' });
      return;
    }

    try {
      const created = await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: unmatchedNames.map((name) => ({ name })),
      });
      setSelectedPayments(new Set());
      const names = created.map((m: any) => m.name).join(', ');
      toast({ title: `Created ${created.length} member${created.length !== 1 ? 's' : ''}: ${names}` });
    } catch (error: any) {
      toast({
        title: 'Error creating members',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleBulkCreateCharges = async () => {
    if (!currentOrgId || selectedPayments.size === 0) return;

    const selectedList = paginatedPayments.filter(
      (p) => selectedPayments.has(p.id) && p.unallocatedCents > 0
    );

    if (selectedList.length === 0) {
      toast({ title: 'No unmatched payments selected' });
      return;
    }

    // Deduplicate: one charge per member (sum unallocated cents from all their payments)
    const memberMap = new Map<string, { member: any; totalCents: number }>();
    let skipped = 0;
    for (const payment of selectedList) {
      const member = findMatchingMember(payment.rawPayerName || '');
      if (member) {
        const existing = memberMap.get(member.id);
        if (existing) {
          existing.totalCents += payment.unallocatedCents;
        } else {
          memberMap.set(member.id, { member, totalCents: payment.unallocatedCents });
        }
      } else {
        skipped++;
      }
    }

    const memberEntries = Array.from(memberMap.values());

    if (memberEntries.length === 0) {
      toast({
        title: 'No matching members found',
        description: 'Create members first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Bulk create one charge per member (batched audit log)
      const chargeSpecs = memberEntries.map(({ member, totalCents }) => ({
        membershipId: member.id,
        category: 'DUES' as string,
        title: 'Dues',
        amountCents: totalCents,
        dueDate: new Date().toISOString(),
      }));

      const createdCharges = await bulkCreateCharges.mutateAsync({
        orgId: currentOrgId,
        charges: chargeSpecs,
      });

      const chargeArray = Array.isArray(createdCharges) ? createdCharges : [createdCharges];

      // Auto-allocate each charge using fresh server data (locked transaction).
      // The server reads actual unallocated amounts and caps allocation accordingly.
      let totalAllocatedCents = 0;
      let allocatedCount = 0;
      for (const charge of chargeArray) {
        if (!charge?.id) continue;
        try {
          const result = await autoAllocate.mutateAsync({ orgId: currentOrgId, chargeId: charge.id });
          const cents = result?.allocatedCents || 0;
          totalAllocatedCents += cents;
          if (cents > 0) allocatedCount++;
        } catch {
          // auto-allocate failed for this charge — continue
        }
      }

      setSelectedPayments(new Set());
      const parts: string[] = [`Created ${chargeArray.length} charge${chargeArray.length !== 1 ? 's' : ''}`];
      if (totalAllocatedCents > 0) {
        parts.push(`matched $${(totalAllocatedCents / 100).toFixed(2)}`);
      }
      toast({
        title: parts.join(', '),
        description: skipped > 0 ? `${skipped} payment${skipped !== 1 ? 's' : ''} skipped (no matching member).` : undefined,
      });
    } catch (error: any) {
      toast({
        title: 'Error creating charges',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  // Reset selection when filters change
  useEffect(() => {
    setSelectedPayments(new Set());
  }, [allocationFilter, searchQuery, page]);

  const handleExportPayments = (format: 'csv' | 'pdf') => {
    const headers = ['Payer', 'Amount', 'Date', 'Source', 'Matched', 'Unmatched', 'Memo'];
    const rows = filteredPayments.map((p) => [
      p.rawPayerName || '',
      `$${(p.amountCents / 100).toFixed(2)}`,
      new Date(p.paidAt).toLocaleDateString(),
      p.source,
      `$${(p.allocatedCents / 100).toFixed(2)}`,
      `$${(p.unallocatedCents / 100).toFixed(2)}`,
      p.memo || '',
    ]);
    const filename = `payments-${new Date().toISOString().split('T')[0]}`;
    if (format === 'csv') exportCSV(headers, rows, filename);
    else exportPDF('Payments', headers, rows, filename);
  };

  // ── Review tab handlers ──────────────────────────────────────
  const handleGmailSync = () => {
    if (!currentOrgId) return;
    syncGmail.mutate(
      { orgId: currentOrgId },
      {
        onSuccess: (data) => {
          if (data.imported === 0) {
            toast({ title: 'All caught up!', description: 'No new payment emails found.' });
          } else if (data.autoConfirmed > 0 && data.needsReview === 0) {
            toast({ title: `${data.autoConfirmed} payments auto-confirmed!` });
          } else if (data.autoConfirmed > 0) {
            toast({ title: 'Sync complete', description: `${data.autoConfirmed} auto-confirmed, ${data.needsReview} need review` });
          } else {
            toast({ title: 'Sync complete', description: `${data.needsReview} payments need your review` });
          }
        },
        onError: (error: any) => {
          toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
        },
      },
    );
  };

  const handleConfirmImport = (importId: string, membershipId?: string) => {
    if (!currentOrgId) return;
    setConfirmingId(importId);
    confirmImport.mutate(
      { orgId: currentOrgId, importId, membershipId },
      {
        onSuccess: () => {
          toast({
            title: 'Payment confirmed!',
            action: (
              <ToastUndoButton
                onClick={() => unconfirmImport.mutate(
                  { orgId: currentOrgId!, importId },
                  {
                    onSuccess: () => toast({ title: 'Moved back to pending' }),
                    onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
                  },
                )}
              />
            ),
          });
          setConfirmingId(null);
        },
        onError: (error: any) => {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
          setConfirmingId(null);
        },
      },
    );
  };

  const handleIgnoreImport = (importId: string) => {
    if (!currentOrgId) return;
    setIgnoringId(importId);
    ignoreImport.mutate(
      { orgId: currentOrgId, importId },
      {
        onSuccess: () => {
          setIgnoringId(null);
          toast({
            title: 'Import ignored',
            action: (
              <ToastUndoButton
                onClick={() => restoreImportAction.mutate(
                  { orgId: currentOrgId!, importId },
                  {
                    onSuccess: () => toast({ title: 'Import restored' }),
                    onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
                  },
                )}
              />
            ),
          });
        },
        onError: (error: any) => {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
          setIgnoringId(null);
        },
      },
    );
  };

  const handleRestoreImport = (importId: string) => {
    if (!currentOrgId) return;
    setRestoringId(importId);
    restoreImportAction.mutate(
      { orgId: currentOrgId, importId },
      {
        onSuccess: () => {
          toast({ title: 'Import restored' });
          setRestoringId(null);
        },
        onError: (error: any) => {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
          setRestoringId(null);
        },
      },
    );
  };

  const handleCreateMemberForImport = async (name: string): Promise<string | null> => {
    if (!currentOrgId) return null;
    try {
      const result = await createMembers.mutateAsync({ orgId: currentOrgId, members: [{ name }] });
      const createdId = result[0]?.id;
      toast({
        title: `Member "${name}" created`,
        action: createdId ? (
          <ToastUndoButton
            onClick={() => deleteMember.mutate(
              { orgId: currentOrgId, memberId: createdId },
              {
                onSuccess: () => toast({ title: `${name} removed` }),
                onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
              },
            )}
          />
        ) : undefined,
      });
      return createdId || null;
    } catch (error: any) {
      toast({ title: 'Error creating member', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const toggleImportSelection = (importId: string) => {
    setSelectedImports((prev) => {
      const next = new Set(prev);
      if (next.has(importId)) next.delete(importId);
      else next.add(importId);
      return next;
    });
  };

  const handleBulkApproveImports = async () => {
    if (!currentOrgId || selectedImports.size === 0) return;
    setIsBulkProcessing(true);
    const importIds = Array.from(selectedImports);
    let approvedCount = 0;
    for (const importId of importIds) {
      try { await confirmImport.mutateAsync({ orgId: currentOrgId, importId }); approvedCount++; } catch { /* continue */ }
    }
    setSelectedImports(new Set());
    setIsBulkProcessing(false);
    toast({ title: `Approved ${approvedCount} payment${approvedCount !== 1 ? 's' : ''}` });
  };

  const handleBulkIgnoreImports = async () => {
    if (!currentOrgId || selectedImports.size === 0) return;
    setIsBulkProcessing(true);
    const importIds = Array.from(selectedImports);
    let ignoredCount = 0;
    for (const importId of importIds) {
      try { await ignoreImport.mutateAsync({ orgId: currentOrgId, importId }); ignoredCount++; } catch { /* continue */ }
    }
    setSelectedImports(new Set());
    setIsBulkProcessing(false);
    toast({ title: `Ignored ${ignoredCount} import${ignoredCount !== 1 ? 's' : ''}` });
  };

  const handleDisconnectGmail = () => {
    if (!currentOrgId) return;
    disconnectGmail.mutate({ orgId: currentOrgId }, { onSuccess: () => toast({ title: 'Gmail disconnected' }) });
  };

  return (
    <div data-tour="payments-list" className="space-y-8">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Payments"
          helpText="View and manage payments. Review imports from Gmail or manage confirmed payments."
          actions={
            <div className="flex items-center gap-2">
              {activeTab === 'review' && gmailConnected && (
                <Button variant="outline" size="sm" onClick={handleGmailSync} disabled={syncGmail.isPending}>
                  {syncGmail.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                  Sync
                </Button>
              )}
              {activeTab === 'payments' && isAdmin && (
                <Button asChild size="sm" className="hover:opacity-90 transition-opacity">
                  <Link href="/payments/new">
                    <Plus className="w-4 h-4 mr-1.5" />
                    Record Payment
                  </Link>
                </Button>
              )}
              {activeTab === 'payments' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExportPayments('csv')} className="cursor-pointer">
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportPayments('pdf')} className="cursor-pointer">
                      <FileText className="w-4 h-4 mr-2" />
                      Export PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          }
        />
      </FadeIn>

      {/* Tab Bar */}
      <FadeIn delay={0.05}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('review')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm',
              activeTab === 'review'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
            )}
          >
            <Mail className="w-4 h-4" />
            Review
            {importStats && importStats.pending > 0 && (
              <Badge variant={activeTab === 'review' ? 'secondary' : 'outline'} className="ml-1 text-xs">
                {importStats.pending}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm',
              activeTab === 'payments'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
            )}
          >
            <CreditCard className="w-4 h-4" />
            Payments
          </button>
        </div>
      </FadeIn>

      {/* ── Review Tab ──────────────────────────────────────────── */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          {/* Gmail Connection Status */}
          {gmailStatusLoading ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : gmailConnected ? (
            <div className="rounded-2xl border border-success/30 bg-gradient-to-br from-success/10 via-success/5 to-transparent p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="font-semibold">Gmail Connected</p>
                    <p className="text-sm text-muted-foreground">{gmailStatus?.email}</p>
                    {gmailStatus?.lastSyncAt && (
                      <p className="text-xs text-muted-foreground">Last synced: {new Date(gmailStatus.lastSyncAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleDisconnectGmail} className="text-muted-foreground hover:text-destructive">
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-blue-500/5 to-primary/5 animate-pulse" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
                    <Zap className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Auto-Import Payments</h2>
                    <p className="text-muted-foreground">Connect Gmail to automatically import Venmo and Zelle notifications</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3 mb-6">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-card/50">
                    <div className="p-2 rounded-lg bg-success/10"><Sparkles className="w-5 h-5 text-success" /></div>
                    <div><p className="font-medium">Auto-match members</p><p className="text-sm text-muted-foreground">Payments auto-assigned when names match</p></div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-card/50">
                    <div className="p-2 rounded-lg bg-primary/10"><CheckCircle2 className="w-5 h-5 text-primary" /></div>
                    <div><p className="font-medium">Smart matching</p><p className="text-sm text-muted-foreground">Derives reason from payment memo</p></div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-card/50">
                    <div className="p-2 rounded-lg bg-blue-500/10"><AlertCircle className="w-5 h-5 text-blue-400" /></div>
                    <div><p className="font-medium">Review unknowns only</p><p className="text-sm text-muted-foreground">Manual review when no match found</p></div>
                  </div>
                </div>
                <a href={currentOrgId ? getGmailConnectUrl(currentOrgId) : '#'} className="inline-flex">
                  <Button className="hover:opacity-90">
                    <Mail className="w-4 h-4 mr-2" />
                    Connect Gmail
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </a>
              </div>
            </div>
          )}

          {/* Stats */}
          {gmailConnected && importStats && (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1"><Clock className="w-4 h-4" /><span className="text-sm">Pending</span></div>
                <p className="text-xl font-bold">{importStats.pending}</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-success mb-1"><CheckCircle2 className="w-4 h-4" /><span className="text-sm">Confirmed</span></div>
                <p className="text-xl font-bold text-success">{importStats.autoConfirmed + importStats.confirmed}</p>
                <p className="text-xs text-muted-foreground">last 7 days</p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1"><X className="w-4 h-4" /><span className="text-sm">Ignored</span></div>
                <p className="text-xl font-bold">{importStats.ignored}</p>
                <p className="text-xs text-muted-foreground">last 7 days</p>
              </div>
            </div>
          )}

          {/* Pending / Ignored sub-tabs */}
          {gmailConnected && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setReviewSubTab('pending')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm',
                    reviewSubTab === 'pending' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                  )}
                >
                  <Clock className="w-4 h-4" />
                  Pending
                  {pendingImports.length > 0 && <Badge variant="outline" className="ml-1">{pendingImports.length}</Badge>}
                </button>
                <button
                  onClick={() => setReviewSubTab('ignored')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm',
                    reviewSubTab === 'ignored' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                  )}
                >
                  <EyeOff className="w-4 h-4" />
                  Ignored
                  {ignoredImports.length > 0 && <Badge variant="outline" className="ml-1">{ignoredImports.length}</Badge>}
                </button>
              </div>

              {reviewSubTab === 'pending' && (() => {
                const filteredImports = pendingSearch
                  ? pendingImports.filter((item) =>
                      (item.parsedPayerName || '').toLowerCase().includes(pendingSearch.toLowerCase()) ||
                      (item.parsedMemo || '').toLowerCase().includes(pendingSearch.toLowerCase()))
                  : pendingImports;

                const totalPendingPages = Math.ceil(filteredImports.length / pendingPerPage);
                const pendingStartIndex = (pendingPage - 1) * pendingPerPage;
                const paginatedImports = filteredImports.slice(pendingStartIndex, pendingStartIndex + pendingPerPage);
                const currentPageIds = paginatedImports.map((i) => i.id);
                const isAllCurrentPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedImports.has(id));

                const toggleSelectAllCurrentPage = () => {
                  if (isAllCurrentPageSelected) {
                    setSelectedImports((prev) => { const next = new Set(prev); currentPageIds.forEach((id) => next.delete(id)); return next; });
                  } else {
                    setSelectedImports((prev) => { const next = new Set(Array.from(prev)); currentPageIds.forEach((id) => next.add(id)); return next; });
                  }
                };

                return importsLoading ? <ReviewLoadingSkeleton /> : pendingImports.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Show</span>
                        <Select value={String(pendingPerPage)} onValueChange={(v) => { setPendingPerPage(Number(v)); setPendingPage(1); }}>
                          <SelectTrigger className="w-20 h-8 bg-secondary/30 border-border/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="20">20</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                          </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground">per page</span>
                      </div>
                      <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search by name or memo..." value={pendingSearch} onChange={(e) => { setPendingSearch(e.target.value); setPendingPage(1); }} className="pl-10 h-9 bg-secondary/30 border-border/50 focus:border-primary" />
                      </div>
                    </div>

                    {filteredImports.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">No results found for &quot;{pendingSearch}&quot;</div>
                    ) : (
                      <>
                        <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 flex items-center justify-between">
                          <button onClick={toggleSelectAllCurrentPage} className="flex items-center gap-3 transition-colors" title={isAllCurrentPageSelected ? "Deselect all" : "Select all"}>
                            {isAllCurrentPageSelected ? <CheckCircle2 className="w-5 h-5 text-primary" /> : <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />}
                            <span className="text-sm text-muted-foreground">{isAllCurrentPageSelected ? 'Deselect all on page' : 'Select all on page'}</span>
                          </button>
                          <div className={`flex items-center gap-2 transition-opacity ${selectedImports.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <button onClick={handleBulkApproveImports} disabled={isBulkProcessing} className="w-7 h-7 flex items-center justify-center transition-colors hover:text-success" title={`Approve ${selectedImports.size} selected`}>
                              {isBulkProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-muted-foreground hover:text-success" />}
                            </button>
                            <button onClick={handleBulkIgnoreImports} disabled={isBulkProcessing} className="w-7 h-7 flex items-center justify-center transition-colors hover:text-destructive" title={`Ignore ${selectedImports.size} selected`}>
                              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                        <AnimatedList
                          items={paginatedImports}
                          getKey={(item) => item.id}
                          className="space-y-3"
                          renderItem={(item) => (
                            <ImportCard
                              item={item}
                              members={members}
                              onConfirm={(membershipId) => handleConfirmImport(item.id, membershipId)}
                              onIgnore={() => handleIgnoreImport(item.id)}
                              onCreateMember={handleCreateMemberForImport}
                              isConfirming={confirmingId === item.id}
                              isIgnoring={ignoringId === item.id}
                              isSelected={selectedImports.has(item.id)}
                              onToggleSelect={() => toggleImportSelection(item.id)}
                            />
                          )}
                        />
                        {totalPendingPages > 1 && (
                          <div className="flex items-center justify-between pt-4">
                            <span className="text-sm text-muted-foreground">
                              Showing {pendingStartIndex + 1}-{Math.min(pendingStartIndex + pendingPerPage, filteredImports.length)} of {filteredImports.length}
                            </span>
                            <Pagination page={pendingPage} totalPages={totalPendingPages} onPageChange={setPendingPage} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/50 bg-card/30 py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-success" />
                    </div>
                    <h3 className="font-semibold mb-2">Inbox Zero!</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">All caught up. New payment emails will appear here when you sync.</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={handleGmailSync} disabled={syncGmail.isPending}>
                      {syncGmail.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Check for new emails
                    </Button>
                  </div>
                );
              })()}

              {reviewSubTab === 'ignored' && (
                ignoredLoading ? <ReviewLoadingSkeleton /> : ignoredImports.length > 0 ? (
                  <AnimatedList
                    items={ignoredImports}
                    getKey={(item) => item.id}
                    className="space-y-3"
                    renderItem={(item) => (
                      <MotionCard className="opacity-60 hover:opacity-100 transition-opacity">
                        <MotionCardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1">
                              <AvatarGradient name={item.parsedPayerName || 'Unknown'} size="lg" />
                              <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold">{item.parsedPayerName || 'Unknown Payer'}</p>
                                  <Badge variant="outline" className="text-muted-foreground">Ignored</Badge>
                                </div>
                                {item.parsedAmount && <Money cents={item.parsedAmount} size="lg" className="text-muted-foreground" />}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span>{new Date(item.emailDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => handleRestoreImport(item.id)} disabled={restoringId === item.id}>
                              {restoringId === item.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Undo2 className="w-4 h-4 mr-2" />}
                              Restore
                            </Button>
                          </div>
                        </MotionCardContent>
                      </MotionCard>
                    )}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-border/50 bg-card/30 py-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <EyeOff className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-2">No ignored items</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">Items you ignore will appear here. You can restore them anytime.</p>
                  </div>
                )
              )}
            </div>
          )}

          {/* Floating Batch Actions Bar — Pending */}
          <BatchActionsBar selectedCount={selectedImports.size} onClear={() => setSelectedImports(new Set())}>
            <Button size="sm" variant="outline" className="border-success/30 text-success hover:bg-success/10" onClick={handleBulkApproveImports} disabled={isBulkProcessing}>
              {isBulkProcessing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
              Approve
            </Button>
            <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleBulkIgnoreImports} disabled={isBulkProcessing}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Ignore
            </Button>
          </BatchActionsBar>
        </div>
      )}

      {/* ── Payments Tab ────────────────────────────────────────── */}
      {activeTab === 'payments' && <>
      {/* Stats Grid */}
      {totalPayments > 0 && (
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
            title="Unmatched"
            value={totalUnallocated}
            isMoney
            description={totalUnallocated > 0 ? 'Pending auto-match' : 'All matched'}
            icon={Wallet}
            delay={0.2}
            color="amber"
          />
        </div>
      )}

      {/* Search + Filter */}
      <FadeIn delay={0.2}>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search payments..."
              aria-label="Search payments"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-secondary/30 border-border/50"
            />
          </div>
          <div className="flex gap-2">
            <Select value={allocationFilter} onValueChange={(v) => setAllocationFilter(v as any)}>
              <SelectTrigger className="w-[120px] sm:w-[140px] h-8 bg-secondary/30 border-border/50 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
                <SelectItem value="allocated">Matched</SelectItem>
                <SelectItem value="unallocated">Unmatched</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FadeIn>

      {/* Payments List */}
      {isLoading ? (
        <div className="space-y-3">
          <PaymentCardSkeleton />
          <PaymentCardSkeleton />
          <PaymentCardSkeleton />
        </div>
      ) : filteredPayments.length === 0 ? (
        <FadeIn delay={0.3}>
          <EmptyState
            icon={CreditCard}
            title="No payments yet"
            description="Payments will appear here once recorded"
            action={isAdmin && (
              <Button asChild>
                <Link href="/payments/new">Record your first payment</Link>
              </Button>
            )}
            className="rounded-xl border border-border/50 bg-card/50"
          />
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
                    title={`Auto-match ${selectedPayments.size} selected`}
                    disabled={bulkAutoAllocate.isPending}
                  >
                    {bulkAutoAllocate.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Link2 className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    )}
                  </button>
                  <button
                    onClick={handleBulkCreateCharges}
                    className="w-7 h-7 flex items-center justify-center transition-all hover:text-primary"
                    title={`Create charges for ${selectedPayments.size} selected`}
                    disabled={bulkCreateCharges.isPending}
                  >
                    <Receipt className="w-4 h-4 text-muted-foreground hover:text-primary" />
                  </button>
                  <button
                    onClick={handleBulkCreateMembers}
                    className="w-7 h-7 flex items-center justify-center transition-all hover:text-primary"
                    title={`Create members from ${selectedPayments.size} selected`}
                    disabled={createMembers.isPending}
                  >
                    <UserPlus className="w-4 h-4 text-muted-foreground hover:text-primary" />
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
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="justify-center pt-4" />
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
                <DatePicker
                  value={editingPayment.paidAt}
                  onChange={(date) => setEditingPayment({ ...editingPayment, paidAt: date })}
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
              Are you sure you want to delete this payment? This will also remove any matches to charges.
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
              {chargeDialogPayment && chargeDialogPayment.unallocatedCents > 0 ? 'Apply to Charge' : 'Manage Matches'}
            </DialogTitle>
            <DialogDescription>
              {chargeDialogPayment && chargeDialogPayment.unallocatedCents > 0
                ? 'Match this payment to an existing charge.'
                : 'View and manage current matches for this payment.'}
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
                    <p className="text-xs text-muted-foreground">unmatched</p>
                  </div>
                </div>
              </div>

              {/* Current matches */}
              {hasAllocations && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Current Matches</p>
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
                          title="Remove match"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Charge list - only when there are unmatched funds */}
              {hasUnallocatedFunds ? (
                <>
                  <div className="flex-1 overflow-y-auto min-h-0 scrollbar-none px-0.5 -mx-0.5">
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

                    {/* Match amount input */}
                    {selectedChargeId && (
                      <div className="space-y-2 pt-2 border-t border-border/30">
                        <Label>Amount to Match ($)</Label>
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
                  </div>
                </>
              ) : hasAllocations ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Remove a match above to re-match funds.
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
                <Button
                  onClick={handleConfirmAllocate}
                  disabled={allocatePayment.isPending || !selectedChargeId}
                >
                  {allocatePayment.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Matching...
                    </>
                  ) : (
                    'Match'
                  )}
                </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BatchActionsBar selectedCount={selectedPayments.size} onClear={() => setSelectedPayments(new Set())}>
        <Button variant="secondary" size="sm" onClick={handleBulkAutoAllocate} disabled={bulkAutoAllocate.isPending} className="h-8">
          <Link2 className="w-3.5 h-3.5 mr-1.5" />
          Auto-Match
        </Button>
        <Button variant="secondary" size="sm" onClick={handleBulkCreateCharges} disabled={bulkCreateCharges.isPending} className="h-8">
          <Receipt className="w-3.5 h-3.5 mr-1.5" />
          Create Charges
        </Button>
        <Button variant="secondary" size="sm" onClick={handleBulkCreateMembers} disabled={createMembers.isPending} className="h-8">
          <UserPlus className="w-3.5 h-3.5 mr-1.5" />
          Create Members
        </Button>
        <Button variant="destructive" size="sm" onClick={handleBulkDeletePayments} className="h-8">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Delete
        </Button>
      </BatchActionsBar>
      </>}
    </div>
  );
}
