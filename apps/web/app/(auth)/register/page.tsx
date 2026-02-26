'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Loader2, Mail, AlertCircle } from 'lucide-react';
import { useRegister, useResolveInvite } from '@/lib/queries/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

function RegisterForm() {
  const router = useRouter();
  const { toast } = useToast();
  const register = useRegister();
  const searchParams = useSearchParams();

  const inviteToken = searchParams.get('invite');
  const legacyEmail = searchParams.get('email') || '';

  const { data: inviteData, isLoading: inviteLoading, error: inviteError } = useResolveInvite(inviteToken);

  const resolvedEmail = inviteData?.email || legacyEmail;
  const isInvite = !!inviteToken || !!legacyEmail;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Set email from resolved invite or legacy param
  useEffect(() => {
    if (inviteData?.email) {
      setEmail(inviteData.email);
    } else if (legacyEmail) {
      setEmail(legacyEmail);
    }
  }, [inviteData?.email, legacyEmail]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      toast({
        title: 'Weak password',
        description: 'Must be 8+ characters with uppercase, lowercase, and a number',
        variant: 'destructive',
      });
      return;
    }

    try {
      const data = await register.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      if (data.user.memberships.length > 0) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    } catch (error: any) {
      toast({
        title: 'Registration failed',
        description: error.message || 'Could not create account',
        variant: 'destructive',
      });
    }
  };

  // Loading state while resolving invite token
  if (inviteToken && inviteLoading) {
    return (
      <div className="animate-in-up flex flex-col items-center gap-4 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading invitation...</p>
      </div>
    );
  }

  // Error state for invalid/expired invite
  if (inviteToken && inviteError) {
    return (
      <div className="animate-in-up">
        <Image src="/logo.png" alt="Ledgly" width={64} height={64} className="mx-auto mb-8 w-16 h-16 rounded-2xl shadow-lg" />
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Invalid invitation</p>
            <p className="text-sm text-muted-foreground mt-1">
              This invitation link is invalid or has expired. Please ask the admin to resend your invitation.
            </p>
          </div>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in-up">
      {/* Logo */}
      <div className="w-16 h-16 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg">
        <span className="text-primary-foreground font-bold text-2xl">L</span>
      </div>

      {isInvite && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm text-foreground">
            You've been invited to join{inviteData?.orgName ? <> <strong>{inviteData.orgName}</strong></> : ' an organization'}. Create your account to get started.
          </p>
        </div>
      )}

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Create an account</h1>
        <p className="text-muted-foreground">
          Get started with Ledgly
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Full name
          </Label>
          <Input
            id="name"
            type="text"
            placeholder="Jane Smith"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 bg-secondary/50 border-border/50 focus:border-primary"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 bg-secondary/50 border-border/50 focus:border-primary"
            required
            readOnly={!!resolvedEmail}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="8+ chars, uppercase, lowercase, number"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 bg-secondary/50 border-border/50 focus:border-primary"
            required
            minLength={8}
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 bg-gradient-to-r from-primary to-blue-400 hover:opacity-90 transition-opacity font-medium"
          disabled={register.isPending}
        >
          {register.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            <>
              Create Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
