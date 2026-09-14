import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface Job {
  id: string;
  org_id: string;
  request_key: string;
  payload: Record<string, unknown>;
  lease_token: string;
  attempts: number;
}

/** Internal queue: callers must authorize org access before enqueue/replay. */
@Injectable()
export class DurableJobsService {
  constructor(private readonly db: PrismaService) {}

  async enqueue(orgId: string, key: string, payload: Record<string, unknown>, kind = 'fixture', tx: Prisma.TransactionClient = this.db) {
    if (!/^[\w.:-]{8,128}$/.test(key)) throw new Error('Invalid job key');
    const encoded = JSON.stringify(payload);
    if (Buffer.byteLength(encoded) > 65536) throw new Error('Job payload too large');
    const rows = await tx.$queryRaw<{id: string}[]>`
      INSERT INTO durable_jobs(id, org_id, request_key, payload, kind)
      VALUES (${randomUUID()}, ${orgId}, ${key}, ${encoded}::jsonb, ${kind})
      ON CONFLICT (org_id, request_key) DO UPDATE SET request_key = EXCLUDED.request_key
      WHERE durable_jobs.payload = EXCLUDED.payload AND durable_jobs.kind = EXCLUDED.kind
      RETURNING id`;
    if (!rows.length) throw new ConflictException('Job key reused with different payload');
    return rows[0].id;
  }

  async claim(kind = 'fixture'): Promise<Job | null> {
    // A crashed final attempt must become inspectable, not stay running forever.
    await this.db.$executeRaw`
      UPDATE durable_jobs SET status='failed', lease_token=NULL, lease_until=NULL, updated_at=now()
      WHERE kind=${kind} AND status='running' AND lease_until <= now() AND attempts >= 5`;
    const rows = await this.db.$queryRaw<Job[]>`
      WITH candidate AS (
        SELECT id FROM durable_jobs WHERE kind=${kind} AND attempts < 5 AND
        ((status='pending' AND available_at <= now()) OR (status='running' AND lease_until <= now()))
        ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE durable_jobs j SET status='running', attempts=j.attempts+1,
        lease_token=${randomUUID()}, lease_until=now()+interval '60 seconds', updated_at=now()
      FROM candidate c WHERE j.id=c.id RETURNING j.*`;
    return rows[0] || null;
  }

  async renew(job: Job) {
    return (await this.db.$executeRaw`
      UPDATE durable_jobs SET lease_until=now()+interval '60 seconds', updated_at=now()
      WHERE id=${job.id} AND org_id=${job.org_id} AND status='running'
      AND lease_token=${job.lease_token} AND lease_until > now()`) === 1;
  }

  async complete(job: Job) {
    return (await this.db.$executeRaw`
      UPDATE durable_jobs SET status='succeeded', lease_token=NULL, lease_until=NULL, updated_at=now()
      WHERE id=${job.id} AND org_id=${job.org_id} AND status='running'
      AND lease_token=${job.lease_token} AND lease_until > now()`) === 1;
  }

  async fail(job: Job) {
    const delay = Math.min(300, 2 ** job.attempts);
    return (await this.db.$executeRaw`
      UPDATE durable_jobs SET status=CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
        available_at=now()+${delay}*interval '1 second', lease_token=NULL, lease_until=NULL, updated_at=now()
      WHERE id=${job.id} AND org_id=${job.org_id} AND status='running'
      AND lease_token=${job.lease_token} AND lease_until > now()`) === 1;
  }

  async replay(orgId: string, id: string, kind = 'fixture') {
    return (await this.db.$executeRaw`
      UPDATE durable_jobs SET status='pending', attempts=0, available_at=now(), updated_at=now()
      WHERE id=${id} AND org_id=${orgId} AND kind=${kind} AND status='failed'`) === 1;
  }
}
