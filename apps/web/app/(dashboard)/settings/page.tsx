'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor, User, Building2, Shield, Loader2, Camera, Plus, AlertTriangle, Mail, GraduationCap, KeyRound, Eye, EyeOff, Link2, Copy, Check, RefreshCw, ArrowRightLeft, Banknote, Bell, Trash2, Landmark, Wrench, MessageSquare, Send, ExternalLink, ChevronDown } from 'lucide-react';
import { useAuthStore, useIsOwner } from '@/lib/stores/auth';
import { useUpdateProfile, useChangePassword } from '@/lib/queries/auth';
import { useCreateOrganization, useDeleteOrganization, useOrganization, useUpdateOrganization, useGenerateJoinCode, useDisableJoinCode, useUpdateJoinCodeSettings } from '@/lib/queries/organizations';
import { useMembers, useTransferOwnership } from '@/lib/queries/members';
import { useReminderRules, useCreateReminderRule, useDeleteReminderRule } from '@/lib/queries/reminders';
import { useGmailStatus, useDisconnectGmail, getGmailConnectUrl } from '@/lib/queries/gmail';
import { usePlaidStatus, usePlaidConnections, useCreatePlaidLinkToken, useCreatePlaidUpdateLinkToken, useExchangePlaidToken, usePlaidSync, useDisconnectPlaid } from '@/lib/queries/plaid';
import { useGroupMeConnections, useConnectGroupMe, useDisconnectGroupMe, useTestGroupMe } from '@/lib/queries/groupme';
import { useDiscordConnections, useConnectDiscord, useDisconnectDiscord, useTestDiscord } from '@/lib/queries/discord';
import { useSlackConnections, useConnectSlack, useDisconnectSlack, useTestSlack } from '@/lib/queries/slack';
import { uploadAvatar } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { FadeIn } from '@/components/ui/page-transition';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function GmailSyncSection({ orgId }: { orgId: string | null }) {
  const { data: gmailStatus } = useGmailStatus(orgId);
  const disconnectGmail = useDisconnectGmail();
  const { data: org } = useOrganization(orgId);
  const updateOrg = useUpdateOrganization(orgId);
  const { toast } = useToast();

  const handleDisconnect = async (connectionId: string) => {
    if (!orgId) return;
    try {
      await disconnectGmail.mutateAsync({ orgId, connectionId });
      toast({ title: 'Gmail disconnected' });
    } catch {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  const syncAfterValue = org?.gmailSyncAfter
    ? new Date(org.gmailSyncAfter).toISOString().split('T')[0]
    : '';

  const handleSyncDateChange = async (dateStr: string) => {
    if (!orgId) return;
    try {
      await updateOrg.mutateAsync({ gmailSyncAfter: new Date(dateStr).toISOString() });
      toast({ title: 'Sync date updated' });
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const connections = gmailStatus?.connections ?? [];
  const hasConnections = gmailStatus?.connected;

  return (
    <div className="space-y-4">
      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{conn.email}</p>
                <p className="text-xs text-muted-foreground">
                  {conn.lastSyncAt
                    ? `Last synced ${new Date(conn.lastSyncAt).toLocaleDateString()}`
                    : 'Connected, waiting for first sync'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDisconnect(conn.id)}
                disabled={disconnectGmail.isPending}
                className="text-destructive hover:text-destructive"
              >
                {disconnectGmail.isPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {orgId && (
        <Button
          variant={hasConnections ? 'outline' : 'default'}
          onClick={() => { window.location.href = getGmailConnectUrl(orgId, '/settings'); }}
        >
          <Mail className="w-4 h-4 mr-2" />
          {hasConnections ? 'Add another Gmail' : 'Connect Gmail'}
        </Button>
      )}

      {!hasConnections && (
        <p className="text-sm text-muted-foreground">
          Connect Gmail to automatically import payment notifications from Venmo, Zelle, Cash App, and PayPal.
        </p>
      )}

      {hasConnections && (
        <div className="space-y-3">
          <Label className="text-sm">Sync emails after</Label>
          <div>
            <DatePicker
              value={syncAfterValue}
              onChange={handleSyncDateChange}
              placeholder="Select start date"
              className="w-52"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Only import payment emails sent after this date. Leave blank for the last 30 days.
          </p>
        </div>
      )}
    </div>
  );
}

function BankConnectionsSection({ orgId }: { orgId: string | null }) {
  const { data: plaidStatus } = usePlaidStatus(orgId);
  const { data: plaidData } = usePlaidConnections(orgId);
  const { data: org } = useOrganization(orgId);
  const updateOrg = useUpdateOrganization(orgId);
  const createLinkToken = useCreatePlaidLinkToken();
  const createUpdateLinkToken = useCreatePlaidUpdateLinkToken();
  const exchangeToken = useExchangePlaidToken();
  const syncPlaid = usePlaidSync();
  const disconnectPlaid = useDisconnectPlaid();
  const { toast } = useToast();
  const [plaidReady, setPlaidReady] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isUpdateMode, setIsUpdateMode] = useState(false);

  const connections = plaidData?.connections ?? [];

  const handleConnect = async () => {
    if (!orgId) return;
    try {
      const result = await createLinkToken.mutateAsync({ orgId });
      setIsUpdateMode(false);
      setLinkToken(result.linkToken);
    } catch {
      toast({ title: 'Failed to initialize bank connection', variant: 'destructive' });
    }
  };

  const handleFixConnection = async (connectionId: string) => {
    if (!orgId) return;
    try {
      const result = await createUpdateLinkToken.mutateAsync({ orgId, connectionId });
      setIsUpdateMode(true);
      setLinkToken(result.linkToken);
    } catch {
      toast({ title: 'Failed to initialize connection repair', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (!linkToken) return;

    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.onload = () => setPlaidReady(true);
    if (document.querySelector('script[src*="plaid.com/link"]')) {
      setPlaidReady(true);
      return;
    }
    document.head.appendChild(script);
  }, [linkToken]);

  useEffect(() => {
    if (!linkToken || !plaidReady || !(window as any).Plaid) return;

    const handler = (window as any).Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken: string) => {
        if (isUpdateMode) {
          toast({ title: 'Connection updated' });
        } else if (orgId) {
          try {
            await exchangeToken.mutateAsync({ orgId, publicToken });
            toast({ title: 'Bank account connected' });
          } catch {
            toast({ title: 'Failed to connect bank', variant: 'destructive' });
          }
        }
        setLinkToken(null);
        setIsUpdateMode(false);
      },
      onExit: () => {
        setLinkToken(null);
        setIsUpdateMode(false);
      },
    });

    handler.open();

    return () => handler.destroy();
  }, [linkToken, plaidReady]);

  if (!plaidStatus?.configured) return null;

  const handleDisconnect = async (connectionId: string) => {
    if (!orgId) return;
    try {
      await disconnectPlaid.mutateAsync({ orgId, connectionId });
      toast({ title: 'Bank disconnected' });
    } catch {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  const handleSync = async () => {
    if (!orgId) return;
    try {
      const result = await syncPlaid.mutateAsync({ orgId });
      toast({ title: `Synced: ${result.imported} imported, ${result.skipped} skipped` });
    } catch {
      toast({ title: 'Sync failed', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {conn.institutionName || 'Bank Account'}
                  {conn.accountMask && (
                    <span className="text-muted-foreground ml-1">
                      ****{conn.accountMask}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {conn.accountName && `${conn.accountName} · `}
                  {conn.lastSyncAt
                    ? `Last synced ${new Date(conn.lastSyncAt).toLocaleDateString()}`
                    : 'Connected, waiting for first sync'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFixConnection(conn.id)}
                  disabled={createUpdateLinkToken.isPending}
                >
                  {createUpdateLinkToken.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Wrench className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Fix
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDisconnect(conn.id)}
                  disabled={disconnectPlaid.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {disconnectPlaid.isPending ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant={connections.length > 0 ? 'outline' : 'default'}
          onClick={handleConnect}
          disabled={createLinkToken.isPending}
        >
          {createLinkToken.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Landmark className="w-4 h-4 mr-2" />
          )}
          {connections.length > 0 ? 'Add Another Bank' : 'Connect Bank'}
        </Button>

        {connections.length > 0 && (
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncPlaid.isPending}
          >
            {syncPlaid.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync Now
          </Button>
        )}
      </div>

      {connections.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm">Sync transactions after</Label>
          <div>
            <DatePicker
              value={org?.gmailSyncAfter ? new Date(org.gmailSyncAfter).toISOString().split('T')[0] : ''}
              onChange={async (dateStr) => {
                if (!orgId) return;
                try {
                  await updateOrg.mutateAsync({ gmailSyncAfter: new Date(dateStr).toISOString() });
                  toast({ title: 'Sync date updated' });
                } catch {
                  toast({ title: 'Failed to update', variant: 'destructive' });
                }
              }}
              placeholder="Select start date"
              className="w-52"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Only import transactions after this date. Applies to both Gmail and bank sync.
          </p>
        </div>
      )}

      {connections.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Connect your bank to automatically import P2P transactions from Venmo, Zelle, Cash App, and PayPal.
        </p>
      )}
    </div>
  );
}

function GroupMeSection({ orgId }: { orgId: string | null }) {
  const { data: groupmeData } = useGroupMeConnections(orgId);
  const connectGroupMe = useConnectGroupMe();
  const disconnectGroupMe = useDisconnectGroupMe();
  const testGroupMe = useTestGroupMe();
  const { toast } = useToast();
  const [botId, setBotId] = useState('');
  const [groupName, setGroupName] = useState('');

  const connections = groupmeData?.connections ?? [];

  const handleConnect = async () => {
    if (!orgId || !botId.trim()) {
      toast({ title: 'Please enter a Bot ID', variant: 'destructive' });
      return;
    }
    try {
      await connectGroupMe.mutateAsync({ orgId, botId: botId.trim(), groupName: groupName.trim() || undefined });
      toast({ title: 'GroupMe bot connected' });
      setBotId('');
      setGroupName('');
    } catch {
      toast({ title: 'Failed to connect', variant: 'destructive' });
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!orgId) return;
    try {
      await disconnectGroupMe.mutateAsync({ orgId, connectionId });
      toast({ title: 'GroupMe bot disconnected' });
    } catch {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  const handleTest = async () => {
    if (!orgId) return;
    try {
      await testGroupMe.mutateAsync({ orgId });
      toast({ title: 'Test message sent to GroupMe' });
    } catch {
      toast({ title: 'Failed to send test message', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{conn.groupName || 'GroupMe Bot'}</p>
                <p className="text-xs text-muted-foreground font-mono">{conn.botId}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDisconnect(conn.id)}
                disabled={disconnectGroupMe.isPending}
                className="text-destructive hover:text-destructive"
              >
                {disconnectGroupMe.isPending ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-sm">Bot ID</Label>
          <Input
            value={botId}
            onChange={(e) => setBotId(e.target.value)}
            placeholder="Paste your GroupMe Bot ID"
            className="bg-secondary/30 border-border/50 focus:border-primary font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Group Name (optional)</Label>
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g., Chapter Main Chat"
            className="bg-secondary/30 border-border/50 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleConnect}
            disabled={connectGroupMe.isPending || !botId.trim()}
          >
            {connectGroupMe.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Connect
          </Button>
          {connections.length > 0 && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testGroupMe.isPending}
            >
              {testGroupMe.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Test Message
            </Button>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground space-y-1">
        <p>
          <a
            href="https://dev.groupme.com/bots"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Create a bot at dev.groupme.com/bots
            <ExternalLink className="w-3 h-3" />
          </a>
          {' '}and paste the Bot ID above.
        </p>
        <p>Payment notifications, reminders, and weekly summaries will be posted to your group.</p>
      </div>
    </div>
  );
}

function DiscordSection({ orgId }: { orgId: string | null }) {
  const { data: discordData } = useDiscordConnections(orgId);
  const connectDiscord = useConnectDiscord();
  const disconnectDiscord = useDisconnectDiscord();
  const testDiscord = useTestDiscord();
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('');

  const connections = discordData?.connections ?? [];

  const handleConnect = async () => {
    if (!orgId || !webhookUrl.trim()) {
      toast({ title: 'Please enter a webhook URL', variant: 'destructive' });
      return;
    }
    try {
      await connectDiscord.mutateAsync({ orgId, webhookUrl: webhookUrl.trim(), channelName: channelName.trim() || undefined });
      toast({ title: 'Discord webhook connected' });
      setWebhookUrl('');
      setChannelName('');
    } catch {
      toast({ title: 'Failed to connect', variant: 'destructive' });
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!orgId) return;
    try {
      await disconnectDiscord.mutateAsync({ orgId, connectionId });
      toast({ title: 'Discord webhook disconnected' });
    } catch {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  const handleTest = async () => {
    if (!orgId) return;
    try {
      await testDiscord.mutateAsync({ orgId });
      toast({ title: 'Test message sent to Discord' });
    } catch {
      toast({ title: 'Failed to send test message', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{conn.channelName || 'Discord Webhook'}</p>
                <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{conn.webhookUrl}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDisconnect(conn.id)}
                disabled={disconnectDiscord.isPending}
                className="text-destructive hover:text-destructive"
              >
                {disconnectDiscord.isPending ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-sm">Webhook URL</Label>
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="bg-secondary/30 border-border/50 focus:border-primary font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Channel Name (optional)</Label>
          <Input
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="e.g., #treasury"
            className="bg-secondary/30 border-border/50 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleConnect}
            disabled={connectDiscord.isPending || !webhookUrl.trim()}
          >
            {connectDiscord.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Connect
          </Button>
          {connections.length > 0 && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testDiscord.isPending}
            >
              {testDiscord.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Test Message
            </Button>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground space-y-1">
        <p>Create a webhook in your Discord channel settings and paste the URL above.</p>
        <p>Payment notifications, reminders, and weekly summaries will be posted to your channel.</p>
      </div>
    </div>
  );
}

function SlackSection({ orgId }: { orgId: string | null }) {
  const { data: slackData } = useSlackConnections(orgId);
  const connectSlack = useConnectSlack();
  const disconnectSlack = useDisconnectSlack();
  const testSlack = useTestSlack();
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('');

  const connections = slackData?.connections ?? [];

  const handleConnect = async () => {
    if (!orgId || !webhookUrl.trim()) {
      toast({ title: 'Please enter a webhook URL', variant: 'destructive' });
      return;
    }
    try {
      await connectSlack.mutateAsync({ orgId, webhookUrl: webhookUrl.trim(), channelName: channelName.trim() || undefined });
      toast({ title: 'Slack webhook connected' });
      setWebhookUrl('');
      setChannelName('');
    } catch {
      toast({ title: 'Failed to connect', variant: 'destructive' });
    }
  };

  const handleDisconnect = async (connectionId: string) => {
    if (!orgId) return;
    try {
      await disconnectSlack.mutateAsync({ orgId, connectionId });
      toast({ title: 'Slack webhook disconnected' });
    } catch {
      toast({ title: 'Failed to disconnect', variant: 'destructive' });
    }
  };

  const handleTest = async () => {
    if (!orgId) return;
    try {
      await testSlack.mutateAsync({ orgId });
      toast({ title: 'Test message sent to Slack' });
    } catch {
      toast({ title: 'Failed to send test message', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {connections.length > 0 && (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{conn.channelName || 'Slack Webhook'}</p>
                <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{conn.webhookUrl}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDisconnect(conn.id)}
                disabled={disconnectSlack.isPending}
                className="text-destructive hover:text-destructive"
              >
                {disconnectSlack.isPending ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-sm">Webhook URL</Label>
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="bg-secondary/30 border-border/50 focus:border-primary font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Channel Name (optional)</Label>
          <Input
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="e.g., #treasury"
            className="bg-secondary/30 border-border/50 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleConnect}
            disabled={connectSlack.isPending || !webhookUrl.trim()}
          >
            {connectSlack.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Connect
          </Button>
          {connections.length > 0 && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testSlack.isPending}
            >
              {testSlack.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Test Message
            </Button>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground space-y-1">
        <p>Create an incoming webhook in your Slack workspace settings and paste the URL above.</p>
        <p>Payment notifications, reminders, and weekly summaries will be posted to your channel.</p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const user = useAuthStore((s) => s.user);
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const currentOrg = user?.memberships.find((m) => m.orgId === currentOrgId);
  const updateProfile = useUpdateProfile();
  const createOrganization = useCreateOrganization();
  const deleteOrganization = useDeleteOrganization();
  const { data: orgDetails } = useOrganization(currentOrgId ?? null);
  const updateOrganization = useUpdateOrganization(currentOrgId ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const changePassword = useChangePassword();

  const [name, setName] = useState(user?.name || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [showDeleteOrgDialog, setShowDeleteOrgDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);
  const [transferConfirmText, setTransferConfirmText] = useState('');
  const [paymentInstructions, setPaymentInstructions] = useState(orgDetails?.paymentInstructions || '');
  const [paymentHandles, setPaymentHandles] = useState<Record<string, string>>(orgDetails?.paymentHandles || {});
  const [newRuleTrigger, setNewRuleTrigger] = useState('BEFORE_DUE');
  const [newRuleDays, setNewRuleDays] = useState('3');
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['organization', 'profile', 'integrations', 'danger']));

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const generateJoinCode = useGenerateJoinCode(currentOrgId ?? null);
  const disableJoinCode = useDisableJoinCode(currentOrgId ?? null);
  const updateJoinCodeSettings = useUpdateJoinCodeSettings(currentOrgId ?? null);
  const isOwner = useIsOwner();
  const transferOwnership = useTransferOwnership();
  const { data: membersData } = useMembers(isOwner ? currentOrgId : null);
  const isAdminRole = currentOrg?.role === 'OWNER' || currentOrg?.role === 'ADMIN';
  const { data: reminderRules } = useReminderRules(isAdminRole ? currentOrgId ?? null : null);
  const createReminderRule = useCreateReminderRule();
  const deleteReminderRule = useDeleteReminderRule();

  const hasChanges = name !== (user?.name || '');

  const handleTransferOwnership = () => {
    if (!currentOrgId || !transferTargetId) return;
    transferOwnership.mutate(
      { orgId: currentOrgId, memberId: transferTargetId },
      {
        onSuccess: () => {
          toast({ title: 'Ownership transferred' });
          setShowTransferDialog(false);
          setTransferTargetId(null);
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to transfer ownership',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleCreateOrg = () => {
    if (!newOrgName.trim()) {
      toast({ title: 'Please enter an organization name', variant: 'destructive' });
      return;
    }
    createOrganization.mutate(
      { name: newOrgName.trim() },
      {
        onSuccess: (org) => {
          toast({ title: 'Organization created!' });
          setShowCreateOrgDialog(false);
          setNewOrgName('');
          router.push(`/onboarding?orgId=${org.id}&step=1`);
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to create organization',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleDeleteOrg = () => {
    if (!currentOrgId || deleteConfirmText !== currentOrg?.orgName) {
      toast({ title: 'Please type the organization name to confirm', variant: 'destructive' });
      return;
    }
    deleteOrganization.mutate(currentOrgId, {
      onSuccess: () => {
        toast({ title: 'Organization deleted' });
        setShowDeleteOrgDialog(false);
        setDeleteConfirmText('');
        // useDeleteOrganization already updates memberships + currentOrgId
        const remaining = (user?.memberships ?? []).filter((m) => m.orgId !== currentOrgId);
        if (remaining.length > 0) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to delete organization',
          variant: 'destructive',
        });
      },
    });
  };

  const handleChangePassword = () => {
    if (newPw !== confirmPw) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    changePassword.mutate(
      { currentPassword: user?.hasPassword ? currentPw : undefined, newPassword: newPw },
      {
        onSuccess: () => {
          toast({ title: user?.hasPassword ? 'Password updated' : 'Password set' });
          setShowPasswordDialog(false);
          setCurrentPw('');
          setNewPw('');
          setConfirmPw('');
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to update password',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleSave = () => {
    updateProfile.mutate(
      { name },
      {
        onSuccess: () => {
          toast({ title: 'Profile updated!' });
        },
        onError: (error: any) => {
          toast({
            title: 'Error',
            description: error.message || 'Failed to update profile',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image under 5MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const avatarUrl = await uploadAvatar(file, user.id);

      updateProfile.mutate(
        { avatarUrl },
        {
          onSuccess: () => {
            toast({ title: 'Profile picture updated!' });
          },
          onError: (error: any) => {
            toast({
              title: 'Error',
              description: error.message || 'Failed to update profile picture',
              variant: 'destructive',
            });
          },
        },
      );
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <FadeIn>
        <PageHeader
          title="Settings"
          helpText="Manage your account, appearance, notifications, and organization preferences."
        />
      </FadeIn>

      <FadeIn delay={0.2}>
        <MotionCard hover={false}>
          <button
            onClick={() => toggleSection('profile')}
            className="flex items-center justify-between w-full p-5 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold">Profile & Security</span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openSections.has('profile') && "rotate-180")} />
          </button>
          {openSections.has('profile') && (
            <MotionCardContent className="pt-0 space-y-6">
              <div className="flex items-center gap-4">
                <div className="relative group">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name || 'Profile'}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <AvatarGradient name={user?.name || user?.email || 'User'} size="lg" />
                  )}
                  <button
                    onClick={handleAvatarClick}
                    disabled={isUploadingAvatar}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    ) : (
                      <Camera className="h-5 w-5 text-white" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </div>
                <div>
                  <p className="font-medium">{user?.name || 'No name set'}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click avatar to change photo
                  </p>
                </div>
              </div>

              <Separator className="opacity-50" />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Display Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="h-11 bg-secondary/30 border-border/50 focus:border-primary"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email Address</Label>
                  <Input
                    value={user?.email || ''}
                    disabled
                    className="h-11 bg-secondary/30 border-border/50 opacity-60"
                  />
                </div>

                <Button
                  className="hover:opacity-90"
                  disabled={!hasChanges || updateProfile.isPending}
                  onClick={handleSave}
                >
                  {updateProfile.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>

              <Separator className="opacity-50" />

              <div>
                <h3 className="text-sm font-medium mb-3">Security</h3>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Password</p>
                    <p className="text-xs text-muted-foreground">
                      {user?.hasPassword
                        ? 'Change your account password'
                        : 'Set a password so you can sign in without a magic link'}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)}>
                    {user?.hasPassword ? 'Change password' : 'Set password'}
                  </Button>
                </div>
              </div>

              <Separator className="opacity-50" />

              <div>
                <h3 className="text-sm font-medium mb-3">Appearance</h3>
                <div className="space-y-4">
                  <Label className="text-sm font-medium">Theme</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {themeOptions.map((option) => {
                      const isActive = theme === option.value;
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          onClick={() => setTheme(option.value)}
                          className={cn(
                            'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] transition-transform',
                            isActive
                              ? 'border-primary bg-primary/10'
                              : 'border-border/50 hover:border-border hover:bg-secondary/50'
                          )}
                        >
                          <div className={cn(
                            'p-3 rounded-xl',
                            isActive ? 'bg-primary/20' : 'bg-secondary'
                          )}>
                            <Icon className={cn(
                              'h-5 w-5',
                              isActive ? 'text-primary' : 'text-muted-foreground'
                            )} />
                          </div>
                          <span className={cn(
                            'text-sm font-medium',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          )}>
                            {option.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </MotionCardContent>
          )}
        </MotionCard>
      </FadeIn>

      <FadeIn delay={0.1}>
        <MotionCard hover={false}>
          <button
            onClick={() => toggleSection('organization')}
            className="flex items-center justify-between w-full p-5 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold">Organization</span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openSections.has('organization') && "rotate-180")} />
          </button>
          {openSections.has('organization') && (
            <MotionCardContent className="pt-0 space-y-6">
              {currentOrg && (
                <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{currentOrg.orgName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {currentOrg.role === 'OWNER' ? (
                          <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                            <Shield className="h-3 w-3 mr-1" />
                            Owner
                          </Badge>
                        ) : currentOrg.role === 'ADMIN' ? (
                          <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {currentOrg.role}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isAdminRole && (
                <>
                  <Separator className="opacity-50" />

                  <div>
                    <h3 className="text-sm font-medium mb-3">Member Join Code</h3>
                    <div className="space-y-4">
                      {orgDetails?.joinCode ? (
                        <>
                          <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                            <div className="flex items-center gap-3">
                              <code className="text-2xl font-mono font-bold tracking-[0.3em] text-foreground">
                                {orgDetails.joinCode}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(orgDetails.joinCode!);
                                  setCopiedCode(true);
                                  setTimeout(() => setCopiedCode(false), 2000);
                                  toast({ title: 'Code copied!' });
                                }}
                              >
                                {copiedCode ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                                {copiedCode ? 'Copied' : 'Copy'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (showRegenerateConfirm) {
                                    generateJoinCode.mutate(undefined, {
                                      onSuccess: () => {
                                        toast({ title: 'Join code regenerated' });
                                        setShowRegenerateConfirm(false);
                                      },
                                      onError: (error: any) => {
                                        toast({ title: 'Error', description: error.message, variant: 'destructive' });
                                      },
                                    });
                                  } else {
                                    setShowRegenerateConfirm(true);
                                    setTimeout(() => setShowRegenerateConfirm(false), 3000);
                                  }
                                }}
                                disabled={generateJoinCode.isPending}
                              >
                                <RefreshCw className="h-4 w-4 mr-1" />
                                {showRegenerateConfirm ? 'Confirm?' : 'Regenerate'}
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Share link</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                readOnly
                                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/join?code=${orgDetails.joinCode}`}
                                className="h-8 text-xs font-mono bg-secondary/30 border-border/50"
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 h-8"
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/join?code=${orgDetails.joinCode}`);
                                  toast({ title: 'Join link copied!' });
                                }}
                              >
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                Copy link
                              </Button>
                            </div>
                          </div>

                          <Separator className="opacity-50" />

                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <Label className="text-sm font-medium">Enable join code</Label>
                              <p className="text-xs text-muted-foreground">
                                When disabled, the code cannot be used to join
                              </p>
                            </div>
                            <Switch
                              checked={orgDetails.joinCodeEnabled}
                              onCheckedChange={(checked) =>
                                updateJoinCodeSettings.mutate({ enabled: checked })
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <Label className="text-sm font-medium">Require admin approval</Label>
                              <p className="text-xs text-muted-foreground">
                                New members will be pending until an admin approves them
                              </p>
                            </div>
                            <Switch
                              checked={orgDetails.joinRequiresApproval}
                              onCheckedChange={(checked) =>
                                updateJoinCodeSettings.mutate({ requiresApproval: checked })
                              }
                            />
                          </div>

                          <Separator className="opacity-50" />

                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              disableJoinCode.mutate(undefined, {
                                onSuccess: () => toast({ title: 'Join code disabled' }),
                                onError: (error: any) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
                              });
                            }}
                            disabled={disableJoinCode.isPending}
                          >
                            Disable & Remove Code
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">No join code set</p>
                            <p className="text-xs text-muted-foreground">
                              Generate a code to let members self-join your organization
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              generateJoinCode.mutate(undefined, {
                                onSuccess: () => toast({ title: 'Join code generated!' }),
                                onError: (error: any) => toast({ title: 'Error', description: error.message, variant: 'destructive' }),
                              });
                            }}
                            disabled={generateJoinCode.isPending}
                          >
                            {generateJoinCode.isPending ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              'Generate Code'
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator className="opacity-50" />

                  <div>
                    <h3 className="text-sm font-medium mb-3">Payment Instructions</h3>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Instructions shown to members on how to pay (Venmo, Zelle, etc.)
                      </p>
                      <Textarea
                        value={paymentInstructions}
                        onChange={(e) => setPaymentInstructions(e.target.value)}
                        placeholder="e.g., Venmo: @ThetaChi, Zelle: treasurer@theta.org"
                        maxLength={500}
                        className="min-h-[100px] bg-secondary/30 border-border/50 focus:border-primary"
                      />
                      <Button
                        disabled={updateOrganization.isPending || paymentInstructions === (orgDetails?.paymentInstructions || '')}
                        onClick={() =>
                          updateOrganization.mutate(
                            { paymentInstructions },
                            {
                              onSuccess: () => toast({ title: 'Payment instructions saved!' }),
                              onError: (error: any) =>
                                toast({
                                  title: 'Error',
                                  description: error.message || 'Failed to save payment instructions',
                                  variant: 'destructive',
                                }),
                            },
                          )
                        }
                      >
                        {updateOrganization.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save Instructions'
                        )}
                      </Button>
                    </div>
                  </div>

                  <Separator className="opacity-50" />

                  <div>
                    <h3 className="text-sm font-medium mb-3">Payment Links</h3>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Add your payment handles so members can pay with one tap.
                      </p>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm">Venmo</Label>
                          <Input
                            value={paymentHandles.venmo || ''}
                            onChange={(e) => setPaymentHandles((h) => ({ ...h, venmo: e.target.value }))}
                            placeholder="@username"
                            className="bg-secondary/30 border-border/50 focus:border-primary"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Zelle</Label>
                          <Input
                            value={paymentHandles.zelle || ''}
                            onChange={(e) => setPaymentHandles((h) => ({ ...h, zelle: e.target.value }))}
                            placeholder="email@example.com or phone"
                            className="bg-secondary/30 border-border/50 focus:border-primary"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">Cash App</Label>
                          <Input
                            value={paymentHandles.cashapp || ''}
                            onChange={(e) => setPaymentHandles((h) => ({ ...h, cashapp: e.target.value }))}
                            placeholder="$cashtag"
                            className="bg-secondary/30 border-border/50 focus:border-primary"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm">PayPal</Label>
                          <Input
                            value={paymentHandles.paypal || ''}
                            onChange={(e) => setPaymentHandles((h) => ({ ...h, paypal: e.target.value }))}
                            placeholder="username"
                            className="bg-secondary/30 border-border/50 focus:border-primary"
                          />
                        </div>
                      </div>
                      <Button
                        disabled={updateOrganization.isPending || JSON.stringify(paymentHandles) === JSON.stringify(orgDetails?.paymentHandles || {})}
                        onClick={() => {
                          const cleaned = Object.fromEntries(
                            Object.entries(paymentHandles).filter(([, v]) => v.trim())
                          );
                          updateOrganization.mutate(
                            { paymentHandles: cleaned },
                            {
                              onSuccess: () => toast({ title: 'Payment links saved!' }),
                              onError: (error: any) =>
                                toast({
                                  title: 'Error',
                                  description: error.message || 'Failed to save payment links',
                                  variant: 'destructive',
                                }),
                            },
                          );
                        }}
                      >
                        {updateOrganization.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save Payment Links'
                        )}
                      </Button>
                    </div>
                  </div>

                  <Separator className="opacity-50" />

                  <div>
                    <h3 className="text-sm font-medium mb-3">Email Reminders</h3>
                    <div className="space-y-4">
                      {(reminderRules as any)?.length > 0 ? (
                        <div className="space-y-2">
                          {(reminderRules as any).map((rule: { id: string; triggerType: string; daysOffset: number; isActive: boolean }) => (
                            <div
                              key={rule.id}
                              className="flex items-center justify-between p-3 rounded-xl bg-secondary/30"
                            >
                              <span className="text-sm">
                                <span className="font-medium">{rule.daysOffset} day{rule.daysOffset !== 1 ? 's' : ''}</span>{' '}
                                {rule.triggerType === 'BEFORE_DUE' ? 'before due date' : 'after due date'}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  if (!currentOrgId) return;
                                  deleteReminderRule.mutate(
                                    { orgId: currentOrgId, id: rule.id },
                                    {
                                      onSuccess: () => toast({ title: 'Reminder rule deleted' }),
                                      onError: (error: any) =>
                                        toast({
                                          title: 'Error',
                                          description: error.message || 'Failed to delete rule',
                                          variant: 'destructive',
                                        }),
                                    },
                                  );
                                }}
                                disabled={deleteReminderRule.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No reminder rules configured. Add one below to automatically email members about upcoming or overdue charges.
                        </p>
                      )}

                      <Separator className="opacity-50" />

                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Add Rule</Label>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            min="1"
                            max="90"
                            value={newRuleDays}
                            onChange={(e) => setNewRuleDays(e.target.value)}
                            className="w-20 h-10 bg-secondary/30 border-border/50"
                          />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">days</span>
                          <Select value={newRuleTrigger} onValueChange={setNewRuleTrigger}>
                            <SelectTrigger className="h-10 bg-secondary/30 border-border/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BEFORE_DUE">Before due date</SelectItem>
                              <SelectItem value="AFTER_DUE">After due date</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            disabled={createReminderRule.isPending || !newRuleDays || parseInt(newRuleDays) < 1}
                            onClick={() => {
                              if (!currentOrgId) return;
                              createReminderRule.mutate(
                                {
                                  orgId: currentOrgId,
                                  data: {
                                    triggerType: newRuleTrigger,
                                    daysOffset: parseInt(newRuleDays),
                                  },
                                },
                                {
                                  onSuccess: () => {
                                    toast({ title: 'Reminder rule added!' });
                                    setNewRuleDays('3');
                                    setNewRuleTrigger('BEFORE_DUE');
                                  },
                                  onError: (error: any) =>
                                    toast({
                                      title: 'Error',
                                      description: error.message || 'Failed to create rule',
                                      variant: 'destructive',
                                    }),
                                },
                              );
                            }}
                          >
                            {createReminderRule.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </MotionCardContent>
          )}
        </MotionCard>
      </FadeIn>

      {isAdminRole && (
        <FadeIn delay={0.3}>
          <MotionCard hover={false}>
            <button
              onClick={() => toggleSection('integrations')}
              className="flex items-center justify-between w-full p-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Link2 className="h-4 w-4 text-primary" />
                </div>
                <span className="font-semibold">Integrations</span>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openSections.has('integrations') && "rotate-180")} />
            </button>
            {openSections.has('integrations') && (
              <MotionCardContent className="pt-0">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-3">Gmail Sync</h3>
                    <GmailSyncSection orgId={currentOrgId} />
                  </div>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-3">Bank Connections</h3>
                    <BankConnectionsSection orgId={currentOrgId} />
                  </div>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-3">GroupMe</h3>
                    <GroupMeSection orgId={currentOrgId} />
                  </div>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-3">Discord</h3>
                    <DiscordSection orgId={currentOrgId} />
                  </div>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-3">Slack</h3>
                    <SlackSection orgId={currentOrgId} />
                  </div>
                </div>
              </MotionCardContent>
            )}
          </MotionCard>
        </FadeIn>
      )}

      {isOwner && (
        <FadeIn delay={0.4}>
          <MotionCard hover={false} className="border-destructive/30">
            <button
              onClick={() => toggleSection('danger')}
              className="flex items-center justify-between w-full p-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </div>
                <span className="font-semibold text-destructive">Danger Zone</span>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openSections.has('danger') && "rotate-180")} />
            </button>
            {openSections.has('danger') && (
              <MotionCardContent className="pt-0 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Transfer Ownership</p>
                    <p className="text-xs text-muted-foreground">
                      The new owner will have full control. You will become an Admin.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowTransferDialog(true)}>
                    Transfer
                  </Button>
                </div>

                <Separator className="opacity-50" />

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Delete Organization</p>
                    <p className="text-xs text-muted-foreground">
                      Permanently delete {currentOrg?.orgName} and all its data
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteOrgDialog(true)}
                  >
                    Delete
                  </Button>
                </div>

                <Separator className="opacity-50" />

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateOrgDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create New Organization
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/onboarding?orgId=' + currentOrgId + '&step=1')}
                  >
                    <GraduationCap className="w-4 h-4 mr-2" />
                    Launch Setup Wizard
                  </Button>
                </div>
              </MotionCardContent>
            )}
          </MotionCard>
        </FadeIn>
      )}

      {/* Create Organization Dialog */}
      <Dialog open={showCreateOrgDialog} onOpenChange={setShowCreateOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage a different group, team, or chapter.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                maxLength={100}
                placeholder="e.g., Alpha Beta Gamma"
                className="bg-secondary/30 border-border/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateOrgDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrg}
              disabled={createOrganization.isPending || newOrgName.trim().length < 3}

            >
              {createOrganization.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Organization'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        setShowPasswordDialog(open);
        if (!open) { setCurrentPw(''); setNewPw(''); setConfirmPw(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{user?.hasPassword ? 'Change Password' : 'Set Password'}</DialogTitle>
            <DialogDescription>
              {user?.hasPassword
                ? 'Enter your current password and choose a new one.'
                : 'Set a password so you can sign in with email and password.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {user?.hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="currentPw">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPw"
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    className="bg-secondary/30 border-border/50 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPw">New Password</Label>
              <div className="relative">
                <Input
                  id="newPw"
                  type={showNewPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 8 characters"
                  className="bg-secondary/30 border-border/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Must contain uppercase, lowercase, and a number
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPw">Confirm New Password</Label>
              <Input
                id="confirmPw"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
                className="bg-secondary/30 border-border/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changePassword.isPending || !newPw || !confirmPw || (user?.hasPassword && !currentPw)}
             
            >
              {changePassword.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                user?.hasPassword ? 'Change Password' : 'Set Password'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Ownership Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={(open) => {
        setShowTransferDialog(open);
        if (!open) { setTransferTargetId(null); setTransferConfirmText(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Select a member to transfer ownership to. You will become an Admin.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Select new owner</Label>
              <Select value={transferTargetId ?? ''} onValueChange={setTransferTargetId}>
                <SelectTrigger className="h-11 bg-secondary/30 border-border/50">
                  <SelectValue placeholder="Choose a member..." />
                </SelectTrigger>
                <SelectContent>
                  {(membersData?.data ?? [])
                    .filter((m) => m.status === 'ACTIVE' && m.role !== 'OWNER')
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName} ({m.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <p className="text-sm text-destructive font-medium">
                This action cannot be easily undone
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The new owner will need to transfer ownership back to you if you want it returned.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Type TRANSFER to confirm</Label>
              <Input
                value={transferConfirmText}
                onChange={(e) => setTransferConfirmText(e.target.value)}
                placeholder="TRANSFER"
                className="h-11 bg-secondary/30 border-border/50 focus:border-primary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransferOwnership}
              disabled={transferOwnership.isPending || !transferTargetId || transferConfirmText !== 'TRANSFER'}
            >
              {transferOwnership.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Transferring...
                </>
              ) : (
                'Transfer Ownership'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog open={showDeleteOrgDialog} onOpenChange={setShowDeleteOrgDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Organization
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the organization
              and all associated data including members, charges, payments, and expenses.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <p className="text-sm text-destructive font-medium">
                Warning: You are about to delete &quot;{currentOrg?.orgName}&quot;
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                All members, charges, payments, expenses, and activity history will be permanently deleted.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deleteConfirm">
                Type <span className="font-semibold">{currentOrg?.orgName}</span> to confirm
              </Label>
              <Input
                id="deleteConfirm"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Organization name"
                className="bg-secondary/30 border-border/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteOrgDialog(false);
              setDeleteConfirmText('');
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteOrg}
              disabled={deleteOrganization.isPending || deleteConfirmText !== currentOrg?.orgName}
            >
              {deleteOrganization.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Organization'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
