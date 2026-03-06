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

interface CreateMultiExpenseChildDto {
  title: string;
  amountCents: number;
  vendor?: string;
  description?: string;
}

interface CreateMultiExpenseDto {
  category: string;
  title: string;
  description?: string;
  date: string;
  vendor?: string;
  children: CreateMultiExpenseChildDto[];
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
  search?: string;
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
    const { category, startDate, endDate, search, page = 1, limit = 50 } = filters;

    const where: any = { orgId, deletedAt: null, parentId: null };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
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

    const createdBySelect = {
      select: {
        id: true,
        name: true,
        user: { select: { name: true } },
      },
    };

    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          createdBy: createdBySelect,
          children: {
            where: { deletedAt: null },
            include: { createdBy: createdBySelect },
            orderBy: { createdAt: 'asc' as const },
          },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return {
      data: expenses.map((e) => this.mapExpenseRow(e)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private mapExpenseRow(e: any) {
    const row: any = {
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
      parentId: e.parentId || null,
      createdBy: e.createdBy
        ? {
            id: e.createdBy.id,
            name: e.createdBy.name || e.createdBy.user?.name || 'Unknown',
          }
        : null,
    };

    if (e.children && e.children.length > 0) {
      row.children = e.children.map((child: any) => this.mapExpenseRow(child));
    }

    return row;
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

  async createMultiExpense(orgId: string, createdById: string, dto: CreateMultiExpenseDto) {
    const totalAmountCents = dto.children.reduce((sum, c) => sum + c.amountCents, 0);

    // Create parent expense (total amount = sum of children)
    const parent = await this.prisma.expense.create({
      data: {
        orgId,
        category: dto.category as any,
        title: dto.title,
        description: dto.description,
        amountCents: totalAmountCents,
        date: new Date(dto.date),
        vendor: dto.vendor,
        createdById,
      },
    });

    // Create child expenses
    const children = await Promise.all(
      dto.children.map((child) =>
        this.prisma.expense.create({
          data: {
            orgId,
            category: dto.category as any,
            title: child.title,
            description: child.description,
            amountCents: child.amountCents,
            date: new Date(dto.date),
            vendor: child.vendor || dto.vendor,
            createdById,
            parentId: parent.id,
          },
        }),
      ),
    );

    // Audit logging
    const batch = this.auditService.createBatchContext(
      `Multi-expense "${dto.title}" with ${dto.children.length} line items`,
    );

    await this.auditService.logCreate(orgId, createdById, 'EXPENSE', parent.id, {
      title: parent.title,
      amountCents: parent.amountCents,
      category: parent.category,
      vendor: parent.vendor,
      isMultiExpense: true,
      childCount: children.length,
    }, batch);

    await Promise.all(
      children.map((child) =>
        this.auditService.logCreate(orgId, createdById, 'EXPENSE', child.id, {
          title: child.title,
          amountCents: child.amountCents,
          category: child.category,
          vendor: child.vendor,
          parentId: parent.id,
        }, batch),
      ),
    );

    return { parent, children };
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
      include: { children: { where: { deletedAt: null }, select: { id: true } } },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    const now = new Date();

    // Soft-delete the expense, any children, and parent if this is a child
    const childIds = expense.children.map((c) => c.id);
    const allIds = [expenseId, ...childIds];
    if (expense.parentId) {
      allIds.push(expense.parentId);
    }

    await this.prisma.expense.updateMany({
      where: { id: { in: allIds }, deletedAt: null },
      data: { deletedAt: now },
    });

    // Log audit entry for delete
    if (actorId) {
      await this.auditService.logDelete(orgId, actorId, 'EXPENSE', expenseId, {
        title: expense.title,
        amountCents: expense.amountCents,
        category: expense.category,
        vendor: expense.vendor,
        childrenDeleted: childIds.length,
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
      include: { children: { where: { deletedAt: { not: null } }, select: { id: true } } },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found or not deleted');
    }

    // Restore this expense, any deleted children, and parent if child
    const childIds = expense.children.map((c) => c.id);
    const allIds = [expenseId, ...childIds];
    if (expense.parentId) {
      allIds.push(expense.parentId);
    }

    await this.prisma.expense.updateMany({
      where: { id: { in: allIds } },
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
        childrenRestored: childIds.length,
      });
    }

    return { success: true };
  }

  async getSummary(orgId: string, startDate?: string, endDate?: string) {
    const where: any = { orgId, deletedAt: null, parentId: null };

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
