import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

const auditSourceContext = new AsyncLocalStorage<{ source: string }>();

export interface CreateAuditLogDto {
  orgId: string;
  actorId?: string;
  entityType: string;
  entityId: string;
  action: string;
  diffJson?: Record<string, any>;
  batchId?: string;
  batchDescription?: string;
  source?: string;
}

export interface BatchContext {
  batchId: string;
  batchDescription: string;
  source?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Run a callback with a source tag that automatically applies to all audit entries created within. */
  runWithSource<T>(source: string, fn: () => Promise<T>): Promise<T> {
    return auditSourceContext.run({ source }, fn);
  }

  async create(data: CreateAuditLogDto) {
    const ctx = auditSourceContext.getStore();
    return this.prisma.auditLog.create({
      data: {
        orgId: data.orgId,
        actorId: data.actorId,
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
        diffJson: data.diffJson,
        batchId: data.batchId,
        batchDescription: data.batchDescription,
        source: data.source || ctx?.source,
      },
    });
  }

  async findById(orgId: string, logId: string) {
    return this.prisma.auditLog.findFirst({
      where: { orgId, id: logId },
    });
  }

  // Create a batch context for grouping multiple audit logs
  createBatchContext(description: string, source?: string): BatchContext {
    return {
      batchId: randomBytes(8).toString('hex'),
      batchDescription: description,
      source,
    };
  }

  async findByOrg(
    orgId: string,
    options: {
      entityType?: string;
      source?: string;
      limit?: number;
      offset?: number;
      cursor?: string;
      groupByBatch?: boolean;
    } = {},
  ) {
    const { entityType, source, limit = 50, offset = 0, cursor, groupByBatch = true } = options;

    const whereClause = {
      orgId,
      ...(entityType && { entityType }),
      ...(source === 'LEDGLY_AI' && { source: 'LEDGLY_AI' }),
      ...(source === 'MANUAL' && { source: null }),
    };

    const includeOpts = {
      actor: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
    };

    // Cursor-based pagination mode
    if (cursor) {
      const items = await this.prisma.auditLog.findMany({
        where: whereClause,
        include: includeOpts,
        cursor: { id: cursor },
        skip: 1,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
      });

      const hasMore = items.length > limit;
      const data = items.slice(0, limit);
      const total = await this.prisma.auditLog.count({ where: whereClause });

      const formattedData = data.map((log) => ({
        id: log.id, entityType: log.entityType, entityId: log.entityId, action: log.action,
        diffJson: log.diffJson, batchId: log.batchId, batchDescription: log.batchDescription,
        undone: log.undone, undoneAt: log.undoneAt, source: log.source, createdAt: log.createdAt,
        actor: log.actor ? { id: log.actor.id, name: log.actor.name || log.actor.user?.name || log.actor.user?.email || 'Unknown' } : null,
      }));

      return {
        data: formattedData,
        total,
        limit,
        nextCursor: hasMore ? formattedData[formattedData.length - 1]?.id : null,
        hasMore,
      };
    }

    // Offset-based pagination mode (default)
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: whereClause,
        include: includeOpts,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where: whereClause }),
    ]);

    const formattedData = data.map((log) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      diffJson: log.diffJson,
      batchId: log.batchId,
      batchDescription: log.batchDescription,
      undone: log.undone,
      undoneAt: log.undoneAt,
      source: log.source,
      createdAt: log.createdAt,
      actor: log.actor ? {
        id: log.actor.id,
        name: log.actor.name || log.actor.user?.name || log.actor.user?.email || 'Unknown',
      } : null,
    }));

    // Group by batch if requested
    if (groupByBatch) {
      const grouped: Record<string, typeof formattedData> = {};
      const standalone: typeof formattedData = [];

      for (const log of formattedData) {
        if (log.batchId) {
          if (!grouped[log.batchId]) {
            grouped[log.batchId] = [];
          }
          grouped[log.batchId].push(log);
        } else {
          standalone.push(log);
        }
      }

      // Convert grouped logs into batch entries
      const batched = Object.entries(grouped).map(([batchId, logs]) => ({
        id: batchId,
        isBatch: true,
        batchDescription: logs[0]?.batchDescription || 'Batch operation',
        itemCount: logs.length,
        entityType: logs[0]?.entityType || 'BATCH',
        action: logs[0]?.action || 'BATCH',
        undone: logs.every(l => l.undone),
        source: logs[0]?.source,
        createdAt: logs[0]?.createdAt,
        actor: logs[0]?.actor,
        items: logs,
      }));

      // Merge and sort by createdAt
      const combined = [
        ...batched.map(b => ({ ...b, sortDate: b.createdAt })),
        ...standalone.map(s => ({ ...s, isBatch: false, items: undefined, itemCount: 1, sortDate: s.createdAt })),
      ].sort((a, b) => new Date(b.sortDate!).getTime() - new Date(a.sortDate!).getTime());

      return {
        data: combined,
        total,
        limit,
        offset,
      };
    }

    return {
      data: formattedData,
      total,
      limit,
      offset,
    };
  }

  // Find all logs in a batch
  async findByBatchId(orgId: string, batchId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { orgId, batchId },
      include: {
        actor: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((log) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      diffJson: log.diffJson,
      undone: log.undone,
      createdAt: log.createdAt,
      actor: log.actor ? {
        id: log.actor.id,
        name: log.actor.name || log.actor.user?.name || log.actor.user?.email || 'Unknown',
      } : null,
    }));
  }

  // Helper to log common actions
  async logCreate(
    orgId: string,
    actorId: string | undefined,
    entityType: string,
    entityId: string,
    data?: Record<string, any>,
    batch?: BatchContext,
  ) {
    return this.create({
      orgId,
      actorId,
      entityType,
      entityId,
      action: 'CREATE',
      diffJson: data ? { new: data } : undefined,
      ...batch,
    });
  }

  async logUpdate(
    orgId: string,
    actorId: string | undefined,
    entityType: string,
    entityId: string,
    before: Record<string, any>,
    after: Record<string, any>,
    batch?: BatchContext,
  ) {
    // Only include fields that changed
    const changes: Record<string, { from: any; to: any }> = {};
    for (const key of Object.keys(after)) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { from: before[key], to: after[key] };
      }
    }

    if (Object.keys(changes).length === 0) {
      return null; // No changes to log
    }

    return this.create({
      orgId,
      actorId,
      entityType,
      entityId,
      action: 'UPDATE',
      diffJson: changes,
      ...batch,
    });
  }

  async logDelete(
    orgId: string,
    actorId: string | undefined,
    entityType: string,
    entityId: string,
    data?: Record<string, any>,
    batch?: BatchContext,
  ) {
    return this.create({
      orgId,
      actorId,
      entityType,
      entityId,
      action: 'DELETE',
      diffJson: data ? { deleted: data } : undefined,
      ...batch,
    });
  }

  // Mark audit log entries as undone
  async markAsUndone(orgId: string, logIds: string[]) {
    return this.prisma.auditLog.updateMany({
      where: {
        orgId,
        id: { in: logIds },
      },
      data: {
        undone: true,
        undoneAt: new Date(),
      },
    });
  }

  // Mark a whole batch as undone
  async markBatchAsUndone(orgId: string, batchId: string) {
    return this.prisma.auditLog.updateMany({
      where: {
        orgId,
        batchId,
      },
      data: {
        undone: true,
        undoneAt: new Date(),
      },
    });
  }

  // Mark audit log entries as redone (reverse an undo)
  async markAsRedone(orgId: string, logIds: string[]) {
    return this.prisma.auditLog.updateMany({
      where: {
        orgId,
        id: { in: logIds },
      },
      data: {
        undone: false,
        undoneAt: null,
      },
    });
  }

  // Mark a whole batch as redone
  async markBatchAsRedone(orgId: string, batchId: string) {
    return this.prisma.auditLog.updateMany({
      where: {
        orgId,
        batchId,
      },
      data: {
        undone: false,
        undoneAt: null,
      },
    });
  }
}
