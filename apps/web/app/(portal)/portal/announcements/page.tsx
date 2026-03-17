'use client';

import { Megaphone } from 'lucide-react';
import { useAnnouncements, type Announcement } from '@/lib/queries/announcements';
import { useAuthStore } from '@/lib/stores/auth';
import { formatRelativeDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { AvatarGradient } from '@/components/ui/avatar-gradient';

function getAuthorName(a: Announcement) {
  return a.createdBy?.name || a.createdBy?.user?.name || 'Unknown';
}

export default function PortalAnnouncementsPage() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data: announcements, isLoading } = useAnnouncements(orgId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold tracking-tight">Announcements</h1>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !announcements || announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements"
          description="Your organization hasn't posted any announcements yet."
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5">
                  <AvatarGradient name={getAuthorName(a)} size="sm" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm leading-tight">{a.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {getAuthorName(a)} &middot; {formatRelativeDate(a.createdAt)}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
