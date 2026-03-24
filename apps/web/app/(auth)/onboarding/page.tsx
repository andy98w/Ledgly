'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, Mail, Check, Plus, Trash2, Loader2, ChevronLeft, Users, LogIn, Landmark, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import { useCreateOrganization, useUpdateOrganization, useResolveJoinCode, useJoinOrganization } from '@/lib/queries/organizations';
import { useCreateMembers } from '@/lib/queries/members';
import { getGmailConnectUrl } from '@/lib/queries/gmail';
import { useCreatePlaidLinkToken, useExchangePlaidToken } from '@/lib/queries/plaid';
import { useConnectGroupMe } from '@/lib/queries/groupme';
import { useConnectDiscord } from '@/lib/queries/discord';
import { useConnectSlack } from '@/lib/queries/slack';
import { useAuthStore } from '@/lib/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const PAYMENT_SOURCES = [
  { id: 'venmo', label: 'Venmo' },
  { id: 'zelle', label: 'Zelle' },
  { id: 'cashapp', label: 'Cash App' },
  { id: 'paypal', label: 'PayPal' },
];

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

const STEP_LABELS = ['Organization', 'Setup', 'Bank', 'Integrations', 'Team'];

let nextMemberKey = 1;

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingWizard />
    </Suspense>
  );
}

function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const createOrganization = useCreateOrganization();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);

  const urlStep = searchParams.get('step');
  const urlOrgId = searchParams.get('orgId');
  const connected = searchParams.get('connected');

  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);

  const [step, setStep] = useState(0);
  const [orgName, setOrgName] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [enabledSources, setEnabledSources] = useState<string[]>(['venmo', 'zelle', 'cashapp', 'paypal']);
  const [members, setMembers] = useState([{ key: nextMemberKey++, name: '', email: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [joinMode, setJoinMode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [submittedJoinCode, setSubmittedJoinCode] = useState('');

  const [plaidConnecting, setPlaidConnecting] = useState(false);
  const [bankConnected, setBankConnected] = useState(false);
  const [plaidReady, setPlaidReady] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const [groupmeBotId, setGroupmeBotId] = useState('');
  const [groupmeConnected, setGroupmeConnected] = useState(false);
  const [discordUrl, setDiscordUrl] = useState('');
  const [discordConnected, setDiscordConnected] = useState(false);
  const [slackUrl, setSlackUrl] = useState('');
  const [slackConnected, setSlackConnected] = useState(false);

  const updateOrganization = useUpdateOrganization(orgId);
  const createMembers = useCreateMembers();
  const { data: resolved, isLoading: resolving, error: resolveError } = useResolveJoinCode(submittedJoinCode || null);
  const joinOrg = useJoinOrganization();
  const createLinkToken = useCreatePlaidLinkToken();
  const exchangeToken = useExchangePlaidToken();
  const connectGroupMe = useConnectGroupMe();
  const connectDiscord = useConnectDiscord();
  const connectSlack = useConnectSlack();

  useEffect(() => {
    if (urlStep && urlOrgId) {
      setStep(parseInt(urlStep, 10));
      setOrgId(urlOrgId);
      if (connected === 'true') {
        setGmailConnected(true);
      }
    }
  }, [urlStep, urlOrgId, connected]);

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
        if (orgId) {
          try {
            await exchangeToken.mutateAsync({ orgId, publicToken });
            setBankConnected(true);
            toast({ title: 'Bank account connected' });
          } catch {
            toast({ title: 'Failed to connect bank', variant: 'destructive' });
          }
        }
        setLinkToken(null);
        setPlaidConnecting(false);
      },
      onExit: () => {
        setLinkToken(null);
        setPlaidConnecting(false);
      },
    });

    handler.open();

    return () => handler.destroy();
  }, [linkToken, plaidReady]);

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return;
    try {
      const org = await createOrganization.mutateAsync({ name: orgName.trim() });
      setOrgId(org.id);
      setStep(1);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create organization',
        variant: 'destructive',
      });
    }
  };

  const handleJoinLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = joinCode.trim().toUpperCase();
    if (trimmed.length !== 6) {
      toast({ title: 'Enter a 6-character join code', variant: 'destructive' });
      return;
    }
    setSubmittedJoinCode(trimmed);
  };

  const handleJoin = async () => {
    if (!submittedJoinCode) return;
    try {
      const result = await joinOrg.mutateAsync(submittedJoinCode);
      setCurrentOrgId(result.orgId);

      if (result.status === 'PENDING') {
        toast({ title: 'Request sent', description: 'An admin will approve your membership.' });
      } else {
        toast({ title: `Joined ${result.orgName}!` });
      }

      window.location.href = '/portal';
    } catch (error: any) {
      toast({
        title: 'Could not join',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
    }
  };

  const handleConnectGmail = () => {
    if (!orgId) return;
    const returnTo = `/onboarding?step=1&orgId=${orgId}`;
    window.location.href = getGmailConnectUrl(orgId, returnTo);
  };

  const toggleSource = (sourceId: string) => {
    setEnabledSources((prev) =>
      prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId],
    );
  };

  const handleSetupContinue = async () => {
    if (!orgId) return;
    setIsSubmitting(true);
    try {
      await updateOrganization.mutateAsync({ enabledPaymentSources: enabledSources });
      setStep(2);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConnectBank = async () => {
    if (!orgId) return;
    setPlaidConnecting(true);
    try {
      const result = await createLinkToken.mutateAsync({ orgId });
      setLinkToken(result.linkToken);
    } catch {
      toast({ title: 'Failed to initialize bank connection', variant: 'destructive' });
      setPlaidConnecting(false);
    }
  };

  const handleConnectGroupme = async () => {
    if (!orgId || !groupmeBotId.trim()) return;
    try {
      await connectGroupMe.mutateAsync({ orgId, botId: groupmeBotId.trim() });
      setGroupmeConnected(true);
      toast({ title: 'GroupMe connected' });
    } catch {
      toast({ title: 'Failed to connect GroupMe', variant: 'destructive' });
    }
  };

  const handleConnectDiscord = async () => {
    if (!orgId || !discordUrl.trim()) return;
    try {
      await connectDiscord.mutateAsync({ orgId, webhookUrl: discordUrl.trim() });
      setDiscordConnected(true);
      toast({ title: 'Discord connected' });
    } catch {
      toast({ title: 'Failed to connect Discord', variant: 'destructive' });
    }
  };

  const handleConnectSlack = async () => {
    if (!orgId || !slackUrl.trim()) return;
    try {
      await connectSlack.mutateAsync({ orgId, webhookUrl: slackUrl.trim() });
      setSlackConnected(true);
      toast({ title: 'Slack connected' });
    } catch {
      toast({ title: 'Failed to connect Slack', variant: 'destructive' });
    }
  };

  const addMemberRow = () => {
    setMembers((prev) => [...prev, { key: nextMemberKey++, name: '', email: '' }]);
  };

  const removeMemberRow = (key: number) => {
    setMembers((prev) => prev.filter((m) => m.key !== key));
  };

  const updateMember = (key: number, field: 'name' | 'email', value: string) => {
    setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, [field]: value } : m)));
  };

  const handleFinish = async () => {
    if (!orgId) return;
    setIsSubmitting(true);

    try {
      const validMembers = members.filter((m) => m.name.trim());
      if (validMembers.length > 0) {
        await createMembers.mutateAsync({
          orgId,
          members: validMembers.map((m) => ({
            name: m.name.trim(),
            email: m.email.trim() || undefined,
          })),
        });
      }
      toast({ title: 'Welcome to Ledgly! \u{1F389}' });
      router.push('/agent');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add members',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-center gap-2">
          {STEP_LABELS.map((_, s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                s === step ? 'w-8 bg-primary' : s < step ? 'w-4 bg-primary/40' : 'w-4 bg-border',
              )}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-1.5">
          {STEP_LABELS[step]}
        </p>
      </div>

      {step === 0 && (
        <>
          <CardHeader className="text-center px-0 pt-0 pb-4">
            <Image src="/logo.png" alt="Ledgly" width={48} height={48} className="mx-auto mb-3 w-12 h-12 rounded-xl" />
            <CardTitle>{joinMode ? 'Join an organization' : 'Create your organization'}</CardTitle>
            <CardDescription>
              {joinMode
                ? 'Enter the code shared by your admin'
                : 'Set up your fraternity, club, or group to start tracking finances'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {!joinMode ? (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateOrg();
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Organization Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Alpha Beta Gamma, Chess Club"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      maxLength={100}
                      className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={orgName.trim().length < 3 || createOrganization.isPending}
                  >
                    {createOrganization.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Next'
                    )}
                  </Button>
                </form>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <button
                  onClick={() => setJoinMode(true)}
                  className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Have a join code?
                </button>
              </>
            ) : (
              <div className="space-y-3">
                {submittedJoinCode && resolved && !resolveError ? (
                  <>
                    <div className="text-center py-2">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary" />
                      </div>
                      <p className="font-medium text-lg">{resolved.orgName}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        You&apos;ll be added as a member of this organization.
                      </p>
                    </div>
                    <Button
                      onClick={handleJoin}
                      className="w-full"
                      disabled={joinOrg.isPending}
                    >
                      {joinOrg.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        `Join ${resolved.orgName}`
                      )}
                    </Button>
                    <button
                      onClick={() => { setSubmittedJoinCode(''); }}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Try a different code
                    </button>
                  </>
                ) : resolving ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Looking up code...</p>
                  </div>
                ) : (
                  <>
                    {resolveError && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                        Invalid or disabled code. Check with your admin.
                      </div>
                    )}
                    <form onSubmit={handleJoinLookup} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="joinCode">Join Code</Label>
                        <Input
                          id="joinCode"
                          type="text"
                          placeholder="ABC123"
                          value={joinCode}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                            setJoinCode(val);
                            if (resolveError && val !== submittedJoinCode) setSubmittedJoinCode('');
                          }}
                          className="h-14 text-center text-2xl font-mono tracking-[0.3em] bg-secondary/50 border-border/50 focus:border-primary"
                          maxLength={6}
                          autoFocus
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={joinCode.length !== 6}
                      >
                        Look Up
                      </Button>
                    </form>
                  </>
                )}

                {!resolving && !resolved && (
                  <button
                    onClick={() => { setJoinMode(false); setJoinCode(''); setSubmittedJoinCode(''); }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back to create
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </>
      )}

      {step === 1 && (
        <>
          <CardHeader className="text-center px-0 pt-0 pb-4">
            <CardTitle>Get started</CardTitle>
            <CardDescription>Connect your accounts and set your preferences</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Gmail</Label>
              {gmailConnected ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-primary bg-primary/5">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Check className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Gmail connected</p>
                    <p className="text-xs text-muted-foreground">Payment emails will be imported automatically</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleConnectGmail}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-border/50 hover:border-primary hover:bg-primary/5 active:scale-[0.98] transition-all text-left"
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">Connect Gmail to auto-import payments</p>
                    <p className="text-xs text-muted-foreground">Venmo, Zelle, Cash App, and PayPal</p>
                  </div>
                </button>
              )}
              {!gmailConnected && (
                <p className="text-xs text-muted-foreground mt-1.5 ml-1">You can always connect later in Settings</p>
              )}
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Payment sources</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_SOURCES.map((source) => {
                  const isActive = enabledSources.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      onClick={() => toggleSource(source.id)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 transition-all active:scale-[0.98] text-left',
                        isActive
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 hover:border-border hover:bg-secondary/50',
                      )}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                          isActive ? 'border-primary bg-primary' : 'border-muted-foreground/30',
                        )}
                      >
                        {isActive && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <span className={cn('font-medium text-sm', isActive ? 'text-primary' : 'text-muted-foreground')}>
                        {source.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Theme</Label>
              <div className="flex gap-2">
                {themeOptions.map((option) => {
                  const isActive = theme === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all active:scale-[0.98]',
                        isActive
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 hover:border-border hover:bg-secondary/50',
                      )}
                    >
                      <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                      <span className={cn('text-sm font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              onClick={handleSetupContinue}
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Continue'
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleBack} className="w-full text-muted-foreground">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </CardContent>
        </>
      )}

      {step === 2 && (
        <>
          <CardHeader className="text-center px-0 pt-0">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center">
              <Landmark className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Connect Your Bank</CardTitle>
            <CardDescription>
              Optional — automatically detect all Venmo, Zelle, and CashApp transactions, even ones without email notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-4">
            <div className="rounded-xl border-2 border-dashed border-border/50 p-6 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Bank connection uses Plaid to securely read your transactions. We never move money or access your credentials.
              </p>
              <Button onClick={handleConnectBank} disabled={plaidConnecting}>
                {plaidConnecting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting...</> : 'Connect Bank Account'}
              </Button>
            </div>
            {bankConnected && (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <Check className="w-4 h-4" />
                Bank connected
              </div>
            )}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setStep(3)}>
                {bankConnected ? 'Continue' : 'Skip for now'}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="w-full text-muted-foreground">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </CardContent>
        </>
      )}

      {step === 3 && (
        <>
          <CardHeader className="text-center px-0 pt-0">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Connect Group Chat</CardTitle>
            <CardDescription>
              Optional — get payment notifications and weekly summaries in your group chat
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">GroupMe Bot ID</Label>
              <div className="flex gap-2">
                <Input placeholder="Paste bot ID" value={groupmeBotId} onChange={e => setGroupmeBotId(e.target.value)} className="flex-1 h-9" />
                <Button size="sm" variant="outline" disabled={!groupmeBotId.trim()} onClick={handleConnectGroupme}>Connect</Button>
              </div>
              <p className="text-xs text-muted-foreground">Create at dev.groupme.com/bots</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Discord Webhook URL</Label>
              <div className="flex gap-2">
                <Input placeholder="https://discord.com/api/webhooks/..." value={discordUrl} onChange={e => setDiscordUrl(e.target.value)} className="flex-1 h-9" />
                <Button size="sm" variant="outline" disabled={!discordUrl.trim()} onClick={handleConnectDiscord}>Connect</Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Slack Webhook URL</Label>
              <div className="flex gap-2">
                <Input placeholder="https://hooks.slack.com/services/..." value={slackUrl} onChange={e => setSlackUrl(e.target.value)} className="flex-1 h-9" />
                <Button size="sm" variant="outline" disabled={!slackUrl.trim()} onClick={handleConnectSlack}>Connect</Button>
              </div>
            </div>

            <Button className="w-full" onClick={() => setStep(4)}>
              {(groupmeConnected || discordConnected || slackConnected) ? 'Continue' : 'Skip for now'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="w-full text-muted-foreground">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </CardContent>
        </>
      )}

      {step === 4 && (
        <>
          <CardHeader className="text-center px-0 pt-0 pb-4">
            <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Who&apos;s in your organization?</CardTitle>
            <CardDescription>
              Add members now or do it later &mdash; you can always add more from the Members page
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-3">
            <div className="space-y-2.5">
              {members.map((member) => (
                <div key={member.key} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Input
                      placeholder="Name"
                      value={member.name}
                      onChange={(e) => updateMember(member.key, 'name', e.target.value)}
                      maxLength={100}
                      className="h-9 bg-secondary/50 border-border/50 focus:border-primary"
                    />
                    <Input
                      placeholder="Email (optional)"
                      type="email"
                      value={member.email}
                      onChange={(e) => updateMember(member.key, 'email', e.target.value)}
                      maxLength={255}
                      className="h-9 bg-secondary/50 border-border/50 focus:border-primary"
                    />
                  </div>
                  {members.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 mt-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeMemberRow(member.key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addMemberRow} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add another
            </Button>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  toast({ title: 'Welcome to Ledgly! \u{1F389}' });
                  router.push('/agent');
                }}
              >
                Skip for now
              </Button>
              <Button
                className="flex-1"
                onClick={handleFinish}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Finishing...
                  </>
                ) : (
                  'Finish setup'
                )}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={handleBack} className="w-full text-muted-foreground">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </CardContent>
        </>
      )}
    </>
  );
}
