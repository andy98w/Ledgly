'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Zap,
  RefreshCw,
  X,
  ExternalLink,
  Loader2,
  Sparkles,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Undo2,
  EyeOff,
  Info,
  Circle,
  Trash2,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth';
import { useMembers, useCreateMembers } from '@/lib/queries/members';
import {
  useGmailStatus,
  useGmailImports,
  useImportStats,
  useSyncGmail,
  useConfirmImport,
  useIgnoreImport,
  useRestoreImport,
  useDisconnectGmail,
  getGmailConnectUrl,
  type EmailImport,
} from '@/lib/queries/gmail';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/ui/money';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import {
  MotionCard,
  MotionCardContent,
} from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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

  // Try to auto-match based on payer name
  useEffect(() => {
    if (item.parsedPayerName && members.length > 0) {
      const payerNameLower = item.parsedPayerName.toLowerCase();
      const match = members.find((m) =>
        m.displayName.toLowerCase().includes(payerNameLower) ||
        payerNameLower.includes(m.displayName.toLowerCase()),
      );
      if (match) {
        setSelectedMemberId(match.id);
      }
    }
  }, [item.parsedPayerName, members]);

  // Filter members based on search
  const filteredMembers = memberSearch
    ? members.filter((m) => m.displayName.toLowerCase().includes(memberSearch.toLowerCase()))
    : members;

  // Get the name to use for creating a new member
  // Use the search term if typed, otherwise use the payer name
  const createName = memberSearch.trim() || item.parsedPayerName || '';

  // Check if we can create a new member with this name
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
    <StaggerItem>
      <MotionCard className={isOutgoing
        ? 'border-l-4 border-l-destructive/30 bg-destructive/5'
        : 'border-l-4 border-l-success/30 bg-success/5'
      }>
        <MotionCardContent className="p-3">
          <div className="flex items-start justify-between gap-3">
            {onToggleSelect && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect();
                }}
                className="mt-1 flex items-center justify-center transition-colors"
                title={isSelected ? "Deselect" : "Select"}
              >
                {isSelected ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                )}
              </button>
            )}
            <div className="flex items-start gap-3 flex-1">
              <AvatarGradient
                name={item.parsedPayerName || 'Unknown'}
                size="md"
              />
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">
                    {isOutgoing ? `To: ${item.parsedPayerName || 'Unknown'}` : item.parsedPayerName || 'Unknown Payer'}
                  </p>
                  <Badge
                    variant="outline"
                    className={`text-xs ${isOutgoing
                      ? 'bg-destructive/10 text-destructive border-destructive/20'
                      : 'bg-success/10 text-success border-success/20'
                    }`}
                  >
                    {isOutgoing ? (
                      <><ArrowUpRight className="w-3 h-3 mr-1" />Out</>
                    ) : (
                      <><ArrowDownLeft className="w-3 h-3 mr-1" />In</>
                    )}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${sourceColors[item.parsedSource] || ''}`}
                  >
                    {item.parsedSource}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  {item.parsedAmount && (
                    <Money cents={item.parsedAmount} size="md" />
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>
                      {new Date(item.emailDate).toLocaleDateString()}
                    </span>
                    {item.parsedMemo && (
                      <>
                        <span className="opacity-30">•</span>
                        <span>"{item.parsedMemo}"</span>
                      </>
                    )}
                  </div>
                </div>
                {item.needsReviewReason && (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 text-warning" />
                    <p className="text-xs text-warning">{item.needsReviewReason}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isOutgoing && (
                <Select
                  value={selectedMemberId}
                  onValueChange={(v) => {
                    setSelectedMemberId(v);
                    setMemberSearch('');
                  }}
                >
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateAndSelect();
                        }}
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
                onClick={() =>
                  onConfirm(isOutgoing ? undefined : (selectedMemberId === 'none' ? undefined : selectedMemberId))
                }
                disabled={isConfirming || isIgnoring || !item.parsedAmount}
              >
                {isConfirming ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={onIgnore}
                disabled={isConfirming || isIgnoring}
              >
                {isIgnoring ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
}

function LoadingSkeleton() {
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

export default function InboxPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const [activeTab, setActiveTab] = useState<'pending' | 'ignored'>('pending');

  const { data: gmailStatus, isLoading: statusLoading } = useGmailStatus(currentOrgId);
  const { data: importsData, isLoading: importsLoading } = useGmailImports(currentOrgId, 'pending');
  const { data: ignoredData, isLoading: ignoredLoading } = useGmailImports(currentOrgId, 'ignored');
  const { data: autoConfirmedData } = useGmailImports(currentOrgId, 'auto_confirmed');
  const { data: importStats } = useImportStats(currentOrgId);
  const { data: membersData } = useMembers(currentOrgId, { status: 'ACTIVE', limit: 100 });

  const syncGmail = useSyncGmail();
  const confirmImport = useConfirmImport();
  const ignoreImport = useIgnoreImport();
  const restoreImport = useRestoreImport();
  const disconnectGmail = useDisconnectGmail();
  const createMembers = useCreateMembers();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [autoConfirmedPage, setAutoConfirmedPage] = useState(1);
  const [autoConfirmedPerPage, setAutoConfirmedPerPage] = useState(10);
  const [autoConfirmedSearch, setAutoConfirmedSearch] = useState('');
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPerPage, setPendingPerPage] = useState(10);
  const [pendingSearch, setPendingSearch] = useState('');

  // Handle OAuth callback
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected === 'true') {
      toast({ title: 'Gmail connected successfully!' });
      // Trigger initial sync
      if (currentOrgId) {
        syncGmail.mutate({ orgId: currentOrgId });
      }
    } else if (error) {
      toast({
        title: 'Connection failed',
        description: 'Could not connect to Gmail. Please try again.',
        variant: 'destructive',
      });
    }
  }, [searchParams, currentOrgId]);

  const handleSync = () => {
    if (!currentOrgId) return;
    syncGmail.mutate(
      { orgId: currentOrgId },
      {
        onSuccess: (data) => {
          if (data.imported === 0) {
            toast({
              title: 'All caught up!',
              description: 'No new payment emails found.',
            });
          } else if (data.autoConfirmed > 0 && data.needsReview === 0) {
            toast({
              title: `${data.autoConfirmed} payments auto-confirmed!`,
              description: 'Members matched automatically and payments allocated.',
            });
          } else if (data.autoConfirmed > 0) {
            toast({
              title: 'Sync complete',
              description: `${data.autoConfirmed} auto-confirmed, ${data.needsReview} need review`,
            });
          } else {
            toast({
              title: 'Sync complete',
              description: `${data.needsReview} payments need your review`,
            });
          }
        },
        onError: (error: any) => {
          toast({
            title: 'Sync failed',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleConfirm = (importId: string, membershipId?: string) => {
    if (!currentOrgId) return;
    setConfirmingId(importId);
    confirmImport.mutate(
      { orgId: currentOrgId, importId, membershipId },
      {
        onSuccess: () => {
          toast({ title: 'Payment confirmed!' });
          setConfirmingId(null);
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          });
          setConfirmingId(null);
        },
      },
    );
  };

  const handleIgnore = (importId: string) => {
    if (!currentOrgId) return;
    setIgnoringId(importId);
    ignoreImport.mutate(
      { orgId: currentOrgId, importId },
      {
        onSuccess: () => {
          setIgnoringId(null);
          toast({
            title: 'Import ignored',
            description: 'You can undo this action.',
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(importId)}
              >
                Undo
              </Button>
            ),
          });
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          });
          setIgnoringId(null);
        },
      },
    );
  };

  const handleRestore = (importId: string, showToast = true) => {
    if (!currentOrgId) return;
    setRestoringId(importId);
    restoreImport.mutate(
      { orgId: currentOrgId, importId },
      {
        onSuccess: () => {
          if (showToast) {
            toast({ title: 'Import restored' });
          }
          setRestoringId(null);
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          });
          setRestoringId(null);
        },
      },
    );
  };

  const handleDisconnect = () => {
    if (!currentOrgId) return;
    disconnectGmail.mutate(
      { orgId: currentOrgId },
      {
        onSuccess: () => {
          toast({ title: 'Gmail disconnected' });
        },
      },
    );
  };

  const handleCreateMember = async (name: string): Promise<string | null> => {
    if (!currentOrgId) return null;
    try {
      const result = await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name }],
      });
      toast({ title: `Member "${name}" created` });
      return result[0]?.id || null;
    } catch (error: any) {
      toast({
        title: 'Error creating member',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  };

  const toggleImportSelection = (importId: string) => {
    setSelectedImports((prev) => {
      const next = new Set(prev);
      if (next.has(importId)) {
        next.delete(importId);
      } else {
        next.add(importId);
      }
      return next;
    });
  };

  const handleBulkApprove = async () => {
    if (!currentOrgId || selectedImports.size === 0) return;
    setIsBulkProcessing(true);

    const importIds = Array.from(selectedImports);
    let approvedCount = 0;

    for (const importId of importIds) {
      try {
        await confirmImport.mutateAsync({ orgId: currentOrgId, importId });
        approvedCount++;
      } catch (error) {
        // Continue with other approvals
      }
    }

    setSelectedImports(new Set());
    setIsBulkProcessing(false);
    toast({ title: `Approved ${approvedCount} payment${approvedCount !== 1 ? 's' : ''}` });
  };

  const handleBulkIgnore = async () => {
    if (!currentOrgId || selectedImports.size === 0) return;
    setIsBulkProcessing(true);

    const importIds = Array.from(selectedImports);
    const ignoredIds: string[] = [];

    for (const importId of importIds) {
      try {
        await ignoreImport.mutateAsync({ orgId: currentOrgId, importId });
        ignoredIds.push(importId);
      } catch (error) {
        // Continue with other ignores
      }
    }

    setSelectedImports(new Set());
    setIsBulkProcessing(false);

    const handleUndo = async () => {
      let restoredCount = 0;
      for (const importId of ignoredIds) {
        try {
          await restoreImport.mutateAsync({ orgId: currentOrgId, importId });
          restoredCount++;
        } catch (error) {
          // Continue
        }
      }
      toast({ title: `Restored ${restoredCount} import${restoredCount !== 1 ? 's' : ''}` });
    };

    toast({
      title: `Ignored ${ignoredIds.length} import${ignoredIds.length !== 1 ? 's' : ''}`,
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

  const isConnected = gmailStatus?.connected;
  const imports = importsData?.data || [];
  const ignored = ignoredData?.data || [];
  const autoConfirmed = autoConfirmedData?.data || [];
  const members = membersData?.data || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">Review and approve incoming payment notifications from Gmail. Connect your Gmail to auto-import Venmo and Zelle payments. Use selection checkboxes for bulk actions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {isConnected && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncGmail.isPending}
              >
                {syncGmail.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sync
              </Button>
            </div>
          )}
        </div>
      </FadeIn>

      {/* Gmail Connection Status */}
      <FadeIn delay={0.1}>
        {statusLoading ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : isConnected ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-success/30 bg-gradient-to-br from-success/10 via-success/5 to-transparent p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="font-semibold">Gmail Connected</p>
                  <p className="text-sm text-muted-foreground">
                    {gmailStatus?.email}
                  </p>
                  {gmailStatus?.lastSyncAt && (
                    <p className="text-xs text-muted-foreground">
                      Last synced:{' '}
                      {new Date(gmailStatus.lastSyncAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                className="text-muted-foreground hover:text-destructive"
              >
                Disconnect
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-blue-500/5 to-primary/5 animate-pulse" />
            <div className="relative">
              <div className="flex items-center gap-4 mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 200,
                    damping: 15,
                    delay: 0.2,
                  }}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg glow-md"
                >
                  <Zap className="w-7 h-7 text-primary-foreground" />
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold">Auto-Import Payments</h2>
                  <p className="text-muted-foreground">
                    Connect Gmail to automatically import Venmo and Zelle
                    notifications
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3 mb-6">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-card/50">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Sparkles className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="font-medium">Auto-match members</p>
                    <p className="text-sm text-muted-foreground">
                      Payments auto-assigned when names match
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-card/50">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Smart allocation</p>
                    <p className="text-sm text-muted-foreground">
                      Derives reason from payment memo
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-card/50">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <AlertCircle className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Review unknowns only</p>
                    <p className="text-sm text-muted-foreground">
                      Manual review when no match found
                    </p>
                  </div>
                </div>
              </div>

              <a
                href={currentOrgId ? getGmailConnectUrl(currentOrgId) : '#'}
                className="inline-flex"
              >
                <Button className="bg-gradient-to-r from-primary to-blue-400 hover:opacity-90">
                  <Mail className="w-4 h-4 mr-2" />
                  Connect Gmail
                  <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </a>
            </div>
          </motion.div>
        )}
      </FadeIn>

      {/* Stats Cards */}
      {isConnected && importStats && (
        <FadeIn delay={0.15}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Pending</span>
              </div>
              <p className="text-2xl font-bold">{importStats.pending}</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-success mb-1">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm">Auto-confirmed</span>
              </div>
              <p className="text-2xl font-bold text-success">{importStats.autoConfirmed}</p>
              <p className="text-xs text-muted-foreground">last 7 days</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">Confirmed</span>
              </div>
              <p className="text-2xl font-bold">{importStats.confirmed}</p>
              <p className="text-xs text-muted-foreground">last 7 days</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <X className="w-4 h-4" />
                <span className="text-sm">Ignored</span>
              </div>
              <p className="text-2xl font-bold">{importStats.ignored}</p>
              <p className="text-xs text-muted-foreground">last 7 days</p>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Pending/Ignored Imports */}
      {isConnected && (
        <div className="space-y-4">
          <FadeIn delay={0.2}>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setActiveTab('pending')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'pending'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <Clock className="w-4 h-4" />
                Pending
                {imports.length > 0 && (
                  <Badge variant={activeTab === 'pending' ? 'secondary' : 'outline'} className="ml-1">
                    {imports.length}
                  </Badge>
                )}
              </button>
              <button
                onClick={() => setActiveTab('ignored')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'ignored'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <EyeOff className="w-4 h-4" />
                Ignored
                {ignored.length > 0 && (
                  <Badge variant={activeTab === 'ignored' ? 'secondary' : 'outline'} className="ml-1">
                    {ignored.length}
                  </Badge>
                )}
              </button>
            </div>
          </FadeIn>

          {activeTab === 'pending' && (() => {
            // Filter by search
            const filteredImports = pendingSearch
              ? imports.filter((item) =>
                  (item.parsedPayerName || '').toLowerCase().includes(pendingSearch.toLowerCase()) ||
                  (item.parsedMemo || '').toLowerCase().includes(pendingSearch.toLowerCase())
                )
              : imports;

            // Pagination
            const totalPendingPages = Math.ceil(filteredImports.length / pendingPerPage);
            const pendingStartIndex = (pendingPage - 1) * pendingPerPage;
            const paginatedImports = filteredImports.slice(pendingStartIndex, pendingStartIndex + pendingPerPage);

            // Track select all state for filtered/paginated items
            const currentPageIds = paginatedImports.map((i) => i.id);
            const isAllCurrentPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedImports.has(id));

            const toggleSelectAllCurrentPage = () => {
              if (isAllCurrentPageSelected) {
                setSelectedImports((prev) => {
                  const next = new Set(prev);
                  currentPageIds.forEach((id) => next.delete(id));
                  return next;
                });
              } else {
                setSelectedImports((prev) => { const next = new Set(Array.from(prev)); currentPageIds.forEach((id) => next.add(id)); return next; });
              }
            };

            return (
            <>
              {importsLoading ? (
                <LoadingSkeleton />
              ) : imports.length > 0 ? (
                <div className="space-y-3">
                  {/* Search and Per Page Controls */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Show</span>
                      <Select
                        value={String(pendingPerPage)}
                        onValueChange={(v) => {
                          setPendingPerPage(Number(v));
                          setPendingPage(1);
                        }}
                      >
                        <SelectTrigger className="w-20 h-8 bg-secondary/30 border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">per page</span>
                    </div>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or memo..."
                        value={pendingSearch}
                        onChange={(e) => {
                          setPendingSearch(e.target.value);
                          setPendingPage(1);
                        }}
                        className="pl-10 h-9 bg-secondary/30 border-border/50 focus:border-primary"
                      />
                    </div>
                  </div>

                  {filteredImports.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No results found for &quot;{pendingSearch}&quot;
                    </div>
                  ) : (
                    <>
                      {/* Select All Row */}
                      <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 flex items-center justify-between">
                        <button
                          onClick={toggleSelectAllCurrentPage}
                          className="flex items-center gap-3 transition-colors"
                          title={isAllCurrentPageSelected ? "Deselect all" : "Select all"}
                        >
                          {isAllCurrentPageSelected ? (
                            <CheckCircle2 className="w-5 h-5 text-primary" />
                          ) : (
                            <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                          )}
                          <span className="text-sm text-muted-foreground">
                            {isAllCurrentPageSelected ? 'Deselect all on page' : 'Select all on page'}
                          </span>
                        </button>
                        <div className={`flex items-center gap-2 transition-opacity ${selectedImports.size > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                          <button
                            onClick={handleBulkApprove}
                            disabled={isBulkProcessing || selectedImports.size === 0}
                            className="w-7 h-7 flex items-center justify-center transition-colors hover:text-success"
                            title={`Approve ${selectedImports.size} selected`}
                          >
                            {isBulkProcessing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-muted-foreground hover:text-success" />
                            )}
                          </button>
                          <button
                            onClick={handleBulkIgnore}
                            disabled={isBulkProcessing || selectedImports.size === 0}
                            className="w-7 h-7 flex items-center justify-center transition-colors hover:text-destructive"
                            title={`Ignore ${selectedImports.size} selected`}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                      <StaggerChildren className="space-y-3">
                        {paginatedImports.map((item) => (
                          <ImportCard
                            key={item.id}
                            item={item}
                            members={members}
                            onConfirm={(membershipId) => handleConfirm(item.id, membershipId)}
                            onIgnore={() => handleIgnore(item.id)}
                            onCreateMember={handleCreateMember}
                            isConfirming={confirmingId === item.id}
                            isIgnoring={ignoringId === item.id}
                            isSelected={selectedImports.has(item.id)}
                            onToggleSelect={() => toggleImportSelection(item.id)}
                          />
                        ))}
                      </StaggerChildren>

                      {/* Pagination */}
                      {totalPendingPages > 1 && (
                        <div className="flex items-center justify-between pt-4">
                          <span className="text-sm text-muted-foreground">
                            Showing {pendingStartIndex + 1}-{Math.min(pendingStartIndex + pendingPerPage, filteredImports.length)} of {filteredImports.length}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                              disabled={pendingPage === 1}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm">
                              Page {pendingPage} of {totalPendingPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPendingPage((p) => Math.min(totalPendingPages, p + 1))}
                              disabled={pendingPage === totalPendingPages}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <FadeIn delay={0.3}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-xl border border-dashed border-border/50 bg-card/30 py-12 text-center"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-success" />
                    </div>
                    <h3 className="font-semibold mb-2">Inbox Zero!</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      All caught up. New payment emails will appear here when you sync.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={handleSync}
                      disabled={syncGmail.isPending}
                    >
                      {syncGmail.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Check for new emails
                    </Button>
                  </motion.div>
                </FadeIn>
              )}
            </>
            );
          })()}

          {activeTab === 'ignored' && (
            <>
              {ignoredLoading ? (
                <LoadingSkeleton />
              ) : ignored.length > 0 ? (
                <StaggerChildren className="space-y-3">
                  {ignored.map((item) => (
                    <StaggerItem key={item.id}>
                      <MotionCard className="opacity-60 hover:opacity-100 transition-opacity">
                        <MotionCardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1">
                              <AvatarGradient
                                name={item.parsedPayerName || 'Unknown'}
                                size="lg"
                              />
                              <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold">
                                    {item.parsedPayerName || 'Unknown Payer'}
                                  </p>
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Ignored
                                  </Badge>
                                </div>
                                {item.parsedAmount && (
                                  <Money cents={item.parsedAmount} size="lg" className="text-muted-foreground" />
                                )}
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span>{new Date(item.emailDate).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRestore(item.id)}
                              disabled={restoringId === item.id}
                            >
                              {restoringId === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              ) : (
                                <Undo2 className="w-4 h-4 mr-2" />
                              )}
                              Restore
                            </Button>
                          </div>
                        </MotionCardContent>
                      </MotionCard>
                    </StaggerItem>
                  ))}
                </StaggerChildren>
              ) : (
                <FadeIn delay={0.3}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-xl border border-dashed border-border/50 bg-card/30 py-12 text-center"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <EyeOff className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-2">No ignored items</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Items you ignore will appear here. You can restore them anytime.
                    </p>
                  </motion.div>
                </FadeIn>
              )}
            </>
          )}
        </div>
      )}

      {/* Auto-Confirmed Payments */}
      {isConnected && autoConfirmed.length > 0 && (() => {
        // Filter by search
        const filteredAutoConfirmed = autoConfirmedSearch
          ? autoConfirmed.filter((item) =>
              (item.parsedPayerName || '').toLowerCase().includes(autoConfirmedSearch.toLowerCase()) ||
              (item.parsedMemo || '').toLowerCase().includes(autoConfirmedSearch.toLowerCase())
            )
          : autoConfirmed;

        // Pagination
        const totalPages = Math.ceil(filteredAutoConfirmed.length / autoConfirmedPerPage);
        const startIndex = (autoConfirmedPage - 1) * autoConfirmedPerPage;
        const paginatedAutoConfirmed = filteredAutoConfirmed.slice(startIndex, startIndex + autoConfirmedPerPage);

        return (
          <div className="space-y-4">
            <FadeIn delay={0.3}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-success" />
                <h2 className="text-lg font-semibold">Auto-Confirmed Payments</h2>
                <Badge variant="outline" className="border-success/30 text-success">
                  {autoConfirmed.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                These payments were automatically matched and allocated based on payer name and memo.
              </p>
            </FadeIn>

            {/* Search and Per Page Controls */}
            <FadeIn delay={0.35}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Show</span>
                  <Select
                    value={String(autoConfirmedPerPage)}
                    onValueChange={(v) => {
                      setAutoConfirmedPerPage(Number(v));
                      setAutoConfirmedPage(1);
                    }}
                  >
                    <SelectTrigger className="w-20 h-8 bg-secondary/30 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">per page</span>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or memo..."
                    value={autoConfirmedSearch}
                    onChange={(e) => {
                      setAutoConfirmedSearch(e.target.value);
                      setAutoConfirmedPage(1);
                    }}
                    className="pl-10 h-9 bg-secondary/30 border-border/50 focus:border-primary"
                  />
                </div>
              </div>
            </FadeIn>

            {filteredAutoConfirmed.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No results found for &quot;{autoConfirmedSearch}&quot;
              </div>
            ) : (
              <>
                <StaggerChildren className="space-y-2">
                  {paginatedAutoConfirmed.map((item) => {
                    const isOutgoing = item.parsedDirection === 'outgoing';
                    return (
                      <StaggerItem key={item.id}>
                        <div className={`flex items-center justify-between p-4 rounded-xl border ${
                          isOutgoing ? 'border-l-4 border-l-destructive/30' : 'border-l-4 border-l-success/30'
                        } bg-card/50`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isOutgoing ? 'bg-destructive/10' : 'bg-success/10'
                            }`}>
                              {isOutgoing ? (
                                <ArrowUpRight className="w-5 h-5 text-destructive" />
                              ) : (
                                <ArrowDownLeft className="w-5 h-5 text-success" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">
                                  {isOutgoing ? `To: ${item.parsedPayerName || 'Unknown'}` : item.parsedPayerName || 'Unknown'}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${isOutgoing
                                    ? 'bg-destructive/10 text-destructive border-destructive/20'
                                    : 'bg-success/10 text-success border-success/20'
                                  }`}
                                >
                                  {isOutgoing ? 'Expense' : 'Payment'}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{new Date(item.emailDate).toLocaleDateString()}</span>
                                {item.derivedCategory && (
                                  <>
                                    <span className="opacity-30">•</span>
                                    <Badge variant="outline" className="text-xs">
                                      {item.derivedCategory}
                                    </Badge>
                                  </>
                                )}
                                {item.matchConfidence && (
                                  <>
                                    <span className="opacity-30">•</span>
                                    <span className="text-xs">
                                      {Math.round(item.matchConfidence * 100)}% match
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          {item.parsedAmount && (
                            <Money cents={item.parsedAmount} size="md" />
                          )}
                        </div>
                      </StaggerItem>
                    );
                  })}
                </StaggerChildren>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-muted-foreground">
                      Showing {startIndex + 1}-{Math.min(startIndex + autoConfirmedPerPage, filteredAutoConfirmed.length)} of {filteredAutoConfirmed.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoConfirmedPage((p) => Math.max(1, p - 1))}
                        disabled={autoConfirmedPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm">
                        Page {autoConfirmedPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoConfirmedPage((p) => Math.min(totalPages, p + 1))}
                        disabled={autoConfirmedPage === totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
