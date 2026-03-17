'use client';

import { Users } from 'lucide-react';
import { useMembers } from '@/lib/queries/members';
import { useAuthStore } from '@/lib/stores/auth';
import { MEMBERSHIP_ROLE_LABELS } from '@ledgly/shared';
import { formatDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { EmptyState } from '@/components/ui/empty-state';

export default function PortalMembersPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data, isLoading } = useMembers(currentOrgId, { limit: 200 });

  const members = data?.data || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </p>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members"
          description="No members found in this organization."
        />
      ) : (
        <div className="grid gap-3">
          {members.map((member: any) => {
            const displayName = member.displayName || member.name || 'Unknown';
            const roleLabel = MEMBERSHIP_ROLE_LABELS[member.role as keyof typeof MEMBERSHIP_ROLE_LABELS] || member.role;
            const roleBadgeVariant = member.role === 'OWNER'
              ? 'default' as const
              : member.role === 'ADMIN' || member.role === 'TREASURER'
                ? 'secondary' as const
                : 'outline' as const;

            return (
              <div
                key={member.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 shadow-sm"
              >
                <AvatarGradient name={displayName} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{displayName}</p>
                    <Badge variant={roleBadgeVariant} className="shrink-0 text-xs">
                      {roleLabel}
                    </Badge>
                  </div>
                  {member.joinedAt && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Joined {formatDate(member.joinedAt)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
