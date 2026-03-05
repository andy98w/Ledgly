'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor, Mail, MailX, Check, Plus, Trash2, Loader2, ChevronLeft, CreditCard, Palette, Users, LogIn } from 'lucide-react';
import Image from 'next/image';
import { useCreateOrganization, useUpdateOrganization, useResolveJoinCode, useJoinOrganization } from '@/lib/queries/organizations';
import { useCreateMembers } from '@/lib/queries/members';
import { getGmailConnectUrl } from '@/lib/queries/gmail';
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

const STEP_LABELS = ['Organization', 'Gmail', 'Sources', 'Theme', 'Members'];

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

  // Determine initial step from URL params (for OAuth return)
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

  // Join mode state
  const [joinMode, setJoinMode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [submittedJoinCode, setSubmittedJoinCode] = useState('');

  const updateOrganization = useUpdateOrganization(orgId);
  const createMembers = useCreateMembers();
  const { data: resolved, isLoading: resolving, error: resolveError } = useResolveJoinCode(submittedJoinCode || null);
  const joinOrg = useJoinOrganization();

  // Handle OAuth return — resume at step 2 with org already created
  useEffect(() => {
    if (urlStep && urlOrgId) {
      setStep(parseInt(urlStep, 10));
      setOrgId(urlOrgId);
      if (connected === 'true') {
        setGmailConnected(true);
      }
    }
  }, [urlStep, urlOrgId, connected]);

  // Back navigation: step 2 goes back to 1, step 3 goes back to 1 if Gmail was skipped (source step was skipped), else 2
  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(gmailConnected ? 2 : 1);
    else if (step === 4) setStep(3);
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
    const returnTo = `/onboarding?step=2&orgId=${orgId}`;
    window.location.href = getGmailConnectUrl(orgId, returnTo);
  };

  const handleSkipGmail = () => {
    setStep(3);
  };

  const handleSaveSources = async () => {
    if (!orgId) return;
    try {
      await updateOrganization.mutateAsync({ enabledPaymentSources: enabledSources });
      setStep(3);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save payment sources',
        variant: 'destructive',
      });
    }
  };

  const handleThemeNext = () => {
    setStep(4);
  };

  const toggleSource = (sourceId: string) => {
    setEnabledSources((prev) =>
      prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId],
    );
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
      router.push('/dashboard');
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

  // Step icon config for consistent visual anchors
  const stepIcons: Record<number, { icon: React.ElementType; bg: string; fg: string }> = {
    1: { icon: Mail, bg: 'bg-primary/10', fg: 'text-primary' },
    2: { icon: CreditCard, bg: 'bg-primary/10', fg: 'text-primary' },
    3: { icon: Palette, bg: 'bg-primary/10', fg: 'text-primary' },
    4: { icon: Users, bg: 'bg-primary/10', fg: 'text-primary' },
  };

  const StepIcon = ({ stepNum }: { stepNum: number }) => {
    const config = stepIcons[stepNum];
    if (!config) return null;
    const Icon = config.icon;
    return (
      <div className={cn('w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center', config.bg)}>
        <Icon className={cn('h-6 w-6', config.fg)} />
      </div>
    );
  };

  return (
    <>
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-center gap-2">
          {[0, 1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                s === step ? 'w-8 bg-primary' : s < step ? 'w-4 bg-primary/40' : 'w-4 bg-border',
              )}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Step {step + 1} of 5 &middot; {STEP_LABELS[step]}
        </p>
      </div>

      {/* Step 0: Org Name / Join */}
      {step === 0 && (
        <>
          <CardHeader className="text-center px-0 pt-0">
            <Image src="/logo.png" alt="Ledgly" width={48} height={48} className="mx-auto mb-4 w-12 h-12 rounded-xl" />
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
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="name">Organization Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Alpha Beta Gamma, Chess Club"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="h-11 bg-secondary/50 border-border/50 focus:border-primary"
                      autoFocus
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!orgName.trim() || createOrganization.isPending}
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

                <div className="relative my-6">
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
              <div className="space-y-4">
                {/* Resolved org — show join confirmation */}
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
                    <form onSubmit={handleJoinLookup} className="space-y-4">
                      <div className="space-y-2">
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

      {/* Step 1: Connect Gmail */}
      {step === 1 && (
        <>
          <CardHeader className="text-center px-0 pt-0">
            <StepIcon stepNum={1} />
            <CardTitle>Connect Gmail</CardTitle>
            <CardDescription>
              Automatically import payment notifications from Venmo, Zelle, Cash App, and PayPal
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-4">
            <button
              onClick={handleConnectGmail}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border/50 hover:border-primary hover:bg-primary/5 active:scale-[0.98] transition-all text-left"
            >
              <div className="p-3 rounded-xl bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Connect Gmail</p>
                <p className="text-sm text-muted-foreground">
                  Import payment emails automatically
                </p>
              </div>
            </button>
            <button
              onClick={handleSkipGmail}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border/50 hover:border-border hover:bg-secondary/50 active:scale-[0.98] transition-all text-left"
            >
              <div className="p-3 rounded-xl bg-secondary">
                <MailX className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Skip for now</p>
                <p className="text-sm text-muted-foreground">
                  You can connect later in Settings
                </p>
              </div>
            </button>
            <Button variant="ghost" size="sm" onClick={handleBack} className="w-full text-muted-foreground">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </CardContent>
        </>
      )}

      {/* Step 2: Payment Sources (only after Gmail connected) */}
      {step === 2 && (
        <>
          <CardHeader className="text-center px-0 pt-0">
            <StepIcon stepNum={2} />
            <CardTitle>Payment Sources</CardTitle>
            <CardDescription>
              Choose which payment platforms to monitor for incoming payments
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {PAYMENT_SOURCES.map((source) => {
                const isActive = enabledSources.includes(source.id);
                return (
                  <button
                    key={source.id}
                    onClick={() => toggleSource(source.id)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-[0.98] text-left',
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 hover:border-border hover:bg-secondary/50',
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                        isActive ? 'border-primary bg-primary' : 'border-muted-foreground/30',
                      )}
                    >
                      {isActive && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className={cn('font-medium text-sm', isActive ? 'text-primary' : 'text-muted-foreground')}>
                      {source.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              onClick={handleSaveSources}
              className="w-full"
              disabled={updateOrganization.isPending}
            >
              {updateOrganization.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Next'
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleBack} className="w-full text-muted-foreground">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </CardContent>
        </>
      )}

      {/* Step 3: Appearance */}
      {step === 3 && (
        <>
          <CardHeader className="text-center px-0 pt-0">
            <StepIcon stepNum={3} />
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose your preferred theme</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map((option) => {
                const isActive = theme === option.value;
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98]',
                      isActive
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 hover:border-border hover:bg-secondary/50',
                    )}
                  >
                    <div className={cn('p-3 rounded-xl', isActive ? 'bg-primary/20' : 'bg-secondary')}>
                      <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <span className={cn('text-sm font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button onClick={handleThemeNext} className="w-full">
              Next
            </Button>
            <Button variant="ghost" size="sm" onClick={handleBack} className="w-full text-muted-foreground">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </CardContent>
        </>
      )}

      {/* Step 4: Add Initial Members */}
      {step === 4 && (
        <>
          <CardHeader className="text-center px-0 pt-0">
            <StepIcon stepNum={4} />
            <CardTitle>Add Members</CardTitle>
            <CardDescription>
              Add your initial members now, or skip and add them later
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0 space-y-4">
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.key} className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Name"
                      value={member.name}
                      onChange={(e) => updateMember(member.key, 'name', e.target.value)}
                      className="h-10 bg-secondary/50 border-border/50 focus:border-primary"
                    />
                    <Input
                      placeholder="Email (optional)"
                      type="email"
                      value={member.email}
                      onChange={(e) => updateMember(member.key, 'email', e.target.value)}
                      className="h-10 bg-secondary/50 border-border/50 focus:border-primary"
                    />
                  </div>
                  {members.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 mt-0 text-muted-foreground hover:text-destructive"
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
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push('/dashboard')}
              >
                Skip
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
                  'Finish'
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
