'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { XCircle, Loader2 } from 'lucide-react';
import { useVerifyEmail, useResendVerification } from '@/lib/queries/auth';
import { getPostLoginRedirect } from '@/lib/utils/auth-redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

function VerifyEmailContent() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const verifyEmail = useVerifyEmail();
  const resendVerification = useResendVerification();
  const [error, setError] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState('');

  useEffect(() => {
    if (!token) {
      setError('No verification token provided');
      return;
    }

    verifyEmail.mutate(token, {
      onSuccess: (data) => {
        router.push(getPostLoginRedirect(data.user));
      },
      onError: (err: any) => {
        setError(err.message || 'Invalid or expired verification link');
      },
    });
  }, [token]);

  if (error) {
    return (
      <div className="text-center animate-in-up">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="your@email.com"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              className="h-10 bg-secondary/50 border-border/50 focus:border-primary"
            />
            <Button
              variant="outline"
              onClick={() => {
                if (!resendEmail.trim()) return;
                resendVerification.mutate(resendEmail.trim(), {
                  onSuccess: () => toast({ title: 'Verification email resent' }),
                  onError: () => toast({ title: 'Could not resend', variant: 'destructive' }),
                });
              }}
              disabled={resendVerification.isPending || !resendEmail.trim()}
            >
              {resendVerification.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resend'}
            </Button>
          </div>
          <Button className="w-full" onClick={() => router.push('/login')}>
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <Skeleton className="w-16 h-16 mx-auto rounded-full" />
      <Skeleton className="h-6 w-32 mx-auto" />
      <Skeleton className="h-4 w-48 mx-auto" />
      <p className="text-sm text-muted-foreground">
        Verifying your email...
      </p>
    </div>
  );
}

function VerifyEmailLoading() {
  return (
    <div className="text-center space-y-4">
      <Skeleton className="w-16 h-16 mx-auto rounded-full" />
      <Skeleton className="h-6 w-32 mx-auto" />
      <Skeleton className="h-4 w-48 mx-auto" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailLoading />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
