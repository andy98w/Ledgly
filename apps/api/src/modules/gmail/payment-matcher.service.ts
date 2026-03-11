import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChargeCategory } from '@prisma/client';
import { deriveCategoryFromMemo } from '../../common/utils/category-matcher';
import { resolveNicknames } from '../../common/utils/nickname-map';

export interface MatchResult {
  membershipId: string | null;
  confidence: number; // 0.0 to 1.0
  shouldAutoAllocate: boolean; // >= 0.9 + category match + charges found
  derivedCategory: ChargeCategory | null;
  suggestedChargeIds: string[];
}

interface MemberCandidate {
  id: string;
  name: string | null;
  userName: string | null;
  userEmail: string | null;
  aliases: string[];
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
      aliases: m.paymentAliases || [],
    }));

    // 1) History-based matching: check MatchConfirmation for previously confirmed payer names
    let bestMatch: { membershipId: string; confidence: number } | null = null;

    if (payerName) {
      const confirmation = await this.prisma.matchConfirmation.findFirst({
        where: { orgId, rawPayerName: payerName },
        orderBy: { confirmedAt: 'desc' },
      });
      if (confirmation) {
        bestMatch = { membershipId: confirmation.matchedMemberId, confidence: 0.98 };
      }
    }

    // 2) Name matching
    if (!bestMatch && payerName) {
      const nameMatch = this.findBestNameMatch(payerName, candidates);
      if (nameMatch) {
        bestMatch = nameMatch;
      }
    }

    // 3) Email matching
    if (!bestMatch && payerEmail) {
      const emailMatch = candidates.find(
        (c) => c.userEmail?.toLowerCase() === payerEmail.toLowerCase(),
      );
      if (emailMatch) {
        bestMatch = { membershipId: emailMatch.id, confidence: 1.0 };
      }
    }

    const derivedCategory = memo ? deriveCategoryFromMemo(memo) : null;

    let suggestedChargeIds: string[] = [];
    if (bestMatch) {
      suggestedChargeIds = await this.findMatchingCharges(
        orgId,
        bestMatch.membershipId,
        derivedCategory,
        amountCents,
      );
    }

    // Auto-allocate requires: high confidence (>= 0.9) + category derived + matching charges found
    const shouldAutoAllocate =
      bestMatch !== null &&
      bestMatch.confidence >= 0.9 &&
      derivedCategory !== null &&
      suggestedChargeIds.length > 0;

    return {
      membershipId: bestMatch?.membershipId || null,
      confidence: bestMatch?.confidence || 0,
      shouldAutoAllocate,
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
      if (candidate.name) {
        const similarity = this.calculateNameSimilarity(
          normalizedPayerName,
          this.normalizeName(candidate.name),
        );
        if (similarity > (bestMatch?.confidence || 0.5)) {
          bestMatch = { membershipId: candidate.id, confidence: similarity };
        }
      }

      if (candidate.userName) {
        const similarity = this.calculateNameSimilarity(
          normalizedPayerName,
          this.normalizeName(candidate.userName),
        );
        if (similarity > (bestMatch?.confidence || 0.5)) {
          bestMatch = { membershipId: candidate.id, confidence: similarity };
        }
      }

      for (const alias of candidate.aliases) {
        const normalizedAlias = this.normalizeName(alias);
        if (normalizedAlias === normalizedPayerName) {
          if (0.95 > (bestMatch?.confidence || 0.5)) {
            bestMatch = { membershipId: candidate.id, confidence: 0.95 };
          }
        } else {
          const similarity = this.calculateNameSimilarity(normalizedPayerName, normalizedAlias);
          if (similarity > (bestMatch?.confidence || 0.5)) {
            bestMatch = { membershipId: candidate.id, confidence: similarity };
          }
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
    if (name1 === name2) return 1.0;

    const parts1 = name1.split(' ').filter(Boolean);
    const parts2 = name2.split(' ').filter(Boolean);

    // Check if the shorter name's parts all appear (as substrings) in order
    // within the longer name's parts. Ordered matching prevents false positives
    // like "John Williams" ↔ "William Johnson" where cross-position substring
    // overlap would otherwise produce a spurious 0.95.
    const [shorter, longer] = parts1.length <= parts2.length
      ? [parts1, parts2]
      : [parts2, parts1];

    let j = 0;
    let orderedMatchCount = 0;
    for (const part of shorter) {
      while (j < longer.length) {
        if (longer[j].includes(part) || part.includes(longer[j])) {
          orderedMatchCount++;
          j++;
          break;
        }
        j++;
      }
    }

    if (orderedMatchCount === shorter.length) {
      return 0.95;
    }

    if (parts1.length >= 2 && parts2.length >= 2) {
      const firstMatch = parts1[0] === parts2[0];
      const lastMatch = parts1[parts1.length - 1] === parts2[parts2.length - 1];
      if (firstMatch && lastMatch) {
        return 0.9;
      }

      // Nickname matching: check if first names are nickname variants
      if (lastMatch && !firstMatch) {
        const nicknames1 = resolveNicknames(parts1[0]);
        if (nicknames1.includes(parts2[0])) {
          return 0.85;
        }
        const nicknames2 = resolveNicknames(parts2[0]);
        if (nicknames2.includes(parts1[0])) {
          return 0.85;
        }
      }
    }

    if (parts1[0] === parts2[0]) {
      return 0.6;
    }

    if (parts1.length === 1 || parts2.length === 1) {
      const nicknames = resolveNicknames(parts1[0]);
      if (nicknames.includes(parts2[0])) {
        return 0.6;
      }
    }

    if (
      parts1.length > 0 &&
      parts2.length > 0 &&
      parts1[parts1.length - 1] === parts2[parts2.length - 1]
    ) {
      return 0.5;
    }

    // Use the better of Levenshtein and Jaro-Winkler for fuzzy matching
    const levenshteinSim = 1 - this.levenshteinDistance(name1, name2) / Math.max(name1.length, name2.length);
    const jaroWinklerSim = this.jaroWinklerDistance(name1, name2);

    return Math.max(0, Math.max(levenshteinSim, jaroWinklerSim));
  }

  private jaroWinklerDistance(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0;

    const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, s2.length);

      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

    // Winkler modification: boost for common prefix (up to 4 chars)
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
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
