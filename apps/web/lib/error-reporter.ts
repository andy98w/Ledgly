import * as Sentry from '@sentry/nextjs';

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN && error instanceof Error) {
    Sentry.captureException(error, { extra: context });
  }
  console.error('[Ledgly Error]', {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
    timestamp: new Date().toISOString(),
  });
}
