import { deriveCategoryFromMemo } from './category-matcher';

describe('deriveCategoryFromMemo', () => {
  describe('DUES', () => {
    it.each([
      'spring dues',
      'monthly fee',
      'membership payment',
      'quarterly payment',
      'fall semester dues',
      'annual fee renewal',
    ])('returns DUES for "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBe('DUES');
    });
  });

  describe('EVENT', () => {
    it.each([
      'formal tickets',
      'tailgate party',
      'retreat weekend',
      'rush event signup',
      'chapter mixer',
      'date night contribution',
    ])('returns EVENT for "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBe('EVENT');
    });
  });

  describe('FINE', () => {
    it.each([
      'missed meeting fine',
      'late fee penalty',
      'absence from chapter',
      'fine for not attending',
    ])('returns FINE for "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBe('FINE');
    });
  });

  describe('MERCH', () => {
    it.each([
      'chapter shirt order',
      'hoodie purchase',
      'org gear',
      'new jersey order',
      'merch fund',
    ])('returns MERCH for "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBe('MERCH');
    });
  });

  describe('null (no match)', () => {
    it.each([
      'thanks bro',
      'pizza money',
      '',
      'rent for this month',
      'uber ride split',
    ])('returns null for "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBeNull();
    });
  });
});
