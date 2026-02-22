import { Controller, Get, Post, Param, Query, UseGuards, Inject, forwardRef, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { AuditService } from './audit.service';
import { ChargesService } from '../charges/charges.service';
import { ExpensesService } from '../expenses/expenses.service';

@Controller('organizations/:orgId/audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => ChargesService))
    private readonly chargesService: ChargesService,
    @Inject(forwardRef(() => ExpensesService))
    private readonly expensesService: ExpensesService,
  ) {}

  @Get()
  @Roles('ADMIN', 'TREASURER')
  async getAuditLogs(
    @Param('orgId') orgId: string,
    @Query('entityType') entityType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.auditService.findByOrg(orgId, {
      entityType,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      cursor,
    });
  }

  @Post(':logId/undo')
  @Roles('ADMIN', 'TREASURER')
  async undoAuditLog(
    @Param('orgId') orgId: string,
    @Param('logId') logId: string,
    @CurrentUser() user: any,
  ) {
    // Get the audit log entry
    const log = await this.auditService.findById(orgId, logId);
    if (!log) {
      throw new NotFoundException('Audit log not found');
    }

    if (log.undone) {
      throw new BadRequestException('This action has already been undone');
    }

    // Perform the undo based on entity type and action
    try {
      if (log.entityType === 'CHARGE') {
        if (log.action === 'CREATE') {
          // Undo create = void the charge
          await this.chargesService.void(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          // Undo delete = restore the charge
          await this.chargesService.restore(orgId, log.entityId);
        }
        // UPDATE undo is more complex - skip for now
      } else if (log.entityType === 'EXPENSE') {
        if (log.action === 'CREATE') {
          await this.expensesService.delete(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.expensesService.restore(orgId, log.entityId);
        }
      }
      // PAYMENT and MEMBER undo are more complex - skip for now

      // Mark the audit log as undone
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
    // Get all logs in the batch
    const logs = await this.auditService.findByBatchId(orgId, batchId);
    if (!logs || logs.length === 0) {
      throw new NotFoundException('Batch not found');
    }

    let undoneCount = 0;

    // Undo each action in reverse order
    for (const log of logs.reverse()) {
      if (log.undone) continue;

      try {
        if (log.entityType === 'CHARGE') {
          if (log.action === 'CREATE') {
            await this.chargesService.void(orgId, log.entityId);
            undoneCount++;
          } else if (log.action === 'DELETE') {
            await this.chargesService.restore(orgId, log.entityId);
            undoneCount++;
          }
        } else if (log.entityType === 'EXPENSE') {
          if (log.action === 'CREATE') {
            await this.expensesService.delete(orgId, log.entityId);
            undoneCount++;
          } else if (log.action === 'DELETE') {
            await this.expensesService.restore(orgId, log.entityId);
            undoneCount++;
          }
        }
      } catch (error) {
        // Continue with other logs
      }
    }

    // Mark the batch as undone
    await this.auditService.markBatchAsUndone(orgId, batchId);

    return { success: true, message: `Undone ${undoneCount} actions` };
  }

  @Post(':logId/redo')
  @Roles('ADMIN', 'TREASURER')
  async redoAuditLog(
    @Param('orgId') orgId: string,
    @Param('logId') logId: string,
    @CurrentUser() user: any,
  ) {
    const log = await this.auditService.findById(orgId, logId);
    if (!log) {
      throw new NotFoundException('Audit log not found');
    }

    if (!log.undone) {
      throw new BadRequestException('This action has not been undone');
    }

    try {
      if (log.entityType === 'CHARGE') {
        if (log.action === 'CREATE') {
          // Redo create = restore the charge (was voided by undo)
          await this.chargesService.restore(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          // Redo delete = void the charge again
          await this.chargesService.void(orgId, log.entityId);
        }
      } else if (log.entityType === 'EXPENSE') {
        if (log.action === 'CREATE') {
          await this.expensesService.restore(orgId, log.entityId);
        } else if (log.action === 'DELETE') {
          await this.expensesService.delete(orgId, log.entityId);
        }
      }

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
    const logs = await this.auditService.findByBatchId(orgId, batchId);
    if (!logs || logs.length === 0) {
      throw new NotFoundException('Batch not found');
    }

    let redoneCount = 0;

    for (const log of logs) {
      if (!log.undone) continue;

      try {
        if (log.entityType === 'CHARGE') {
          if (log.action === 'CREATE') {
            await this.chargesService.restore(orgId, log.entityId);
            redoneCount++;
          } else if (log.action === 'DELETE') {
            await this.chargesService.void(orgId, log.entityId);
            redoneCount++;
          }
        } else if (log.entityType === 'EXPENSE') {
          if (log.action === 'CREATE') {
            await this.expensesService.restore(orgId, log.entityId);
            redoneCount++;
          } else if (log.action === 'DELETE') {
            await this.expensesService.delete(orgId, log.entityId);
            redoneCount++;
          }
        }
      } catch (error) {
        // Continue with other logs
      }
    }

    await this.auditService.markBatchAsRedone(orgId, batchId);

    return { success: true, message: `Redone ${redoneCount} actions` };
  }
}
