import { DurableJobsService, Job } from './durable-jobs.service';

/** Handlers must make their effects idempotent; a lease is not exactly-once delivery. */
export async function runOne(queue: DurableJobsService, handler: (job: Job) => Promise<void>, kind = 'fixture') {
  const job = await queue.claim(kind);
  if (!job) return 'idle';
  let lostLease = false;
  const heartbeat = setInterval(() => {
    queue.renew(job).then(ok => { if (!ok) lostLease = true; }).catch(() => { lostLease = true; });
  }, 20000);
  try {
    await handler(job);
    if (lostLease) return 'lease-lost';
    return await queue.complete(job) ? 'succeeded' : 'lease-lost';
  } catch {
    // Do not persist provider errors: they can contain tokens or payment details.
    if (lostLease) return 'lease-lost';
    return await queue.fail(job) ? 'retry-or-failed' : 'lease-lost';
  } finally {
    clearInterval(heartbeat);
  }
}
