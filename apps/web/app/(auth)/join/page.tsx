'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Loader2, Users, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { useResolveJoinCode, useJoinOrganization } from '@/lib/queries/organizations';
import { useAuthStore } from '@/lib/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

function JoinForm() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const isLoggedIn = !!user;

  const initialCode = searchParams.get('code') || '';
  const [code, setCode] = useState(initialCode);
  const [submittedCode, setSubmittedCode] = useState(initialCode.length === 6 ? initialCode : '');

  const { data: resolved, isLoading: resolving, error: resolveError } = useResolveJoinCode(submittedCode || null);
  const joinOrg = useJoinOrganization();

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      toast({ title: 'Enter a 6-character join code', variant: 'destructive' });
      return;
    }
    setSubmittedCode(trimmed);
  };

  const handleJoin = async () => {
    if (!submittedCode) return;
    try {
      const result = await joinOrg.mutateAsync(submittedCode);
      setCurrentOrgId(result.orgId);

      if (result.status === 'PENDING') {
        toast({ title: 'Request sent', description: 'An admin will approve your membership.' });
      } else {
        toast({ title: `Joined ${result.orgName}!` });
      }

      // Refresh auth to pick up new membership
      window.location.href = '/portal';
    } catch (error: any) {
      toast({
        title: 'Could not join',
        description: error.message || 'Something went wrong',
        variant: 'destructive',
      });
    }
  };

  // Code entry form (before lookup)
  if (!submittedCode || resolveError) {
    return (
      <div className="animate-in-up">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <Image src="/logo.png" alt="Ledgly" width={64} height={64} className="mx-auto mb-8 w-16 h-16 rounded-2xl shadow-lg" />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Join an Organization</h1>
          <p className="text-muted-foreground">
            Enter the 6-character code shared by your admin
          </p>
        </div>

        {resolveError && (
          <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Invalid code</p>
              <p className="text-sm text-muted-foreground mt-1">
                This code is invalid or has been disabled. Please check with your admin.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleLookup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="joinCode" className="text-sm font-medium">
              Join Code
            </Label>
            <Input
              id="joinCode"
              type="text"
              placeholder="ABC123"
              value={code}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                setCode(val);
                // Clear previous error
                if (resolveError && val !== submittedCode) setSubmittedCode('');
              }}
              className="h-14 text-center text-2xl font-mono tracking-[0.3em] bg-secondary/50 border-border/50 focus:border-primary"
              maxLength={6}
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="w-full h-12 hover:opacity-90 transition-opacity font-medium"
            disabled={code.length !== 6}
          >
            Look Up Organization
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have a code?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  // Loading state
  if (resolving) {
    return (
      <div className="animate-in-up flex flex-col items-center gap-4 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Looking up code...</p>
      </div>
    );
  }

  // Resolved: show org name + join button
  if (resolved) {
    return (
      <div className="animate-in-up">
        <button
          onClick={() => { setSubmittedCode(''); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Try a different code
        </button>

        <Image src="/logo.png" alt="Ledgly" width={64} height={64} className="mx-auto mb-8 w-16 h-16 rounded-2xl shadow-lg" />

        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Join {resolved.orgName}?</h1>
          <p className="text-muted-foreground text-sm">
            You&apos;ll be added as a member of this organization.
          </p>
        </div>

        {isLoggedIn ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-secondary/30 p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Signed in as {user.name || user.email}</p>
              </div>
            </div>
            <Button
              onClick={handleJoin}
              className="w-full h-12 hover:opacity-90 transition-opacity font-medium"
              disabled={joinOrg.isPending}
            >
              {joinOrg.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                'Join Organization'
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Link href={`/login?joinCode=${submittedCode}`}>
              <Button className="w-full h-12 hover:opacity-90 transition-opacity font-medium">
                Sign in to join
              </Button>
            </Link>
            <Link href={`/register?joinCode=${submittedCode}`}>
              <Button variant="outline" className="w-full h-12 font-medium">
                Create account to join
              </Button>
            </Link>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
