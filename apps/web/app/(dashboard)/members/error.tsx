'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/error-reporter';

function isNetworkError(error: Error): boolean {
  return (
    error.name === 'TypeError' && error.message.toLowerCase().includes('fetch')
  );
}

export default function MembersError({
  error,
  reset,
}: {
  error: Error & { digest?: string; statusCode?: number };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: 'members' });
  }, [error]);

  const network = isNetworkError(error);
  const Icon = network ? WifiOff : AlertCircle;

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="rounded-xl border bg-card p-8 text-center max-w-md">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <Icon className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold mb-2">
          {network ? 'Connection problem' : 'Failed to load members'}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {network
            ? 'Unable to reach the server. Check your internet connection and try again.'
            : error.message || 'Could not load members data. Please try again.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset} variant="outline">
            Try Again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
