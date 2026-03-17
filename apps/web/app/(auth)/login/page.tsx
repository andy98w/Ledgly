'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Loader2, Mail, ArrowLeft, Building2, Eye, EyeOff } from 'lucide-react';
import { useLogin, useSendMagicLink, useForgotPassword } from '@/lib/queries/auth';
import { useJoinOrganization } from '@/lib/queries/organizations';
import { useAuthStore } from '@/lib/stores/auth';
import { getPostLoginRedirect } from '@/lib/utils/auth-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

type LoginView = 'login' | 'forgot-password' | 'forgot-password-sent' | 'magic-link-sent' | 'forgot-org' | 'forgot-org-sent';

function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const login = useLogin();
  const sendMagicLink = useSendMagicLink();
  const forgotPassword = useForgotPassword();
  const joinOrg = useJoinOrganization();
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const searchParams = useSearchParams();
  const joinCode = searchParams.get('joinCode') || (typeof window !== 'undefined' ? localStorage.getItem('ledgly_pending_join') : null);

  const [view, setView] = useState<LoginView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    try {
      const data = await login.mutateAsync({ email: email.trim(), password });

      // Auto-join if joinCode param present
      if (joinCode) {
        try {
          const result = await joinOrg.mutateAsync(joinCode);
          setCurrentOrgId(result.orgId);
          try { localStorage.removeItem('ledgly_pending_join'); } catch {}
          toast({ title: result.status === 'PENDING' ? 'Join request sent!' : `Joined ${result.orgName}!` });
          window.location.href = '/portal';
          return;
        } catch {
          try { localStorage.removeItem('ledgly_pending_join'); } catch {}
        }
      }

      router.push(getPostLoginRedirect(data.user));
    } catch (error: any) {
      toast({
        title: 'Sign in failed',
        description: error.message || 'Invalid email or password',
        variant: 'destructive',
      });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    try {
      await forgotPassword.mutateAsync(resetEmail.trim());
      setView('forgot-password-sent');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send reset link',
        variant: 'destructive',
      });
    }
  };

  const handleForgotOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    try {
      await sendMagicLink.mutateAsync(resetEmail.trim());
      setView('forgot-org-sent');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send magic link',
        variant: 'destructive',
      });
    }
  };

  const backToLogin = () => {
    setView('login');
    setResetEmail('');
  };

  // Forgot password — email sent confirmation
  if (view === 'forgot-password-sent') {
    return (
      <div className="text-center animate-in-up">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <Mail className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-muted-foreground mb-6">
          If an account exists for{' '}
          <span className="text-foreground font-medium">{resetEmail}</span>,
          we sent a password reset link.
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          The link expires in 15 minutes. Check your spam folder if you don&apos;t see it.
        </p>
        <Button variant="outline" onClick={backToLogin} className="w-full">
          Back to sign in
        </Button>
      </div>
    );
  }

  // Forgot org — magic link sent confirmation
  if (view === 'forgot-org-sent') {
    return (
      <div className="text-center animate-in-up">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <Mail className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-muted-foreground mb-6">
          We sent a magic link to{' '}
          <span className="text-foreground font-medium">{resetEmail}</span>
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          After verifying, you&apos;ll see all organizations linked to your account.
        </p>
        <Button variant="outline" onClick={backToLogin} className="w-full">
          Back to sign in
        </Button>
      </div>
    );
  }

  // Forgot password — enter email form
  if (view === 'forgot-password') {
    return (
      <div className="animate-in-up">
        <button onClick={backToLogin} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Reset your password</h1>
          <p className="text-muted-foreground text-sm">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
        </div>
        <form onSubmit={handleForgotPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resetEmail" className="text-sm font-medium">
              Email address
            </Label>
            <Input
              id="resetEmail"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="h-12 bg-secondary/50 border-border/50 focus:border-primary"
              required
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="w-full h-12 hover:opacity-90 transition-opacity font-medium"
            disabled={forgotPassword.isPending}
          >
            {forgotPassword.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send reset link'
            )}
          </Button>
        </form>
      </div>
    );
  }

  // Forgot org — enter email form
  if (view === 'forgot-org') {
    return (
      <div className="animate-in-up">
        <button onClick={backToLogin} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Find your organizations</h1>
          <p className="text-muted-foreground text-sm">
            We&apos;ll send a magic link to your email. After verifying, you&apos;ll see all your organizations.
          </p>
        </div>
        <form onSubmit={handleForgotOrg} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgEmail" className="text-sm font-medium">
              Email address
            </Label>
            <Input
              id="orgEmail"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="h-12 bg-secondary/50 border-border/50 focus:border-primary"
              required
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="w-full h-12 hover:opacity-90 transition-opacity font-medium"
            disabled={sendMagicLink.isPending}
          >
            {sendMagicLink.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send magic link'
            )}
          </Button>
        </form>
      </div>
    );
  }

  // Default: Login form
  return (
    <div className="animate-in-up">
      <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      {/* Logo */}
      <Image src="/logo.png" alt="Ledgly" width={64} height={64} className="mx-auto mb-8 w-16 h-16 rounded-2xl shadow-lg" />

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
        <p className="text-muted-foreground">
          Sign in to your Ledgly account
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
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
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              Password
            </Label>
            <button
              type="button"
              onClick={() => { setResetEmail(email); setView('forgot-password'); }}
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-secondary/50 border-border/50 focus:border-primary pr-10"
              required
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
        </div>

        <Button
          type="submit"
          className="w-full h-12 hover:opacity-90 transition-opacity font-medium"
          disabled={login.isPending}
        >
          {login.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Sign up
        </Link>
      </div>

      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={() => setView('forgot-org')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          <Building2 className="h-3 w-3" />
          Forgot which organization you&apos;re in?
        </button>
      </div>

    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
