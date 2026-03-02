import { ChargeCategory } from '@prisma/client';

/**
 * Derives a ChargeCategory from a payment memo string using regex patterns.
 * Returns null if no category can be confidently determined.
 */
export function deriveCategoryFromMemo(memo: string): ChargeCategory | null {
  const lowerMemo = memo.toLowerCase();

  // Dues patterns
  const duesPatterns = [
    /dues/i,
    /membership/i,
    /monthly\s*fee/i,
    /annual\s*fee/i,
    /semester/i,
    /quarter(?:ly)?/i,
    /spring|fall|winter|summer/i,
  ];
  if (duesPatterns.some((p) => p.test(lowerMemo))) {
    return 'DUES';
  }

  // Event patterns
  const eventPatterns = [
    /event/i,
    /party/i,
    /formal/i,
    /ticket/i,
    /concert/i,
    /trip/i,
    /retreat/i,
    /mixer/i,
    /social/i,
    /rush/i,
    /date\s*night/i,
    /tailgate/i,
  ];
  if (eventPatterns.some((p) => p.test(lowerMemo))) {
    return 'EVENT';
  }

  // Fine patterns
  const finePatterns = [
    /fine/i,
    /penalty/i,
    /late\s*fee/i,
    /missed/i,
    /absence/i,
  ];
  if (finePatterns.some((p) => p.test(lowerMemo))) {
    return 'FINE';
  }

  // Merch patterns
  const merchPatterns = [
    /merch/i,
    /shirt/i,
    /apparel/i,
    /clothing/i,
    /hoodie/i,
    /hat/i,
    /gear/i,
    /swag/i,
    /jersey/i,
  ];
  if (merchPatterns.some((p) => p.test(lowerMemo))) {
    return 'MERCH';
  }

  return null;
}
