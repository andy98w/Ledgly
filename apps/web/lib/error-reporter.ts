/**
 * Centralized error reporter — logs to console by default.
 * Replace the body with Sentry.captureException() or similar in production.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  console.error('[Ledgly Error]', {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
    timestamp: new Date().toISOString(),
  });
}
