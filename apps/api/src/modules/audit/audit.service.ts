import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateAuditLogDto {
  orgId: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  diffJson?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAuditLogDto) {
    return this.prisma.auditLog.create({
      data: {
        orgId: data.orgId,
        actorId: data.actorId,
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
        diffJson: data.diffJson,
      },
    });
  }

  async findByOrg(
    orgId: string,
    options: {
      entityType?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { entityType, limit = 50, offset = 0 } = options;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          orgId,
          ...(entityType && { entityType }),
        },
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
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({
        where: {
          orgId,
          ...(entityType && { entityType }),
        },
      }),
    ]);

    return {
      data: data.map((log) => ({
        id: log.id,
        entityType: log.entityType,
        entityId: log.entityId,
        action: log.action,
        diffJson: log.diffJson,
        createdAt: log.createdAt,
        actor: {
          id: log.actor.id,
          name: log.actor.name || log.actor.user?.name || log.actor.user?.email || 'Unknown',
        },
      })),
      total,
      limit,
      offset,
    };
  }

  // Helper to log common actions
  async logCreate(orgId: string, actorId: string, entityType: string, entityId: string, data?: Record<string, any>) {
    return this.create({
      orgId,
      actorId,
      entityType,
      entityId,
      action: 'CREATE',
      diffJson: data ? { new: data } : undefined,
    });
  }

  async logUpdate(orgId: string, actorId: string, entityType: string, entityId: string, before: Record<string, any>, after: Record<string, any>) {
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
    });
  }

  async logDelete(orgId: string, actorId: string, entityType: string, entityId: string, data?: Record<string, any>) {
    return this.create({
      orgId,
      actorId,
      entityType,
      entityId,
      action: 'DELETE',
      diffJson: data ? { deleted: data } : undefined,
    });
  }
}
