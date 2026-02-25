import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface CreateExpenseDto {
  category: string;
  title: string;
  description?: string;
  amountCents: number;
  date: string;
  vendor?: string;
  receiptUrl?: string;
}

interface UpdateExpenseDto {
  category?: string;
  title?: string;
  description?: string;
  amountCents?: number;
  date?: string;
  vendor?: string;
  receiptUrl?: string;
}

interface ExpenseFilters {
  category?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async findAll(orgId: string, filters: ExpenseFilters = {}) {
    const { category, startDate, endDate, page = 1, limit = 50 } = filters;

    const where: any = { orgId, deletedAt: null };

    if (category) {
      where.category = category;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    }

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: expenses.map((e) => ({
        id: e.id,
        orgId: e.orgId,
        category: e.category,
        title: e.title,
        description: e.description,
        amountCents: e.amountCents,
        date: e.date,
        vendor: e.vendor,
        receiptUrl: e.receiptUrl,
        createdAt: e.createdAt,
        createdBy: e.createdBy
          ? {
              id: e.createdBy.id,
              name: e.createdBy.name || e.createdBy.user?.name || 'Unknown',
            }
          : null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(orgId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, orgId, deletedAt: null },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return {
      id: expense.id,
      orgId: expense.orgId,
      category: expense.category,
      title: expense.title,
      description: expense.description,
      amountCents: expense.amountCents,
      date: expense.date,
      vendor: expense.vendor,
      receiptUrl: expense.receiptUrl,
      createdAt: expense.createdAt,
      createdBy: expense.createdBy
        ? {
            id: expense.createdBy.id,
            name: expense.createdBy.name || expense.createdBy.user?.name || 'Unknown',
          }
        : null,
    };
  }

  async create(orgId: string, createdById: string, dto: CreateExpenseDto) {
    const expense = await this.prisma.expense.create({
      data: {
        orgId,
        category: dto.category as any,
        title: dto.title,
        description: dto.description,
        amountCents: dto.amountCents,
        date: new Date(dto.date),
        vendor: dto.vendor,
        receiptUrl: dto.receiptUrl,
        createdById,
      },
    });

    // Log audit entry for create
    await this.auditService.logCreate(orgId, createdById, 'EXPENSE', expense.id, {
      title: expense.title,
      amountCents: expense.amountCents,
      category: expense.category,
      vendor: expense.vendor,
    });

    return expense;
  }

  async update(orgId: string, expenseId: string, dto: UpdateExpenseDto, actorId?: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, orgId, deletedAt: null },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(dto.category && { category: dto.category as any }),
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amountCents !== undefined && { amountCents: dto.amountCents }),
        ...(dto.date && { date: new Date(dto.date) }),
        ...(dto.vendor !== undefined && { vendor: dto.vendor }),
        ...(dto.receiptUrl !== undefined && { receiptUrl: dto.receiptUrl }),
      },
    });

    // Log audit entry for update
    if (actorId) {
      const before: Record<string, any> = {};
      const after: Record<string, any> = {};

      if (dto.category && dto.category !== expense.category) {
        before.category = expense.category;
        after.category = dto.category;
      }
      if (dto.title && dto.title !== expense.title) {
        before.title = expense.title;
        after.title = dto.title;
      }
      if (dto.amountCents !== undefined && dto.amountCents !== expense.amountCents) {
        before.amountCents = expense.amountCents;
        after.amountCents = dto.amountCents;
      }
      if (dto.vendor !== undefined && dto.vendor !== expense.vendor) {
        before.vendor = expense.vendor;
        after.vendor = dto.vendor;
      }

      if (Object.keys(after).length > 0) {
        await this.auditService.logUpdate(orgId, actorId, 'EXPENSE', expenseId, before, after);
      }
    }

    return updated;
  }

  async delete(orgId: string, expenseId: string, actorId?: string, batch?: { batchId: string; batchDescription: string }) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, orgId, deletedAt: null },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { deletedAt: new Date() },
    });

    // Log audit entry for delete
    if (actorId) {
      await this.auditService.logDelete(orgId, actorId, 'EXPENSE', expenseId, {
        title: expense.title,
        amountCents: expense.amountCents,
        category: expense.category,
        vendor: expense.vendor,
      }, batch);
    }

    return { success: true };
  }

  async bulkDelete(orgId: string, expenseIds: string[], actorId: string) {
    if (expenseIds.length === 0) return { success: true, deletedCount: 0 };

    const batch = expenseIds.length > 1
      ? this.auditService.createBatchContext(`Deleted ${expenseIds.length} expenses`)
      : undefined;

    let deletedCount = 0;
    for (const expenseId of expenseIds) {
      try {
        await this.delete(orgId, expenseId, actorId, batch);
        deletedCount++;
      } catch {
        // Skip not-found expenses
      }
    }

    return { success: true, deletedCount };
  }

  async restore(orgId: string, expenseId: string, actorId?: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, orgId, deletedAt: { not: null } },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found or not deleted');
    }

    await this.prisma.expense.update({
      where: { id: expenseId },
      data: { deletedAt: null },
    });

    // Log audit entry for restore
    if (actorId) {
      await this.auditService.logCreate(orgId, actorId, 'EXPENSE', expenseId, {
        title: expense.title,
        amountCents: expense.amountCents,
        category: expense.category,
        vendor: expense.vendor,
        restored: true,
      });
    }

    return { success: true };
  }

  async getSummary(orgId: string, startDate?: string, endDate?: string) {
    const where: any = { orgId, deletedAt: null };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    }

    const expenses: Array<{ amountCents: number; category: string }> = await this.prisma.expense.findMany({
      where,
      select: {
        amountCents: true,
        category: true,
      },
    });

    const totalCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

    // Group by category
    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amountCents;
    }

    return {
      totalCents,
      count: expenses.length,
      byCategory,
    };
  }
}
