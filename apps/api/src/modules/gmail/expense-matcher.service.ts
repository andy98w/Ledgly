import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ExpenseMatchResult {
  matchedExpenseId: string | null;
  confidence: number; // 0.0 to 1.0
  needsReview: boolean;
  reviewReason: string | null;
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

    // Sort by confidence descending
    potentialMatches.sort((a, b) => b.confidence - a.confidence);

    // Determine if we have a confident match
    const bestMatch = potentialMatches[0];
    let needsReview = true;
    let reviewReason: string | null = null;
    let matchedExpenseId: string | null = null;

    if (bestMatch) {
      if (bestMatch.confidence >= 0.95) {
        // Very high confidence - could auto-match, but still show for review
        needsReview = true;
        reviewReason = 'Potential duplicate expense detected';
        matchedExpenseId = bestMatch.id;
      } else if (bestMatch.confidence >= 0.7) {
        needsReview = true;
        reviewReason = 'Similar expense found - please confirm';
        matchedExpenseId = bestMatch.id;
      } else {
        needsReview = true;
        reviewReason = 'Possible matching expense found';
      }
    } else {
      // No matches found - create new expense
      needsReview = false;
      reviewReason = null;
    }

    return {
      matchedExpenseId,
      confidence: bestMatch?.confidence || 0,
      needsReview,
      reviewReason,
      potentialMatches: potentialMatches.slice(0, 3), // Return top 3 matches
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

    // Amount match (most important)
    const amountDiff = Math.abs(expense.amountCents - amountCents);
    if (amountDiff === 0) {
      score += 0.5; // Exact amount match is heavily weighted
    } else if (amountDiff <= 100) {
      // Within $1
      score += 0.4;
    } else if (amountDiff <= 500) {
      // Within $5
      score += 0.2;
    }
    factors += 0.5;

    // Date match
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

    // Vendor/name match
    if (vendor && expense.vendor) {
      const vendorSimilarity = this.calculateStringSimilarity(
        vendor.toLowerCase(),
        expense.vendor.toLowerCase(),
      );
      score += vendorSimilarity * 0.15;
    } else if (vendor && expense.title) {
      // Try matching vendor against title
      const titleSimilarity = this.calculateStringSimilarity(
        vendor.toLowerCase(),
        expense.title.toLowerCase(),
      );
      score += titleSimilarity * 0.1;
    }
    factors += 0.15;

    // Memo/description match
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

    // Normalize score
    return Math.min(1, score / factors);
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0;

    // Check for containment
    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.8;
    }

    // Check word overlap
    const words1 = str1.split(/\s+/).filter((w) => w.length > 2);
    const words2 = str2.split(/\s+/).filter((w) => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const commonWords = words1.filter((w) => words2.includes(w));
    const overlapRatio =
      (commonWords.length * 2) / (words1.length + words2.length);

    return overlapRatio;
  }
}
