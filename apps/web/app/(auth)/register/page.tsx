'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Loader2, Mail, AlertCircle, Eye, EyeOff, Check, X, Users } from 'lucide-react';
import { useRegister, useResolveInvite, useResendVerification } from '@/lib/queries/auth';
import { useResolveJoinCode } from '@/lib/queries/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

function RegisterForm() {
  const { toast } = useToast();
  const register = useRegister();
  const resendVerification = useResendVerification();
  const searchParams = useSearchParams();

  const inviteToken = searchParams.get('invite');
  const legacyEmail = searchParams.get('email') || '';
  const joinCode = searchParams.get('joinCode') || (typeof window !== 'undefined' ? localStorage.getItem('ledgly_pending_join') : null);

  const { data: inviteData, isLoading: inviteLoading, error: inviteError } = useResolveInvite(inviteToken);
  const { data: joinCodeData } = useResolveJoinCode(joinCode);

  const resolvedEmail = inviteData?.email || legacyEmail;
  const isInvite = !!inviteToken || !!legacyEmail;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const passwordChecks = useMemo(() => ({
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  }), [password]);

  const passwordScore = Object.values(passwordChecks).filter(Boolean).length;

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

      setPendingEmail(data.email);
    } catch (error: any) {
      toast({
        title: 'Registration failed',
        description: error.message || 'Could not create account',
        variant: 'destructive',
      });
    }
  };

  // Pending email verification screen
  if (pendingEmail) {
    return (
      <div className="text-center animate-in-up">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <Mail className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-muted-foreground mb-6">
          We sent a verification link to{' '}
          <span className="text-foreground font-medium">{pendingEmail}</span>
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Click the link in your email to activate your account. The link expires in 24 hours.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            resendVerification.mutate(pendingEmail, {
              onSuccess: () => toast({ title: 'Verification email resent' }),
              onError: () => toast({ title: 'Could not resend', variant: 'destructive' }),
            });
          }}
          disabled={resendVerification.isPending}
          className="w-full mb-3"
        >
          {resendVerification.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resending...
            </>
          ) : (
            'Resend verification email'
          )}
        </Button>
        <Link href="/login" className="text-sm text-primary font-medium hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

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
      <Image src="/logo.png" alt="Ledgly" width={64} height={64} className="mx-auto mb-8 w-16 h-16 rounded-2xl shadow-lg" />

      {isInvite && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm text-foreground">
            You've been invited to join{inviteData?.orgName ? <> <strong>{inviteData.orgName}</strong></> : ' an organization'}. Create your account to get started.
          </p>
        </div>
      )}

      {joinCode && joinCodeData && !isInvite && (
        <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <Users className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm text-foreground">
            Create your account to join <strong>{joinCodeData.orgName}</strong>.
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
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="8+ chars, uppercase, lowercase, number"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-secondary/50 border-border/50 focus:border-primary pr-10"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i < passwordScore
                        ? passwordScore <= 1 ? 'bg-destructive' : passwordScore <= 2 ? 'bg-warning' : passwordScore <= 3 ? 'bg-amber-500' : 'bg-success'
                        : 'bg-muted'
                    }`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { key: 'length', label: '8+ characters' },
                  { key: 'uppercase', label: 'Uppercase' },
                  { key: 'lowercase', label: 'Lowercase' },
                  { key: 'number', label: 'Number' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-1.5 text-xs">
                    {passwordChecks[key as keyof typeof passwordChecks] ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <X className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className={passwordChecks[key as keyof typeof passwordChecks] ? 'text-success' : 'text-muted-foreground'}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-12 hover:opacity-90 transition-opacity font-medium"
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
