/**
 * Name similarity and memo category utilities.
 * Ported from apps/api/src/modules/gmail/payment-matcher.service.ts
 */

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ');
}

function levenshteinDistance(str1: string, str2: string): number {
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

export function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1.0;

  const parts1 = n1.split(' ').filter(Boolean);
  const parts2 = n2.split(' ').filter(Boolean);

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

  if (orderedMatchCount === shorter.length) return 0.95;

  if (parts1.length >= 2 && parts2.length >= 2) {
    const firstMatch = parts1[0] === parts2[0];
    const lastMatch = parts1[parts1.length - 1] === parts2[parts2.length - 1];
    if (firstMatch && lastMatch) return 0.9;
  }

  if (parts1[0] === parts2[0]) return 0.6;

  if (
    parts1.length > 0 &&
    parts2.length > 0 &&
    parts1[parts1.length - 1] === parts2[parts2.length - 1]
  ) {
    return 0.5;
  }

  const distance = levenshteinDistance(n1, n2);
  const maxLength = Math.max(n1.length, n2.length);
  const similarity = 1 - distance / maxLength;

  return Math.max(0, similarity);
}

export type DerivedCategory = 'DUES' | 'EVENT' | 'FINE' | 'MERCH' | null;

export function deriveCategoryFromMemo(memo: string): DerivedCategory {
  const lowerMemo = memo.toLowerCase();

  const duesPatterns = [
    /dues/i, /membership/i, /monthly\s*fee/i, /annual\s*fee/i,
    /semester/i, /quarter(?:ly)?/i, /spring|fall|winter|summer/i,
  ];
  if (duesPatterns.some((p) => p.test(lowerMemo))) return 'DUES';

  const eventPatterns = [
    /event/i, /party/i, /formal/i, /ticket/i, /concert/i, /trip/i,
    /retreat/i, /mixer/i, /social/i, /rush/i, /date\s*night/i, /tailgate/i,
  ];
  if (eventPatterns.some((p) => p.test(lowerMemo))) return 'EVENT';

  const finePatterns = [
    /fine/i, /penalty/i, /late\s*fee/i, /missed/i, /absence/i,
  ];
  if (finePatterns.some((p) => p.test(lowerMemo))) return 'FINE';

  const merchPatterns = [
    /merch/i, /shirt/i, /apparel/i, /clothing/i, /hoodie/i,
    /hat/i, /gear/i, /swag/i, /jersey/i,
  ];
  if (merchPatterns.some((p) => p.test(lowerMemo))) return 'MERCH';

  return null;
}
