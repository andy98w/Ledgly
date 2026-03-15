'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Bell,
  DollarSign,
  Link2,
  Receipt,
  ShoppingCart,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useNotifications, useMarkAsRead } from '@/lib/queries/notifications';
import { useAuthStore } from '@/lib/stores/auth';
import { cn, formatRelativeDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  MotionCard,
  MotionCardHeader,
  MotionCardTitle,
  MotionCardContent,
} from '@/components/ui/motion-card';

type NotificationType =
  | 'PAYMENT_RECEIVED'
  | 'CHARGE_OVERDUE'
  | 'MEMBER_JOINED'
  | 'EXPENSE_CREATED'
  | 'CHARGE_CREATED'
  | 'SYSTEM';

interface Notification {
  id: string;
  orgId: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  linkUrl: string | null;
  createdAt: string;
}

const typeConfig: Record<
  NotificationType,
  { icon: typeof Activity; color: string; bgColor: string }
> = {
  PAYMENT_RECEIVED: {
    icon: DollarSign,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  CHARGE_OVERDUE: {
    icon: Bell,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
  },
  MEMBER_JOINED: {
    icon: UserPlus,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
  },
  EXPENSE_CREATED: {
    icon: ShoppingCart,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  CHARGE_CREATED: {
    icon: Receipt,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  SYSTEM: {
    icon: Activity,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
};

function getConfig(type: string) {
  return (
    typeConfig[type as NotificationType] ?? typeConfig.SYSTEM
  );
}

function ActivityItemSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3">
      <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

function QuickAction({
  notification,
}: {
  notification: Notification;
}) {
  const router = useRouter();

  if (notification.type === 'CHARGE_OVERDUE') {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
        onClick={(e) => {
          e.stopPropagation();
          router.push('/charges?overdue=true');
        }}
      >
        View
      </Button>
    );
  }

  if (
    notification.type === 'PAYMENT_RECEIVED' &&
    notification.body?.toLowerCase().includes('unmatched')
  ) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
        asChild
      >
        <Link href="/payments?unallocated=true">
          <Link2 className="h-3 w-3 mr-1" />
          Match
        </Link>
      </Button>
    );
  }

  if (notification.type === 'MEMBER_JOINED' && notification.body?.toLowerCase().includes('pending')) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-violet-500 hover:text-violet-600 hover:bg-violet-500/10"
        asChild
      >
        <Link href="/members?status=pending">
          <UserCheck className="h-3 w-3 mr-1" />
          Approve
        </Link>
      </Button>
    );
  }

  if (notification.linkUrl) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        asChild
      >
        <Link href={notification.linkUrl}>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </Button>
    );
  }

  return null;
}

function ActivityItem({
  notification,
  orgId,
}: {
  notification: Notification;
  orgId: string;
}) {
  const config = getConfig(notification.type);
  const Icon = config.icon;
  const markAsRead = useMarkAsRead();

  const handleClick = () => {
    if (!notification.read) {
      markAsRead.mutate({ orgId, notificationId: notification.id });
    }
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-colors duration-150 group',
        !notification.read
          ? 'bg-primary/[0.03] hover:bg-primary/[0.06]'
          : 'hover:bg-secondary/50',
      )}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div
        className={cn(
          'shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
          config.bgColor,
        )}
      >
        <Icon className={cn('h-4 w-4', config.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          {!notification.read && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1.5 translate-y-[-1px]" />
          )}
          {notification.body || notification.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeDate(notification.createdAt)}
        </p>
      </div>

      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <QuickAction notification={notification} />
      </div>
    </div>
  );
}

export function ActivityFeed() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data, isLoading } = useNotifications(currentOrgId, {
    limit: 8,
  });

  if (isLoading) {
    return (
      <MotionCard hover={false}>
        <MotionCardHeader className="flex flex-row items-center justify-between">
          <MotionCardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Activity
          </MotionCardTitle>
        </MotionCardHeader>
        <MotionCardContent className="space-y-1">
          <ActivityItemSkeleton />
          <ActivityItemSkeleton />
          <ActivityItemSkeleton />
          <ActivityItemSkeleton />
        </MotionCardContent>
      </MotionCard>
    );
  }

  const notifications = data?.data ?? [];

  return (
    <MotionCard hover={false}>
      <MotionCardHeader className="flex flex-row items-center justify-between">
        <MotionCardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Activity
          {data && data.unreadCount > 0 && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 min-w-4 justify-center">
              {data.unreadCount}
            </Badge>
          )}
        </MotionCardTitle>
        <Button variant="ghost" size="sm" asChild className="text-primary">
          <Link href="/audit">
            View all
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </MotionCardHeader>
      <MotionCardContent>
        {notifications.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet"
            description="Recent payments, charges, and member updates will appear here"
          />
        ) : (
          <div className="space-y-0.5">
            {notifications.map((n: Notification) => (
              <ActivityItem
                key={n.id}
                notification={n}
                orgId={currentOrgId!}
              />
            ))}
          </div>
        )}
      </MotionCardContent>
    </MotionCard>
  );
}
