'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { useResetPassword } from '@/lib/queries/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();
  const resetPassword = useResetPassword();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="text-center animate-in-up">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Invalid Reset Link</h2>
        <p className="text-sm text-muted-foreground mb-6">
          This password reset link is missing or invalid.
        </p>
        <Button className="w-full" onClick={() => router.push('/login')}>
          Back to Sign In
        </Button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center animate-in-up">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Password Reset</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Your password has been reset successfully. You can now sign in with your new password.
        </p>
        <Button
          className="w-full hover:opacity-90"
          onClick={() => router.push('/login')}
        >
          Sign In
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center animate-in-up">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Reset Failed</h2>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <div className="space-y-3">
          <Link href="/login" className="block">
            <Button variant="outline" className="w-full">
              Request a new link
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    try {
      await resetPassword.mutateAsync({ token, password });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    }
  };

  return (
    <div className="animate-in-up">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Set new password</h1>
        <p className="text-muted-foreground text-sm">
          Choose a strong password for your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            New Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-secondary/50 border-border/50 focus:border-primary pr-10"
              required
              minLength={8}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Must contain uppercase, lowercase, and a number
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">
            Confirm Password
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Repeat your password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-12 bg-secondary/50 border-border/50 focus:border-primary"
            required
            minLength={8}
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 hover:opacity-90 transition-opacity font-medium"
          disabled={resetPassword.isPending || !password || !confirmPassword}
        >
          {resetPassword.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            'Reset Password'
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

function ResetPasswordLoading() {
  return (
    <div className="text-center space-y-4">
      <Skeleton className="h-8 w-48 mx-auto" />
      <Skeleton className="h-4 w-64 mx-auto" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
