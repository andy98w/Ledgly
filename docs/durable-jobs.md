# Durable Gmail ingestion and payment notifications

Implemented on `codex/durable-payment-jobs`; not deployed to the public service.
The pipeline uses the existing PostgreSQL database, without Redis or a broker.

## What commits together

Incoming Gmail payment, charge allocations, import record, audit record, in-app
notice and per-destination notification jobs commit in one transaction. Outgoing
expense and import/audit records also commit together. Imports serialize per
organization and recheck the connection/message identity under the lock.
Matching reads use the transaction, and allocation locks follow sorted charge IDs.
A concurrent delivery or replay of the same connection/message cannot create
another financial record. This is message-level deduplication: different emails
about the same bank transaction are not automatically the same event.

Manual payment creation, including the keyed API path, now commits the audit and
payment notices with the payment. Keyed requests still require explicit allocation.
Notification generation replaces the old best-effort payment broadcast. Existing
reminders, weekly reports and authentication emails are outside this change.

## Discovery and workers

With `DURABLE_GMAIL_ENABLED=true`, scheduled sync, OAuth initial sync and the
sync button enqueue discovery jobs. Requests within the same minute share a key.
Discovery processes 50 messages per page and atomically records message jobs plus
the next page, rather than stopping after the legacy 200-message limit. Each scan
has a separate continuation identity. Jobs hold connection/message IDs, not OAuth
tokens or raw email bodies. Connections are checked against the job organization.

The UI reports queued work rather than zero imports. Refresh the payments page to
see the results. `lastSyncAt` indicates completed discovery, not completion of all
message jobs; check the job status endpoint for pending/failed imports.

Workers poll every second while enabled. Each process runs at most one Gmail tick
and one notification tick at a time. PostgreSQL `FOR UPDATE SKIP LOCKED` permits
multiple processes to claim different jobs. The queue separates scan, message,
notification and test job kinds. Google requests have 15-second timeouts;
notification requests have 10-second timeouts and refuse redirects.

Claims lease work for 60 seconds and renew every 20 seconds. Five attempts exhaust
a job; failures back off by 2^attempt seconds (capped at 300). Expired leases are
reclaimed, including moving a crashed final attempt to failed. Old lease tokens
cannot acknowledge or reschedule work. Handler side effects still need their own
idempotency: leases do not provide exactly-once execution.

## Notification delivery contract

One job is created for each active Slack, Discord or GroupMe destination at the
time the payment commits. Retry of a failed destination does not requeue successful
destinations. Payloads contain the rendered payment message and connection ID;
credentials are resolved only at delivery time. A disconnected/deleted destination
is suppressed. Slack/Discord URLs must use their official HTTPS webhook hosts.
Provider non-2xx responses and timeouts are failures, not successful deliveries.

These webhook integrations provide **at-least-once attempts**, not exactly-once
messages. A provider may accept a message before the worker crashes or loses its
response; retry may duplicate it. Manual replay has the same limitation. We do
not send a made-up idempotency header and claim that a provider deduplicates it.

## Operating and rollout

1. Apply migrations and regenerate Prisma in staging.
2. Enable `DURABLE_GMAIL_ENABLED=true` and `DURABLE_NOTIFICATIONS_ENABLED=true`
   together after verifying test connections. Both default off. With notification
   delivery off, financial writes still persist notices; delivery waits in the queue.
3. Use authenticated organization ADMIN/TREASURER requests (OWNER inherits ADMIN):
   - `GET /api/v1/organizations/:orgId/jobs` — latest 100 jobs, no payloads.
   - `GET /api/v1/organizations/:orgId/jobs/health` — counts by kind/status and oldest
     pending/running age. Alert on failed jobs or sustained increasing age.
   - `POST /api/v1/organizations/:orgId/jobs/:id/replay` — failed jobs only, scoped
     to the organization, with an atomic audit record naming the operator.
4. Reconnect expired Google credentials before replaying failed discovery/message
   jobs. Review notification replay for possible duplicate delivery.
5. To pause, set both flags false. In-flight work may finish; queued work persists.
   Gmail requests use the legacy synchronous path while its flag is false. Restore
   the flags to resume pending work. Avoid deleting queue rows during rollback.

There is deliberately no automatic job/request-key deletion. Keeping terminal rows
preserves deduplication; retention/payload redaction requires a separately designed
policy. Job payloads are private operational data. Health endpoints are monitoring
inputs; this branch does not provision an external alert receiver or run live drills.

## Reproducing verification

Use an empty disposable PostgreSQL database named `ledgly_test` on localhost;
set DATABASE_URL and DIRECT_DATABASE_URL to that same test database. Never use
real customer records. The CI workflow provisions PostgreSQL 16.

```sh
pnpm --filter @ledgly/api exec prisma generate
pnpm --filter @ledgly/api exec prisma migrate deploy
pnpm --filter @ledgly/api exec tsc --noEmit
pnpm --filter @ledgly/api exec tsc -p tsconfig.reliability.json
pnpm --filter @ledgly/api exec jest --runInBand payment-reliability.spec.ts durable-jobs.spec.ts gmail-reliability.spec.ts
```

The recovery script (`apps/api/scripts/recovery-drill.cjs`) additionally requires
`PG_CONTAINER` naming the disposable Docker PostgreSQL container. From apps/api,
run `node scripts/recovery-drill.cjs`. It kills a child process with SIGKILL after
payment commit but before acknowledgement, stops/restarts the test database to
verify queue operations fail during the outage, dumps the source database, restores to
a new `ledgly_restore_test`, and replays the restored job. It compares payment
count/total, audit, notification, job and idempotency-request counts. It refuses
other source URLs and will not overwrite an existing restore database. Lease time
is advanced in the restored fixture to avoid a 60-second wait.

The drill validates the fixture's restoration, not production backup scheduling,
production RTO/RPO, cloud failover or sustained uptime. Provider calls in tests are
synthetic; no Gmail account or real notification recipient is contacted.
