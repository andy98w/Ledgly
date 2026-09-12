# Durable payment job experiment

This is an internal queue and worker foundation on `codex/durable-payment-jobs`.
It is **not wired into the live Gmail scheduler or exposed through HTTP**. The
existing Gmail sync catches some provider/message failures and returns success;
it needs explicit partial-failure reporting and per-message idempotency review
before a queue can safely replace that path.

## Contract

- PostgreSQL persists immutable job payloads and organization-scoped request keys.
  Reusing a key with different JSON returns a conflict; identical JSON replays
  the existing job ID, even after completion.
- Workers atomically claim one eligible row with `FOR UPDATE SKIP LOCKED`.
  The 60-second lease is renewed every 20 seconds by `runOne`.
- A crashed worker's lease expires and another worker can claim the job. Each
  claim gets a fresh token. Expired or superseded owners cannot acknowledge,
  renew, or requeue the job.
- Failed attempts use exponential delay (2^attempt seconds, capped at 300).
  Five claims exhaust the job. A crash on claim five is marked failed when the
  next worker polls. Explicit tenant-scoped replay resets a failed job only.
- Handlers must provide idempotent effects. Lease fencing protects queue state,
  **not an external side effect**. A stalled old handler can still run after its
  lease expires. Payment creation uses the immutable job ID as its idempotency
  key, so replay after commit reuses the existing payment and audit result.
- No raw exception messages are persisted; provider errors can contain secrets.
  Payloads are limited to 64 KiB, but can still contain private payment data.
  Restrict database access and never put real payloads in public test reports.

No new service dependency is added to Ledgly. Apply the migration and regenerate
Prisma before using the queue. The service is internal: its caller must authorize
organization access; this branch deliberately adds no public replay endpoint.
There is no automatic completed-job deletion because that would end deduplication.

## Verification

Use an empty, disposable PostgreSQL database named `ledgly_test` on localhost.
The test suites reject other hosts/database names. Both DATABASE_URL and
DIRECT_DATABASE_URL must reference that disposable instance.

```sh
pnpm --filter @ledgly/api exec prisma generate
pnpm --filter @ledgly/api exec prisma migrate deploy
pnpm --filter @ledgly/api exec tsc --noEmit
pnpm --filter @ledgly/api exec tsc -p tsconfig.reliability.json
pnpm --filter @ledgly/api exec jest --runInBand payment-reliability.spec.ts durable-jobs.spec.ts
```

The queue suite tests concurrent enqueue, payload conflicts, tenant separation,
12 competing claims for 8 jobs, expired-owner fencing, retry exhaustion, replay,
a crashed final attempt, and payment redelivery after commit without acknowledgement.
Lease expiry is advanced directly in the fixture; this is a deterministic crash
simulation, not a real killed-process or production-traffic measurement.

## Next production milestones

1. Give Gmail ingestion explicit retryable/terminal outcomes and prove each
   payment/expense import is idempotent across concurrent workers.
2. Integrate an authenticated producer and supervised worker behind a rollout flag.
3. Couple notification-outbox records to financial transactions; use provider
   idempotency where available and document possible duplicate email delivery.
4. Exercise actual process termination, database outage and backup/restore drills.
5. Add queue-age, retry and failed-job monitoring, replay audit history, retention
   policy, and measurements from sustained operation.

Do not claim exactly-once email delivery, production uptime, or disaster recovery
from these integration fixtures.
