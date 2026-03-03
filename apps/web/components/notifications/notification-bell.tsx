'use client';

import { Bell } from 'lucide-react';
import { useUnreadCount } from '@/lib/queries/notifications';
import { useAuthStore } from '@/lib/stores/auth';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  onClick: () => void;
  collapsed?: boolean;
}

export function NotificationBell({ onClick, collapsed }: NotificationBellProps) {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data } = useUnreadCount(currentOrgId);
  const count = data?.count || 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
        collapsed && 'justify-center px-0',
      )}
      aria-label={count > 0 ? `Notifications (${count} unread)` : 'Notifications'}
    >
      <div className="relative">
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      {!collapsed && <span>Notifications</span>}
    </button>
  );
}
