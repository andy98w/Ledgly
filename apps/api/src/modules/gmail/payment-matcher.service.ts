import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChargeCategory } from '@prisma/client';
import { deriveCategoryFromMemo } from '../../common/utils/category-matcher';

export interface MatchResult {
  membershipId: string | null;
  confidence: number; // 0.0 to 1.0
  needsReview: boolean;
  shouldAutoAllocate: boolean; // >= 0.9 + category match + charges found
  reviewReason: string | null;
  derivedCategory: ChargeCategory | null;
  suggestedChargeIds: string[];
}

interface MemberCandidate {
  id: string;
  name: string | null;
  userName: string | null;
  userEmail: string | null;
}

@Injectable()
export class PaymentMatcherService {
  private readonly logger = new Logger(PaymentMatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  async matchPayment(
    orgId: string,
    payerName: string | null,
    payerEmail: string | null,
    memo: string | null,
    amountCents: number,
  ): Promise<MatchResult> {
    // Get all active members for this org
    const members = await this.prisma.membership.findMany({
      where: { orgId, status: 'ACTIVE' },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    const candidates: MemberCandidate[] = members.map((m) => ({
      id: m.id,
      name: m.name,
      userName: m.user?.name || null,
      userEmail: m.user?.email || null,
    }));

    // Try to match by name
    let bestMatch: { membershipId: string; confidence: number } | null = null;

    if (payerName) {
      const nameMatch = this.findBestNameMatch(payerName, candidates);
      if (nameMatch) {
        bestMatch = nameMatch;
      }
    }

    // Try to match by email if no name match
    if (!bestMatch && payerEmail) {
      const emailMatch = candidates.find(
        (c) => c.userEmail?.toLowerCase() === payerEmail.toLowerCase(),
      );
      if (emailMatch) {
        bestMatch = { membershipId: emailMatch.id, confidence: 1.0 };
      }
    }

    // Derive category from memo
    const derivedCategory = memo ? deriveCategoryFromMemo(memo) : null;

    // Find matching charges if we have a member (category-strict)
    let suggestedChargeIds: string[] = [];
    if (bestMatch) {
      suggestedChargeIds = await this.findMatchingCharges(
        orgId,
        bestMatch.membershipId,
        derivedCategory,
        amountCents,
      );
    }

    // Determine if manual review is needed
    let needsReview = false;
    let reviewReason: string | null = null;

    if (!bestMatch) {
      needsReview = true;
      reviewReason = 'Could not match payer name to any member';
    } else if (bestMatch.confidence < 0.8) {
      needsReview = true;
      reviewReason = `Low confidence match (${Math.round(bestMatch.confidence * 100)}%)`;
    }

    // Auto-allocate requires: high confidence (>= 0.9) + category derived + matching charges found
    const shouldAutoAllocate =
      !needsReview &&
      bestMatch !== null &&
      bestMatch.confidence >= 0.9 &&
      derivedCategory !== null &&
      suggestedChargeIds.length > 0;

    return {
      membershipId: bestMatch?.membershipId || null,
      confidence: bestMatch?.confidence || 0,
      needsReview,
      shouldAutoAllocate,
      reviewReason,
      derivedCategory,
      suggestedChargeIds,
    };
  }

  private findBestNameMatch(
    payerName: string,
    candidates: MemberCandidate[],
  ): { membershipId: string; confidence: number } | null {
    const normalizedPayerName = this.normalizeName(payerName);
    let bestMatch: { membershipId: string; confidence: number } | null = null;

    for (const candidate of candidates) {
      // Check membership name
      if (candidate.name) {
        const similarity = this.calculateNameSimilarity(
          normalizedPayerName,
          this.normalizeName(candidate.name),
        );
        if (similarity > (bestMatch?.confidence || 0.5)) {
          bestMatch = { membershipId: candidate.id, confidence: similarity };
        }
      }

      // Check user name
      if (candidate.userName) {
        const similarity = this.calculateNameSimilarity(
          normalizedPayerName,
          this.normalizeName(candidate.userName),
        );
        if (similarity > (bestMatch?.confidence || 0.5)) {
          bestMatch = { membershipId: candidate.id, confidence: similarity };
        }
      }
    }

    return bestMatch;
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z\s]/g, '') // Remove non-letters
      .replace(/\s+/g, ' '); // Normalize spaces
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    // Exact match
    if (name1 === name2) return 1.0;

    const parts1 = name1.split(' ').filter(Boolean);
    const parts2 = name2.split(' ').filter(Boolean);

    // Check if all parts of one name are contained in the other
    const allParts1InParts2 = parts1.every((p1) =>
      parts2.some((p2) => p2.includes(p1) || p1.includes(p2)),
    );
    const allParts2InParts1 = parts2.every((p2) =>
      parts1.some((p1) => p1.includes(p2) || p2.includes(p1)),
    );

    if (allParts1InParts2 && allParts2InParts1) {
      return 0.95;
    }

    // First and last name match (handles middle name differences)
    if (parts1.length >= 2 && parts2.length >= 2) {
      const firstMatch = parts1[0] === parts2[0];
      const lastMatch = parts1[parts1.length - 1] === parts2[parts2.length - 1];
      if (firstMatch && lastMatch) {
        return 0.9;
      }
    }

    // First name only match
    if (parts1[0] === parts2[0]) {
      return 0.6;
    }

    // Last name only match
    if (
      parts1.length > 0 &&
      parts2.length > 0 &&
      parts1[parts1.length - 1] === parts2[parts2.length - 1]
    ) {
      return 0.5;
    }

    // Levenshtein distance for fuzzy matching
    const distance = this.levenshteinDistance(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);
    const similarity = 1 - distance / maxLength;

    return Math.max(0, similarity);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  private async findMatchingCharges(
    orgId: string,
    membershipId: string,
    category: ChargeCategory | null,
    amountCents: number,
  ): Promise<string[]> {
    // If no category derived, don't guess — return empty
    if (!category) return [];

    // Find open charges for this member matching the derived category
    const charges = await this.prisma.charge.findMany({
      where: {
        orgId,
        membershipId,
        category,
        status: { in: ['OPEN', 'PARTIALLY_PAID'] },
      },
      include: {
        allocations: {
          select: { amountCents: true },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    const matchingCharges: string[] = [];
    let remainingAmount = amountCents;

    for (const charge of charges) {
      if (remainingAmount <= 0) break;

      const allocatedCents = charge.allocations.reduce(
        (sum, a) => sum + a.amountCents,
        0,
      );
      const balanceDue = charge.amountCents - allocatedCents;

      if (balanceDue <= 0) continue;

      matchingCharges.push(charge.id);
      remainingAmount -= Math.min(remainingAmount, balanceDue);
    }

    return matchingCharges;
  }
}
