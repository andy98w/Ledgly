'use client';

import { useState } from 'react';
import { History, Receipt, CreditCard, Users, TrendingDown, Building2, Link2, Filter, Undo2, Redo2, Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useAuditLogs, useUndoAuditLog, useUndoBatch, useRedoAuditLog, useRedoBatch, type AuditLogEntry, type BatchedAuditLogEntry, type AuditLogItem } from '@/lib/queries/audit';
import { useAuthStore, useIsAdminOrTreasurer } from '@/lib/stores/auth';
import { formatRelativeDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MotionCard, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { useToast } from '@/components/ui/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

const entityTypeIcons: Record<string, typeof Receipt> = {
  CHARGE: Receipt,
  PAYMENT: CreditCard,
  MEMBER: Users,
  EXPENSE: TrendingDown,
  ORGANIZATION: Building2,
  ALLOCATION: Link2,
};

const entityTypeColors: Record<string, { bg: string; text: string }> = {
  CHARGE: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
  PAYMENT: { bg: 'bg-emerald-500/10', text: 'text-emerald-500' },
  MEMBER: { bg: 'bg-violet-500/10', text: 'text-violet-500' },
  EXPENSE: { bg: 'bg-rose-500/10', text: 'text-rose-500' },
  ORGANIZATION: { bg: 'bg-primary/10', text: 'text-primary' },
  ALLOCATION: { bg: 'bg-cyan-500/10', text: 'text-cyan-500' },
};

const entityTypeLabels: Record<string, string> = {
  CHARGE: 'Charge',
  PAYMENT: 'Payment',
  MEMBER: 'Member',
  EXPENSE: 'Expense',
  ORGANIZATION: 'Organization',
  ALLOCATION: 'Allocation',
};

const actionColors: Record<string, string> = {
  CREATE: 'bg-success/10 text-success border-success/30',
  RESTORE: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  UPDATE: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  DELETE: 'bg-destructive/10 text-destructive border-destructive/30',
};

/** Detect if a CREATE audit entry is actually a restore (undo of a delete) */
function getDisplayAction(log: AuditLogEntry): string {
  if (log.action === 'CREATE' && log.diffJson?.new) {
    if (log.diffJson.new.restored === true || log.diffJson.new.action === 'restore') {
      return 'RESTORE';
    }
  }
  return log.action;
}

const formatValue = (value: any, field?: string): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (field && /[Cc]ents$/.test(field)) {
      return `$${(value / 100).toFixed(2)}`;
    }
    return String(value);
  }
  if (typeof value === 'string' && value.length > 50) {
    return value.substring(0, 50) + '...';
  }
  return String(value);
};

/** Build a detail string from entity-specific diffJson data */
function buildEntityDetail(data: Record<string, any>, entityType: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];

  // Title (charges, expenses)
  if (data.title) {
    parts.push(<span key="title" className="font-medium text-foreground/80">"{data.title}"</span>);
  }

  // Payer name (payments)
  if (data.rawPayerName) {
    parts.push(<span key="payer" className="font-medium text-foreground/80">from {data.rawPayerName}</span>);
  }

  // Member name (charges, members)
  if (data.memberName) {
    parts.push(<span key="member" className="text-foreground/70">{data.memberName}</span>);
  }

  // Role (members)
  if (data.role) {
    parts.push(<span key="role" className="text-foreground/60">({data.role.toLowerCase()})</span>);
  }

  // Amount
  if (data.amountCents) {
    parts.push(<span key="amount" className="text-foreground/70">${(data.amountCents / 100).toFixed(2)}</span>);
  }

  // Category (charges, expenses)
  if (data.category) {
    parts.push(<span key="cat" className="text-foreground/50">[{data.category}]</span>);
  }

  // Vendor (expenses)
  if (data.vendor) {
    parts.push(<span key="vendor" className="text-foreground/50">{data.vendor}</span>);
  }

  // Memo (payments)
  if (data.memo) {
    parts.push(<span key="memo" className="text-foreground/50 italic">"{data.memo}"</span>);
  }

  // Charge title (allocations)
  if (data.chargeTitle && entityType === 'ALLOCATION') {
    parts.push(<span key="charge" className="font-medium text-foreground/80">→ "{data.chargeTitle}"</span>);
  }

  // Auto-allocated flag
  if (data.autoAllocated) {
    parts.push(<span key="auto" className="text-foreground/50">(auto)</span>);
  }

  return parts;
}

function renderDiff(log: AuditLogEntry) {
  if (!log.diffJson) return null;

  const displayAction = getDisplayAction(log);

  if (log.action === 'CREATE' && log.diffJson.new) {
    const isRestore = displayAction === 'RESTORE';
    const parts = buildEntityDetail(log.diffJson.new, log.entityType);

    if (parts.length === 0) return null;

    return (
      <div className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-1">
        <span className={isRestore ? 'text-purple-400' : 'text-success'}>
          {isRestore ? 'Restored' : 'Created'}
        </span>
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/50">&middot;</span>}
            {part}
          </span>
        ))}
      </div>
    );
  }

  if (log.action === 'DELETE' && log.diffJson.deleted) {
    const parts = buildEntityDetail(log.diffJson.deleted, log.entityType);

    if (parts.length === 0) return null;

    return (
      <div className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-1">
        <span className="text-destructive">Deleted</span>
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/50">&middot;</span>}
            {part}
          </span>
        ))}
      </div>
    );
  }

  if (log.action === 'UPDATE') {
    const changes = Object.entries(log.diffJson);
    if (changes.length === 0) return null;

    return (
      <div className="mt-2 space-y-1">
        {changes.slice(0, 3).map(([field, change]: [string, any]) => (
          <div key={field} className="text-xs">
            <span className="text-muted-foreground">{field}: </span>
            <span className="text-destructive/70 line-through">{formatValue(change.from, field)}</span>
            <span className="mx-1">&rarr;</span>
            <span className="text-success">{formatValue(change.to, field)}</span>
          </div>
        ))}
        {changes.length > 3 && (
          <div className="text-xs text-muted-foreground">
            +{changes.length - 3} more changes
          </div>
        )}
      </div>
    );
  }

  return null;
}

function UndoRedoButton({
  log,
  onUndo,
  onRedo,
  isProcessing,
}: {
  log: AuditLogEntry;
  onUndo: (logId: string) => void;
  onRedo: (logId: string) => void;
  isProcessing: boolean;
}) {
  const isUndoable = (log.action === 'CREATE' || log.action === 'DELETE') &&
    (log.entityType === 'CHARGE' || log.entityType === 'EXPENSE' || log.entityType === 'PAYMENT' || log.entityType === 'MEMBER' || log.entityType === 'ALLOCATION');

  if (!isUndoable) return null;

  if (isProcessing) {
    return (
      <Button variant="ghost" size="sm" disabled className="shrink-0">
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  if (log.undone) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRedo(log.id)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <Redo2 className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUndo(log.id)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AuditLogCard({
  log,
  onUndo,
  onRedo,
  processingId,
}: {
  log: AuditLogEntry;
  onUndo: (logId: string) => void;
  onRedo: (logId: string) => void;
  processingId: string | null;
}) {
  const Icon = entityTypeIcons[log.entityType] || Receipt;
  const colors = entityTypeColors[log.entityType];
  const displayAction = getDisplayAction(log);

  return (
    <StaggerItem>
      <MotionCard className={log.undone ? 'opacity-50' : ''}>
        <MotionCardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', colors?.bg || 'bg-secondary')}>
              <Icon className={cn('w-5 h-5', colors?.text || 'text-muted-foreground')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">
                  {entityTypeLabels[log.entityType] || log.entityType}
                </span>
                <Badge variant="outline" className={cn('text-xs', actionColors[displayAction] || actionColors[log.action])}>
                  {displayAction}
                </Badge>
                {(log.diffJson?.new?.source === 'gmail_auto_import' || log.diffJson?.new?.source === 'auto_confirm') && (
                  <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-500 border-cyan-500/30">
                    Auto-Import
                  </Badge>
                )}
                {log.undone && (
                  <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                    Undone
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {log.actor && (
                  <>
                    <AvatarGradient name={log.actor.name} size="xs" />
                    <span>{log.actor.name}</span>
                    <span>&bull;</span>
                  </>
                )}
                <span>{formatRelativeDate(log.createdAt)}</span>
              </div>
              {renderDiff(log)}
            </div>
            <UndoRedoButton
              log={log}
              onUndo={onUndo}
              onRedo={onRedo}
              isProcessing={processingId === log.id}
            />
          </div>
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
}

function BatchAuditLogCard({
  batch,
  onUndo,
  onRedo,
  onUndoBatch,
  onRedoBatch,
  processingId,
}: {
  batch: BatchedAuditLogEntry;
  onUndo: (logId: string) => void;
  onRedo: (logId: string) => void;
  onUndoBatch: (batchId: string) => void;
  onRedoBatch: (batchId: string) => void;
  processingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = entityTypeIcons[batch.entityType] || Receipt;
  const colors = entityTypeColors[batch.entityType];
  const items = batch.items || [];
  const allUndone = batch.undone;
  const someUndone = items.some((i) => i.undone);

  // Detect if the batch is a restore by checking the first item
  const firstItem = items[0];
  const batchDisplayAction = firstItem ? getDisplayAction(firstItem) : batch.action;

  const isUndoable = (batch.action === 'CREATE' || batch.action === 'DELETE') &&
    (batch.entityType === 'CHARGE' || batch.entityType === 'EXPENSE' || batch.entityType === 'PAYMENT' || batch.entityType === 'MEMBER' || batch.entityType === 'ALLOCATION');

  const isBatchProcessing = processingId === batch.id;

  return (
    <StaggerItem>
      <MotionCard className={allUndone ? 'opacity-50' : ''}>
        <MotionCardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', colors?.bg || 'bg-secondary')}>
              <Icon className={cn('w-5 h-5', colors?.text || 'text-muted-foreground')} />
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-1 min-w-0 text-left"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">
                  {entityTypeLabels[batch.entityType] || batch.entityType}
                </span>
                <Badge variant="outline" className={cn('text-xs', actionColors[batchDisplayAction] || actionColors[batch.action])}>
                  {batchDisplayAction}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {batch.itemCount} {(entityTypeLabels[batch.entityType] || batch.entityType).toLowerCase()}{batch.itemCount !== 1 ? 's' : ''}
                </Badge>
                {batch.batchDescription?.includes('auto-import') && (
                  <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-500 border-cyan-500/30">
                    Auto-Import
                  </Badge>
                )}
                {allUndone && (
                  <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                    Undone
                  </Badge>
                )}
                {!allUndone && someUndone && (
                  <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                    Partially undone
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {batch.actor && (
                  <>
                    <AvatarGradient name={batch.actor.name} size="xs" />
                    <span>{batch.actor.name}</span>
                    <span>&bull;</span>
                  </>
                )}
                <span>{formatRelativeDate(batch.createdAt)}</span>
                {batch.batchDescription && (
                  <>
                    <span>&bull;</span>
                    <span>{batch.batchDescription}</span>
                  </>
                )}
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              {isUndoable && (
                isBatchProcessing ? (
                  <Button variant="ghost" size="sm" disabled>
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </Button>
                ) : allUndone ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRedoBatch(batch.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Redo2 className="w-4 h-4 mr-1" />
                          <span className="text-xs">All</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Redo all {batch.itemCount} items</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onUndoBatch(batch.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Undo2 className="w-4 h-4 mr-1" />
                          <span className="text-xs">All</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Undo all {batch.itemCount} items</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                aria-expanded={expanded}
                aria-label={expanded ? 'Collapse batch details' : 'Expand batch details'}
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {expanded && items.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
              {items.map((item) => {
                const memberName = item.diffJson?.new?.memberName || item.diffJson?.deleted?.memberName;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg bg-secondary/20',
                      item.undone && 'opacity-50',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {memberName && (
                          <span className="text-sm font-medium">{memberName}</span>
                        )}
                        {item.undone && (
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                            Undone
                          </Badge>
                        )}
                      </div>
                      {renderDiff(item)}
                    </div>
                    <UndoRedoButton
                      log={item}
                      onUndo={onUndo}
                      onRedo={onRedo}
                      isProcessing={processingId === item.id}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
}

function AuditLogSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { toast } = useToast();
  const isAdmin = useIsAdminOrTreasurer();

  const { data, isLoading } = useAuditLogs(currentOrgId, {
    entityType: entityTypeFilter !== 'all' ? entityTypeFilter : undefined,
    limit: 100,
  });

  const undoMutation = useUndoAuditLog();
  const undoBatchMutation = useUndoBatch();
  const redoMutation = useRedoAuditLog();
  const redoBatchMutation = useRedoBatch();

  const allLogs = data?.data || [];

  // Filter by search query
  const logs = allLogs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const actorName = log.actor?.name?.toLowerCase() || '';
    const entityType = log.entityType?.toLowerCase() || '';
    const action = log.action?.toLowerCase() || '';
    const description = ('batchDescription' in log ? (log as any).batchDescription : '')?.toLowerCase() || '';
    const diffStr = 'diffJson' in log && log.diffJson ? JSON.stringify(log.diffJson).toLowerCase() : '';
    return actorName.includes(query) || entityType.includes(query) || action.includes(query) || description.includes(query) || diffStr.includes(query);
  });

  const totalPages = Math.ceil(logs.length / pageSize);
  const paginatedLogs = logs.slice((page - 1) * pageSize, page * pageSize);

  // Reset page when filter changes
  const handleFilterChange = (value: string) => {
    setEntityTypeFilter(value);
    setPage(1);
  };

  const handleUndo = async (logId: string) => {
    if (!currentOrgId) return;
    setProcessingId(logId);
    try {
      await undoMutation.mutateAsync({ orgId: currentOrgId, logId });
      toast({ title: 'Action undone', description: 'The action has been reversed.' });
    } catch (error: any) {
      toast({ title: 'Failed to undo', description: error?.message || 'Could not undo this action.', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRedo = async (logId: string) => {
    if (!currentOrgId) return;
    setProcessingId(logId);
    try {
      await redoMutation.mutateAsync({ orgId: currentOrgId, logId });
      toast({ title: 'Action redone', description: 'The action has been restored.' });
    } catch (error: any) {
      toast({ title: 'Failed to redo', description: error?.message || 'Could not redo this action.', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleUndoBatch = async (batchId: string) => {
    if (!currentOrgId) return;
    setProcessingId(batchId);
    try {
      await undoBatchMutation.mutateAsync({ orgId: currentOrgId, batchId });
      toast({ title: 'Batch undone', description: 'All actions in this batch have been reversed.' });
    } catch (error: any) {
      toast({ title: 'Failed to undo batch', description: error?.message || 'Could not undo this batch.', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRedoBatch = async (batchId: string) => {
    if (!currentOrgId) return;
    setProcessingId(batchId);
    try {
      await redoBatchMutation.mutateAsync({ orgId: currentOrgId, batchId });
      toast({ title: 'Batch redone', description: 'All actions in this batch have been restored.' });
    } catch (error: any) {
      toast({ title: 'Failed to redo batch', description: error?.message || 'Could not redo this batch.', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <History className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
        <p className="text-muted-foreground">
          Only admins and treasurers can view the audit log.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-tour="audit-list">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Audit Log"
          helpText="Track all changes made in your organization. You can undo and redo actions directly from here."
        />
      </FadeIn>

      {/* Search + Filter */}
      <FadeIn delay={0.1}>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search audit logs..."
              aria-label="Search audit logs"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-9 h-9 bg-secondary/30 border-border/50"
            />
          </div>
          <div className="flex gap-2">
            <Select value={entityTypeFilter} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-[130px] h-8 bg-secondary/30 border-border/50 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="CHARGE">Charges</SelectItem>
                <SelectItem value="PAYMENT">Payments</SelectItem>
                <SelectItem value="EXPENSE">Expenses</SelectItem>
                <SelectItem value="MEMBER">Members</SelectItem>
                <SelectItem value="ORGANIZATION">Organization</SelectItem>
                <SelectItem value="ALLOCATION">Allocations</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FadeIn>

      {/* Audit Log List */}
      {isLoading ? (
        <div className="space-y-3">
          <AuditLogSkeleton />
          <AuditLogSkeleton />
          <AuditLogSkeleton />
          <AuditLogSkeleton />
        </div>
      ) : logs.length === 0 ? (
        <FadeIn delay={0.2}>
          <EmptyState
            icon={History}
            title="No activity found"
            description="Try adjusting your filters or search."
            className="rounded-xl border border-border/50 bg-card/50"
          />
        </FadeIn>
      ) : (
        <>
          <StaggerChildren className="space-y-3">
            {paginatedLogs.map((log) => {
              const isBatch = 'isBatch' in log && log.isBatch;

              if (isBatch) {
                return (
                  <BatchAuditLogCard
                    key={log.id}
                    batch={log as BatchedAuditLogEntry}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onUndoBatch={handleUndoBatch}
                    onRedoBatch={handleRedoBatch}
                    processingId={processingId}
                  />
                );
              }

              return (
                <AuditLogCard
                  key={log.id}
                  log={log as AuditLogEntry}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  processingId={processingId}
                />
              );
            })}
          </StaggerChildren>

          {/* Pagination Controls - Bottom */}
          {logs.length > pageSize && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="justify-center pt-4" />
          )}
        </>
      )}
    </div>
  );
}
