import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ExpenseMatchResult {
  matchedExpenseId: string | null;
  confidence: number; // 0.0 to 1.0
  isDuplicate: boolean;
  potentialMatches: Array<{
    id: string;
    title: string;
    amountCents: number;
    date: Date;
    vendor: string | null;
    confidence: number;
  }>;
}

@Injectable()
export class ExpenseMatcherService {
  private readonly logger = new Logger(ExpenseMatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  async matchExpense(
    orgId: string,
    amountCents: number,
    date: Date,
    vendor: string | null,
    memo: string | null,
  ): Promise<ExpenseMatchResult> {
    // Look for existing expenses within a reasonable date range (7 days)
    const dateStart = new Date(date);
    dateStart.setDate(dateStart.getDate() - 7);
    const dateEnd = new Date(date);
    dateEnd.setDate(dateEnd.getDate() + 7);

    const existingExpenses = await this.prisma.expense.findMany({
      where: {
        orgId,
        date: {
          gte: dateStart,
          lte: dateEnd,
        },
      },
      orderBy: { date: 'desc' },
    });

    const potentialMatches: ExpenseMatchResult['potentialMatches'] = [];

    for (const expense of existingExpenses) {
      const confidence = this.calculateMatchConfidence(
        expense,
        amountCents,
        date,
        vendor,
        memo,
      );

      if (confidence >= 0.5) {
        potentialMatches.push({
          id: expense.id,
          title: expense.title,
          amountCents: expense.amountCents,
          date: expense.date,
          vendor: expense.vendor,
          confidence,
        });
      }
    }

    potentialMatches.sort((a, b) => b.confidence - a.confidence);

    const bestMatch = potentialMatches[0];
    const isDuplicate = bestMatch ? bestMatch.confidence >= 0.95 : false;
    const matchedExpenseId = bestMatch?.confidence >= 0.7 ? bestMatch.id : null;

    return {
      matchedExpenseId,
      confidence: bestMatch?.confidence || 0,
      isDuplicate,
      potentialMatches: potentialMatches.slice(0, 3),
    };
  }

  private calculateMatchConfidence(
    expense: {
      amountCents: number;
      date: Date;
      vendor: string | null;
      title: string;
      description: string | null;
    },
    amountCents: number,
    date: Date,
    vendor: string | null,
    memo: string | null,
  ): number {
    let score = 0;
    let factors = 0;

    const amountDiff = Math.abs(expense.amountCents - amountCents);
    if (amountDiff === 0) {
      score += 0.5;
    } else if (amountDiff <= 100) {
      score += 0.4;
    } else if (amountDiff <= 500) {
      score += 0.2;
    }
    factors += 0.5;

    const daysDiff = Math.abs(
      (expense.date.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysDiff === 0) {
      score += 0.25;
    } else if (daysDiff <= 1) {
      score += 0.2;
    } else if (daysDiff <= 3) {
      score += 0.1;
    }
    factors += 0.25;

    if (vendor && expense.vendor) {
      const vendorSimilarity = this.calculateStringSimilarity(
        vendor.toLowerCase(),
        expense.vendor.toLowerCase(),
      );
      score += vendorSimilarity * 0.15;
    } else if (vendor && expense.title) {
      const titleSimilarity = this.calculateStringSimilarity(
        vendor.toLowerCase(),
        expense.title.toLowerCase(),
      );
      score += titleSimilarity * 0.1;
    }
    factors += 0.15;

    if (memo && expense.description) {
      const memoSimilarity = this.calculateStringSimilarity(
        memo.toLowerCase(),
        expense.description.toLowerCase(),
      );
      score += memoSimilarity * 0.1;
    } else if (memo && expense.title) {
      const titleSimilarity = this.calculateStringSimilarity(
        memo.toLowerCase(),
        expense.title.toLowerCase(),
      );
      score += titleSimilarity * 0.05;
    }
    factors += 0.1;

    return Math.min(1, score / factors);
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0;

    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.8;
    }

    const words1 = str1.split(/\s+/).filter((w) => w.length > 2);
    const words2 = str2.split(/\s+/).filter((w) => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const commonWords = words1.filter((w) => words2.includes(w));
    const overlapRatio =
      (commonWords.length * 2) / (words1.length + words2.length);

    return overlapRatio;
  }
}
