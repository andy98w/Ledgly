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
} from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth';
import { useMembers } from '@/lib/queries/members';
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

function ImportCard({
  item,
  members,
  onConfirm,
  onIgnore,
  isConfirming,
  isIgnoring,
}: {
  item: EmailImport;
  members: Array<{ id: string; displayName: string }>;
  onConfirm: (membershipId?: string) => void;
  onIgnore: () => void;
  isConfirming: boolean;
  isIgnoring: boolean;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('none');

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
        ? 'border-l-4 border-l-destructive/50 bg-destructive/5'
        : 'border-l-4 border-l-success/50 bg-success/5'
      }>
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
                    {isOutgoing ? `To: ${item.parsedPayerName || 'Unknown'}` : item.parsedPayerName || 'Unknown Payer'}
                  </p>
                  <Badge
                    variant="outline"
                    className={isOutgoing
                      ? 'bg-destructive/10 text-destructive border-destructive/30'
                      : 'bg-success/10 text-success border-success/30'
                    }
                  >
                    {isOutgoing ? (
                      <><ArrowUpRight className="w-3 h-3 mr-1" />Outgoing</>
                    ) : (
                      <><ArrowDownLeft className="w-3 h-3 mr-1" />Incoming</>
                    )}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={sourceColors[item.parsedSource] || ''}
                  >
                    {item.parsedSource}
                  </Badge>
                </div>
                {item.parsedAmount && (
                  <Money cents={item.parsedAmount} size="lg" />
                )}
                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                  <span>
                    {new Date(item.emailDate).toLocaleDateString()}
                  </span>
                  <span className="opacity-30">•</span>
                  {item.parsedMemo ? (
                    <span>"{item.parsedMemo}"</span>
                  ) : (
                    <span className="italic opacity-60">No description</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-md">
                  {item.emailSubject}
                </p>
                {item.needsReviewReason && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <AlertCircle className="w-3 h-3 text-warning" />
                    <p className="text-xs text-warning">{item.needsReviewReason}</p>
                  </div>
                )}
              </div>
            </div>

            {!isOutgoing && (
              <div className="text-right space-y-2 min-w-[180px]">
                <p className="text-xs text-muted-foreground">Assign to member:</p>
                <Select
                  value={selectedMemberId}
                  onValueChange={setSelectedMemberId}
                >
                  <SelectTrigger className="h-9 bg-secondary/30 border-border/50">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <AvatarGradient name={member.displayName} size="xs" />
                          {member.displayName}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border/30">
            <Button
              size="sm"
              className={`flex-1 ${isOutgoing
                ? 'bg-gradient-to-r from-destructive to-red-400 hover:opacity-90'
                : 'bg-gradient-to-r from-primary to-blue-400 hover:opacity-90'
              }`}
              onClick={() =>
                onConfirm(isOutgoing ? undefined : (selectedMemberId === 'none' ? undefined : selectedMemberId))
              }
              disabled={isConfirming || isIgnoring || !item.parsedAmount}
            >
              {isConfirming ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              {isOutgoing ? 'Confirm Expense' : 'Confirm Payment'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onIgnore}
              disabled={isConfirming || isIgnoring}
            >
              {isIgnoring ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </Button>
          </div>
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border/50 bg-card p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-40" />
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-4 border-t border-border/30">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-9" />
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

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

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
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
            <p className="text-muted-foreground mt-1">
              Review and approve incoming payments
            </p>
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

          {activeTab === 'pending' && (
            <>
              {importsLoading ? (
                <LoadingSkeleton />
              ) : imports.length > 0 ? (
                <StaggerChildren className="space-y-3">
                  {imports.map((item) => (
                    <ImportCard
                      key={item.id}
                      item={item}
                      members={members}
                      onConfirm={(membershipId) => handleConfirm(item.id, membershipId)}
                      onIgnore={() => handleIgnore(item.id)}
                      isConfirming={confirmingId === item.id}
                      isIgnoring={ignoringId === item.id}
                    />
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
          )}

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

      {/* Recently Auto-Confirmed */}
      {isConnected && autoConfirmed.length > 0 && (
        <div className="space-y-4">
          <FadeIn delay={0.3}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-success" />
              <h2 className="text-lg font-semibold">Recently Auto-Confirmed</h2>
              <Badge variant="outline" className="border-success/30 text-success">
                {autoConfirmed.length}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              These payments were automatically matched and allocated based on payer name and memo.
            </p>
          </FadeIn>

          <StaggerChildren className="space-y-2">
            {autoConfirmed.slice(0, 5).map((item) => (
              <StaggerItem key={item.id}>
                <div className="flex items-center justify-between p-4 rounded-xl border bg-card/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <p className="font-medium">{item.parsedPayerName || 'Unknown'}</p>
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
            ))}
          </StaggerChildren>
        </div>
      )}
    </div>
  );
}
