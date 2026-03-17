'use client';

import { useState } from 'react';
import { Megaphone, Plus, Trash2, Radio } from 'lucide-react';
import { useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement, type Announcement } from '@/lib/queries/announcements';
import { useAuthStore } from '@/lib/stores/auth';
import { formatRelativeDate } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AvatarGradient } from '@/components/ui/avatar-gradient';

function getAuthorName(a: Announcement) {
  return a.createdBy?.name || a.createdBy?.user?.name || 'Unknown';
}

export default function AnnouncementsPage() {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const { data: announcements, isLoading } = useAnnouncements(orgId);
  const createAnnouncement = useCreateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const { toast } = useToast();

  const [showDialog, setShowDialog] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [broadcast, setBroadcast] = useState(false);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setBroadcast(false);
  };

  const handleCreate = () => {
    if (!orgId || !title.trim() || !body.trim()) return;
    createAnnouncement.mutate(
      { orgId, data: { title: title.trim(), body: body.trim(), broadcast } },
      {
        onSuccess: () => {
          toast({ title: 'Announcement posted' });
          setShowDialog(false);
          resetForm();
        },
        onError: (err: any) => {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  const handleDelete = (id: string) => {
    if (!orgId) return;
    deleteAnnouncement.mutate(
      { orgId, id },
      {
        onSuccess: () => toast({ title: 'Announcement deleted' }),
        onError: (err: any) => {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        helpText="Post org-wide messages for all members to read."
        actions={
          <Button onClick={() => setShowDialog(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Announcement
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !announcements || announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Post your first announcement to share news with your organization."
          action={
            <Button onClick={() => setShowDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Announcement
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleDelete(a.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {a.body}
              </p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Announcement</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="ann-title">Title</Label>
                <Input
                  id="ann-title"
                  placeholder="e.g., Spring social this Friday"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-body">Body</Label>
                <Textarea
                  id="ann-body"
                  placeholder="Write the full announcement..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={5000}
                  rows={5}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <Radio className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Broadcast to chat channels</p>
                    <p className="text-xs text-muted-foreground">Send to GroupMe, Discord, Slack</p>
                  </div>
                </div>
                <Switch checked={broadcast} onCheckedChange={setBroadcast} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || !body.trim() || createAnnouncement.isPending}>
                {createAnnouncement.isPending ? 'Posting...' : 'Post Announcement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
