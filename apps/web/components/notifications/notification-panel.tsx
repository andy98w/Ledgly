'use client';

import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, CreditCard, Receipt, Users, TrendingDown, AlertTriangle } from 'lucide-react';
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/lib/queries/notifications';
import { useAuthStore } from '@/lib/stores/auth';
import { formatRelativeDate, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const typeIcons: Record<string, { icon: typeof Bell; color: string }> = {
  PAYMENT_RECEIVED: { icon: CreditCard, color: 'text-emerald-500 bg-emerald-500/10' },
  CHARGE_OVERDUE: { icon: AlertTriangle, color: 'text-rose-500 bg-rose-500/10' },
  MEMBER_JOINED: { icon: Users, color: 'text-violet-500 bg-violet-500/10' },
  EXPENSE_CREATED: { icon: TrendingDown, color: 'text-amber-500 bg-amber-500/10' },
  CHARGE_CREATED: { icon: Receipt, color: 'text-blue-500 bg-blue-500/10' },
  SYSTEM: { icon: Bell, color: 'text-slate-500 bg-slate-500/10' },
};

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const router = useRouter();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data, isLoading } = useNotifications(currentOrgId);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  if (!open) return null;

  const notifications = data?.data || [];
  const unreadCount = data?.unreadCount || 0;

  const handleClick = (notification: any) => {
    if (!notification.read && currentOrgId) {
      markAsRead.mutate({ orgId: currentOrgId, notificationId: notification.id });
    }
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
      onClose();
    }
  };

  const handleMarkAllRead = () => {
    if (currentOrgId && unreadCount > 0) {
      markAllAsRead.mutate(currentOrgId);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-4 top-4 bottom-4 z-50 w-full max-w-sm animate-in slide-in-from-right-4 fade-in-0 duration-200">
        <div className="flex flex-col h-full rounded-xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-7 text-xs"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1" />
                Mark all read
              </Button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3.5 w-48" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-12 h-12 rounded-xl bg-secondary/50 flex items-center justify-center mb-3">
                  <Bell className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">No notifications</p>
                <p className="text-xs text-muted-foreground">
                  You'll see updates here when things happen
                </p>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((notification) => {
                  const typeConfig = typeIcons[notification.type] || typeIcons.SYSTEM;
                  const Icon = typeConfig.icon;
                  return (
                    <button
                      key={notification.id}
                      onClick={() => handleClick(notification)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors',
                        !notification.read && 'bg-primary/[0.03]',
                      )}
                    >
                      <div className={cn('p-2 rounded-lg shrink-0', typeConfig.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn(
                            'text-sm truncate',
                            !notification.read ? 'font-medium' : 'text-muted-foreground',
                          )}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        {notification.body && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/60 mt-1">
                          {formatRelativeDate(notification.createdAt)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
