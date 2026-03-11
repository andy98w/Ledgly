'use client';

import { useMemo } from 'react';
import { Receipt, CreditCard, Users, TrendingDown, Building2, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { cn, formatCents } from '@/lib/utils';

const entityTypeIcons: Record<string, typeof Receipt> = {
  CHARGE: Receipt,
  PAYMENT: CreditCard,
  MEMBER: Users,
  EXPENSE: TrendingDown,
  ORGANIZATION: Building2,
  ALLOCATION: Link2,
};

const entityDotColors: Record<string, string> = {
  CHARGE: 'bg-amber-500',
  PAYMENT: 'bg-emerald-500',
  MEMBER: 'bg-violet-500',
  EXPENSE: 'bg-rose-500',
  ORGANIZATION: 'bg-primary',
  ALLOCATION: 'bg-cyan-500',
};

const entityTypeLabels: Record<string, string> = {
  CHARGE: 'Charge',
  PAYMENT: 'Payment',
  MEMBER: 'Member',
  EXPENSE: 'Expense',
  ORGANIZATION: 'Organization',
  ALLOCATION: 'Allocation',
};

const actionBadgeColors: Record<string, string> = {
  CREATE: 'bg-success/10 text-success border-success/30',
  RESTORE: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  UPDATE: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  DELETE: 'bg-destructive/10 text-destructive border-destructive/30',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDayHeader(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr + 'T00:00:00');
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function getDisplayAction(log: any): string {
  if (log.action === 'CREATE' && log.diffJson?.new) {
    if (log.diffJson.new.restored === true || log.diffJson.new.action === 'restore') {
      return 'RESTORE';
    }
  }
  return log.action;
}

function getDetail(log: any): string {
  const d = log.diffJson;
  if (!d) return '';
  const data = d.new || d.deleted || d;
  const parts: string[] = [];
  if (data.title) parts.push(`"${data.title}"`);
  if (data.memberName) parts.push(data.memberName);
  if (data.rawPayerName) parts.push(`from ${data.rawPayerName}`);
  if (data.amountCents) parts.push(formatCents(data.amountCents));
  return parts.join(' · ');
}

export interface TimelineLog {
  id: string;
  entityType: string;
  action: string;
  createdAt: string;
  actor?: { name: string };
  diffJson?: any;
  source?: string;
  undone?: boolean;
  isBatch?: boolean;
  itemCount?: number;
  batchDescription?: string;
}

interface TimelineViewProps {
  logs: TimelineLog[];
}

export function TimelineView({ logs }: TimelineViewProps) {
  const grouped = useMemo(() => {
    const groups: { date: string; entries: TimelineLog[] }[] = [];
    for (const log of logs) {
      const dateStr = log.createdAt.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.date === dateStr) {
        last.entries.push(log);
      } else {
        groups.push({ date: dateStr, entries: [log] });
      }
    }
    return groups;
  }, [logs]);

  return (
    <div className="space-y-8">
      {grouped.map((group) => (
        <div key={group.date}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">
            {formatDayHeader(group.date)}
          </h3>
          <div className="relative pl-8">
            {/* Vertical line */}
            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border/30" />

            <div className="space-y-4">
              {group.entries.map((log) => {
                const displayAction = getDisplayAction(log);
                const detail = log.isBatch ? (log.batchDescription || `${log.itemCount} items`) : getDetail(log);
                const dotColor = entityDotColors[log.entityType] || 'bg-muted-foreground';

                return (
                  <div
                    key={log.id}
                    className={cn('relative flex gap-3', log.undone && 'opacity-50')}
                  >
                    {/* Dot */}
                    <div
                      className={cn(
                        'absolute -left-5 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-background',
                        dotColor,
                      )}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {entityTypeLabels[log.entityType] || log.entityType}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', actionBadgeColors[displayAction] || actionBadgeColors[log.action])}
                        >
                          {displayAction}
                        </Badge>
                        {log.isBatch && (
                          <Badge variant="secondary" className="text-xs">
                            {log.itemCount} items
                          </Badge>
                        )}
                        {log.undone && (
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                            Undone
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {log.actor && (
                          <>
                            <AvatarGradient name={log.actor.name} size="xs" />
                            <span>{log.actor.name}</span>
                            <span>&bull;</span>
                          </>
                        )}
                        <span>{formatTime(log.createdAt)}</span>
                      </div>

                      {detail && (
                        <p className="text-xs text-muted-foreground/80 mt-1 truncate">
                          {detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
