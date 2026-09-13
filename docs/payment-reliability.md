# Payment reliability

`POST /payments` accepts an optional `Idempotency-Key` header (8–128 letters,
numbers, dots, underscores, colons or hyphens). Keep the same key when retrying
the same submission. A changed payload with the same key returns 409.

Keys are scoped to an organization and this creation operation. The payment,
audit record and replay response commit in one PostgreSQL transaction. Keyed
creation deliberately leaves allocation to the explicit allocation endpoint;
it records in-app notices and per-channel outbox jobs atomically. Existing unkeyed clients retain the old flow.
This is not an exactly-once guarantee for Gmail ingestion or email delivery.

Payment allocation transactions use serializable isolation with four bounded
attempts on Prisma transaction conflicts. Amount checks run in the service,
not just the HTTP validator. Transactional charge-status audit writes roll back
with a failed allocation. Reducing a payment below its allocations is rejected.

The `Payment reliability` workflow uses an empty PostgreSQL 16 database named
`ledgly_test`. It checks migrations, compilation, concurrent duplicate creation,
replay, tenant boundaries and competing allocations. The integration test refuses
non-local database URLs or a different database name. Never run it against a
development database that contains real records.

These changes require the new migration before keyed requests can be used.
They have not been deployed to the public service. Request records currently
have no retention policy; deleting them would end the replay guarantee for
those keys. See `durable-jobs.md` for the implemented payment notification outbox and its rollout flags.
