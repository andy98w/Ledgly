import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getCollectionReport(orgId: string, start?: string, end?: string) {
    const startDate = start ? new Date(start + 'T00:00:00') : new Date(new Date().getFullYear(), 0, 1);
    const endDate = end ? new Date(end + 'T23:59:59') : new Date();

    // Get charges created in period
    const charges = await this.prisma.charge.findMany({
      where: {
        orgId,
        status: { not: 'VOID' },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        allocations: { select: { amountCents: true } },
      },
    });

    const totalChargedCents = charges.reduce((sum, c) => sum + c.amountCents, 0);
    const totalCollectedCents = charges.reduce(
      (sum, c) => sum + c.allocations.reduce((s, a) => s + a.amountCents, 0),
      0,
    );
    const collectionRate = totalChargedCents > 0
      ? Math.round((totalCollectedCents / totalChargedCents) * 100)
      : 0;

    // Monthly breakdown
    const monthlyMap = new Map<string, { charged: number; collected: number }>();
    for (const charge of charges) {
      const month = charge.createdAt.toISOString().substring(0, 7); // YYYY-MM
      const existing = monthlyMap.get(month) || { charged: 0, collected: 0 };
      existing.charged += charge.amountCents;
      existing.collected += charge.allocations.reduce((s, a) => s + a.amountCents, 0);
      monthlyMap.set(month, existing);
    }

    const monthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    return {
      totalChargedCents,
      totalCollectedCents,
      outstandingCents: totalChargedCents - totalCollectedCents,
      collectionRate,
      monthly,
    };
  }

  async getOutstandingReport(orgId: string) {
    // Per-member outstanding balances
    const members = await this.prisma.membership.findMany({
      where: { orgId, status: 'ACTIVE' },
      include: {
        user: { select: { name: true, email: true } },
        chargesAssigned: {
          where: { status: { not: 'VOID' } },
          include: {
            allocations: { select: { amountCents: true } },
          },
        },
      },
    });

    const rows = members.map((m) => {
      const totalCharged = m.chargesAssigned.reduce((sum, c) => sum + c.amountCents, 0);
      const totalPaid = m.chargesAssigned.reduce(
        (sum, c) => sum + c.allocations.reduce((s, a) => s + a.amountCents, 0),
        0,
      );
      return {
        membershipId: m.id,
        name: m.name || m.user?.name || m.user?.email || 'Unknown',
        totalChargedCents: totalCharged,
        totalPaidCents: totalPaid,
        balanceCents: totalCharged - totalPaid,
      };
    });

    // Sort by balance descending (most owed first)
    rows.sort((a, b) => b.balanceCents - a.balanceCents);

    return rows;
  }

  async getPeriodComparison(
    orgId: string,
    currentStart: string,
    currentEnd: string,
    prevStart: string,
    prevEnd: string,
  ) {
    const [current, previous] = await Promise.all([
      this.getPeriodMetrics(orgId, currentStart, currentEnd),
      this.getPeriodMetrics(orgId, prevStart, prevEnd),
    ]);

    return {
      current,
      previous,
      changes: {
        chargesCreated: current.chargesCreated - previous.chargesCreated,
        totalChargedCents: current.totalChargedCents - previous.totalChargedCents,
        paymentsReceived: current.paymentsReceived - previous.paymentsReceived,
        totalCollectedCents: current.totalCollectedCents - previous.totalCollectedCents,
        collectionRateDelta: current.collectionRate - previous.collectionRate,
      },
    };
  }

  private async getPeriodMetrics(orgId: string, start: string, end: string) {
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T23:59:59');

    const [charges, payments] = await Promise.all([
      this.prisma.charge.findMany({
        where: {
          orgId,
          status: { not: 'VOID' },
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          allocations: { select: { amountCents: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          orgId,
          deletedAt: null,
          paidAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    const totalChargedCents = charges.reduce((sum, c) => sum + c.amountCents, 0);
    const totalCollectedCents = charges.reduce(
      (sum, c) => sum + c.allocations.reduce((s, a) => s + a.amountCents, 0),
      0,
    );

    return {
      chargesCreated: charges.length,
      totalChargedCents,
      paymentsReceived: payments.length,
      totalCollectedCents,
      collectionRate: totalChargedCents > 0 ? Math.round((totalCollectedCents / totalChargedCents) * 100) : 0,
    };
  }
}
