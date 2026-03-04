'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { XCircle, Building2, ChevronRight, Shield } from 'lucide-react';
import { useVerifyMagicLink } from '@/lib/queries/auth';
import { getPostLoginRedirect } from '@/lib/utils/auth-redirect';
import { useAuthStore } from '@/lib/stores/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuthUser } from '@ledgly/shared';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const verifyMagicLink = useVerifyMagicLink();
  const setCurrentOrgId = useAuthStore((s) => s.setCurrentOrgId);
  const [error, setError] = useState<string | null>(null);
  const [showOrgSelect, setShowOrgSelect] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No verification token provided');
      return;
    }

    verifyMagicLink.mutate(token, {
      onSuccess: (data) => {
        const authUser = data.user;
        if (authUser.memberships.length > 1) {
          setUser(authUser);
          setShowOrgSelect(true);
        } else {
          router.push(getPostLoginRedirect(authUser));
        }
      },
      onError: (err: any) => {
        setError(err.message || 'Invalid or expired link');
      },
    });
  }, [token]);

  if (error) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <Button className="w-full" onClick={() => router.push('/login')}>
          Back to Sign In
        </Button>
      </div>
    );
  }

  if (showOrgSelect && user) {
    return (
      <div className="animate-in-up">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-1">Choose an organization</h2>
          <p className="text-sm text-muted-foreground">
            You belong to {user.memberships.length} organizations. Select one to continue.
          </p>
        </div>
        <div className="space-y-2">
          {user.memberships.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setCurrentOrgId(m.orgId);
                const dest = (m.role === 'OWNER' || m.role === 'ADMIN' || m.role === 'TREASURER') ? '/dashboard' : '/portal';
                router.push(dest);
              }}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/60 hover:border-border transition-all group"
            >
              <div className="flex items-center gap-3 text-left">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{m.orgName}</p>
                  <Badge variant={m.role === 'OWNER' || m.role === 'ADMIN' ? 'outline' : 'secondary'} className="text-xs mt-1">
                    {(m.role === 'OWNER' || m.role === 'ADMIN') && <Shield className="h-3 w-3 mr-1" />}
                    {m.role === 'OWNER' ? 'Owner' : m.role === 'ADMIN' ? 'Admin' : m.role === 'TREASURER' ? 'Treasurer' : 'Member'}
                  </Badge>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
          ))}
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
        Verifying your sign-in link...
      </p>
    </div>
  );
}

function VerifyLoading() {
  return (
    <div className="text-center space-y-4">
      <Skeleton className="w-16 h-16 mx-auto rounded-full" />
      <Skeleton className="h-6 w-32 mx-auto" />
      <Skeleton className="h-4 w-48 mx-auto" />
      <p className="text-sm text-muted-foreground">
        Loading...
      </p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<VerifyLoading />}>
      <VerifyContent />
    </Suspense>
  );
}
