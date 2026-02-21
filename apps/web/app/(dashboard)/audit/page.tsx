'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { History, User, Receipt, CreditCard, Users, TrendingDown, Building2, Filter } from 'lucide-react';
import { useAuditLogs, type AuditLogEntry } from '@/lib/queries/audit';
import { useAuthStore } from '@/lib/stores/auth';
import { formatRelativeDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';

const entityTypeIcons: Record<string, typeof Receipt> = {
  CHARGE: Receipt,
  PAYMENT: CreditCard,
  MEMBER: Users,
  EXPENSE: TrendingDown,
  ORGANIZATION: Building2,
};

const entityTypeLabels: Record<string, string> = {
  CHARGE: 'Charge',
  PAYMENT: 'Payment',
  MEMBER: 'Member',
  EXPENSE: 'Expense',
  ORGANIZATION: 'Organization',
};

const actionColors: Record<string, string> = {
  CREATE: 'bg-success/10 text-success border-success/30',
  UPDATE: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  DELETE: 'bg-destructive/10 text-destructive border-destructive/30',
};

function AuditLogCard({ log }: { log: AuditLogEntry }) {
  const Icon = entityTypeIcons[log.entityType] || Receipt;

  const renderDiff = () => {
    if (!log.diffJson) return null;

    // For CREATE actions
    if (log.action === 'CREATE' && log.diffJson.new) {
      return (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="text-success">Created</span>
          {log.diffJson.new.title && ` "${log.diffJson.new.title}"`}
          {log.diffJson.new.amountCents && ` for $${(log.diffJson.new.amountCents / 100).toFixed(2)}`}
        </div>
      );
    }

    // For DELETE actions
    if (log.action === 'DELETE' && log.diffJson.deleted) {
      return (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="text-destructive">Deleted</span>
          {log.diffJson.deleted.title && ` "${log.diffJson.deleted.title}"`}
        </div>
      );
    }

    // For UPDATE actions - show field changes
    if (log.action === 'UPDATE') {
      const changes = Object.entries(log.diffJson);
      if (changes.length === 0) return null;

      return (
        <div className="mt-2 space-y-1">
          {changes.slice(0, 3).map(([field, change]: [string, any]) => (
            <div key={field} className="text-xs">
              <span className="text-muted-foreground">{field}: </span>
              <span className="text-destructive/70 line-through">{formatValue(change.from)}</span>
              <span className="mx-1">→</span>
              <span className="text-success">{formatValue(change.to)}</span>
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
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      // Check if it looks like cents
      if (String(value).length > 2) {
        return `$${(value / 100).toFixed(2)}`;
      }
      return String(value);
    }
    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 50) + '...';
    }
    return String(value);
  };

  return (
    <StaggerItem>
      <MotionCard>
        <MotionCardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">
                  {entityTypeLabels[log.entityType] || log.entityType}
                </span>
                <Badge variant="outline" className={cn('text-xs', actionColors[log.action])}>
                  {log.action}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <AvatarGradient name={log.actor.name} size="xs" />
                <span>{log.actor.name}</span>
                <span>•</span>
                <span>{formatRelativeDate(log.createdAt)}</span>
              </div>
              {renderDiff()}
            </div>
          </div>
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
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);

  const isAdmin = currentMembership?.role === 'ADMIN' || currentMembership?.role === 'TREASURER';

  const { data, isLoading } = useAuditLogs(currentOrgId, {
    entityType: entityTypeFilter !== 'all' ? entityTypeFilter : undefined,
    limit: 100,
  });

  const logs = data?.data || [];

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
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg">
              <History className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
              <p className="text-muted-foreground mt-1">
                Track all changes made in your organization
              </p>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Filter */}
      <FadeIn delay={0.1}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
              <SelectTrigger className="w-48 bg-secondary/30 border-border/50">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="CHARGE">Charges</SelectItem>
                <SelectItem value="PAYMENT">Payments</SelectItem>
                <SelectItem value="EXPENSE">Expenses</SelectItem>
                <SelectItem value="MEMBER">Members</SelectItem>
                <SelectItem value="ORGANIZATION">Organization</SelectItem>
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
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-border/50 bg-card/50 py-16 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <History className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
            <p className="text-muted-foreground">
              Changes to charges, payments, members, and expenses will appear here.
            </p>
          </motion.div>
        </FadeIn>
      ) : (
        <StaggerChildren className="space-y-3">
          {logs.map((log) => (
            <AuditLogCard key={log.id} log={log} />
          ))}
        </StaggerChildren>
      )}
    </div>
  );
}
