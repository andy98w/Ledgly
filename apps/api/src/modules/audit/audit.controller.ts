import { Controller, Get, Post, Param, Query, UseGuards, Inject, forwardRef, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';
import { ChargesService } from '../charges/charges.service';
import { ExpensesService } from '../expenses/expenses.service';
import { PaymentsService } from '../payments/payments.service';
import { MembersService } from '../members/members.service';

@Controller('organizations/:orgId/audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ChargesService))
    private readonly chargesService: ChargesService,
    @Inject(forwardRef(() => ExpensesService))
    private readonly expensesService: ExpensesService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    @Inject(forwardRef(() => MembersService))
    private readonly membersService: MembersService,
  ) {}

  @Get()
  @Roles('ADMIN', 'TREASURER')
  async getAuditLogs(
    @Param('orgId') orgId: string,
    @Query('entityType') entityType?: string,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.auditService.findByOrg(orgId, {
      entityType,
      source,
      limit: Math.min(Math.max(limit ? parseInt(limit, 10) || 50 : 50, 1), 200),
      offset: Math.max(offset ? parseInt(offset, 10) || 0 : 0, 0),
      cursor,
    });
  }

  private async undoSingle(orgId: string, log: any) {
    try {
      if (log.entityType === 'CHARGE') {
        if (log.action === 'CREATE') {
          await this.chargesService.void(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.chargesService.restore(orgId, log.entityId);
        }
      } else if (log.entityType === 'EXPENSE') {
        if (log.action === 'CREATE') {
          await this.expensesService.delete(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.expensesService.restore(orgId, log.entityId);
        }
      } else if (log.entityType === 'PAYMENT') {
        if (log.action === 'CREATE') {
          await this.paymentsService.delete(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.paymentsService.restore(orgId, log.entityId);
        }
      } else if (log.entityType === 'MEMBER') {
        if (log.action === 'CREATE') {
          await this.membersService.remove(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.membersService.restore(orgId, log.entityId);
        }
      } else if (log.entityType === 'ALLOCATION') {
        const diff = log.diffJson;
        if (log.action === 'CREATE' && diff?.new) {
          await this.paymentsService.removeAllocation(orgId, log.entityId);
        } else if (log.action === 'DELETE' && diff?.deleted) {
          await this.paymentsService.restoreAllocation(orgId, log.entityId, {
            paymentId: diff.deleted.paymentId,
            chargeId: diff.deleted.chargeId,
            amountCents: diff.deleted.amountCents,
            createdById: log.actorId,
          });
        }
      }
    } catch (e) {
      if (e instanceof NotFoundException) return; // Entity already handled by another operation
      throw e;
    }
  }

  private async redoSingle(orgId: string, log: any) {
    try {
      if (log.entityType === 'CHARGE') {
        if (log.action === 'CREATE') {
          await this.chargesService.restore(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.chargesService.void(orgId, log.entityId);
        }
      } else if (log.entityType === 'EXPENSE') {
        if (log.action === 'CREATE') {
          await this.expensesService.restore(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.expensesService.delete(orgId, log.entityId);
        }
      } else if (log.entityType === 'PAYMENT') {
        if (log.action === 'CREATE') {
          await this.paymentsService.restore(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.paymentsService.delete(orgId, log.entityId);
        }
      } else if (log.entityType === 'MEMBER') {
        if (log.action === 'CREATE') {
          await this.membersService.restore(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.membersService.remove(orgId, log.entityId);
        }
      } else if (log.entityType === 'ALLOCATION') {
        const diff = log.diffJson;
        if (log.action === 'CREATE' && diff?.new) {
          await this.paymentsService.restoreAllocation(orgId, log.entityId, {
            paymentId: diff.new.paymentId,
            chargeId: diff.new.chargeId,
            amountCents: diff.new.amountCents,
            createdById: log.actorId,
          });
        } else if (log.action === 'DELETE' && diff?.deleted) {
          await this.paymentsService.removeAllocation(orgId, log.entityId);
        }
      }
    } catch (e) {
      if (e instanceof NotFoundException) return; // Entity already handled by another operation
      throw e;
    }
  }

  @Post(':logId/undo')
  @Roles('ADMIN', 'TREASURER')
  async undoAuditLog(
    @Param('orgId') orgId: string,
    @Param('logId') logId: string,
    @CurrentUser() user: any,
  ) {
    // Lock the audit row to prevent concurrent undo/redo on the same log
    const [locked] = await this.prisma.$queryRaw<Array<{ id: string; undone: boolean }>>`
      SELECT id, undone FROM audit_logs
      WHERE id = ${logId} AND org_id = ${orgId}
      FOR UPDATE SKIP LOCKED
    `;

    if (!locked) {
      throw new ConflictException('This action is being processed by another request');
    }

    if (locked.undone) {
      throw new BadRequestException('This action has already been undone');
    }

    const log = await this.auditService.findById(orgId, logId);
    if (!log) {
      throw new NotFoundException('Audit log not found');
    }

    try {
      await this.undoSingle(orgId, log);
      await this.auditService.markAsUndone(orgId, [logId]);
      return { success: true, message: 'Action undone successfully' };
    } catch (error: any) {
      throw new BadRequestException(`Failed to undo: ${error.message}`);
    }
  }

  @Post('batch/:batchId/undo')
  @Roles('ADMIN', 'TREASURER')
  async undoBatch(
    @Param('orgId') orgId: string,
    @Param('batchId') batchId: string,
  ) {
    // Lock all batch rows to prevent concurrent batch undo
    const lockedRows = await this.prisma.$queryRaw<Array<{ id: string; undone: boolean }>>`
      SELECT id, undone FROM audit_logs
      WHERE batch_id = ${batchId} AND org_id = ${orgId}
      ORDER BY created_at DESC
      FOR UPDATE SKIP LOCKED
    `;

    if (!lockedRows || lockedRows.length === 0) {
      throw new NotFoundException('Batch not found or being processed');
    }

    const logs = await this.auditService.findByBatchId(orgId, batchId);
    if (!logs || logs.length === 0) {
      throw new NotFoundException('Batch not found');
    }

    const undoneLogIds: string[] = [];

    // Process in reverse order (undo most recent first)
    // All operations succeed or none do (NotFoundException treated as already-done)
    for (const log of logs.reverse()) {
      if (log.undone) continue;
      await this.undoSingle(orgId, log);
      undoneLogIds.push(log.id);
    }

    // Mark all undone entries atomically
    if (undoneLogIds.length > 0) {
      await this.auditService.markAsUndone(orgId, undoneLogIds);
    }

    return { success: true, message: `Undone ${undoneLogIds.length} actions` };
  }

  @Post(':logId/redo')
  @Roles('ADMIN', 'TREASURER')
  async redoAuditLog(
    @Param('orgId') orgId: string,
    @Param('logId') logId: string,
    @CurrentUser() user: any,
  ) {
    // Lock the audit row to prevent concurrent undo/redo on the same log
    const [locked] = await this.prisma.$queryRaw<Array<{ id: string; undone: boolean }>>`
      SELECT id, undone FROM audit_logs
      WHERE id = ${logId} AND org_id = ${orgId}
      FOR UPDATE SKIP LOCKED
    `;

    if (!locked) {
      throw new ConflictException('This action is being processed by another request');
    }

    if (!locked.undone) {
      throw new BadRequestException('This action has not been undone');
    }

    const log = await this.auditService.findById(orgId, logId);
    if (!log) {
      throw new NotFoundException('Audit log not found');
    }

    try {
      await this.redoSingle(orgId, log);
      await this.auditService.markAsRedone(orgId, [logId]);
      return { success: true, message: 'Action redone successfully' };
    } catch (error: any) {
      throw new BadRequestException(`Failed to redo: ${error.message}`);
    }
  }

  @Post('batch/:batchId/redo')
  @Roles('ADMIN', 'TREASURER')
  async redoBatch(
    @Param('orgId') orgId: string,
    @Param('batchId') batchId: string,
  ) {
    // Lock all batch rows to prevent concurrent batch redo
    const lockedRows = await this.prisma.$queryRaw<Array<{ id: string; undone: boolean }>>`
      SELECT id, undone FROM audit_logs
      WHERE batch_id = ${batchId} AND org_id = ${orgId}
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
    `;

    if (!lockedRows || lockedRows.length === 0) {
      throw new NotFoundException('Batch not found or being processed');
    }

    const logs = await this.auditService.findByBatchId(orgId, batchId);
    if (!logs || logs.length === 0) {
      throw new NotFoundException('Batch not found');
    }

    const redoneLogIds: string[] = [];

    // All operations succeed or none do (NotFoundException treated as already-done)
    for (const log of logs) {
      if (!log.undone) continue;
      await this.redoSingle(orgId, log);
      redoneLogIds.push(log.id);
    }

    // Mark all redone entries atomically
    if (redoneLogIds.length > 0) {
      await this.auditService.markAsRedone(orgId, redoneLogIds);
    }

    return { success: true, message: `Redone ${redoneLogIds.length} actions` };
  }
}
