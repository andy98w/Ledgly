import {
  calculateNameSimilarity,
  deriveCategoryFromMemo,
  DerivedCategory,
} from '../name-similarity';

// ---------------------------------------------------------------------------
// calculateNameSimilarity
// ---------------------------------------------------------------------------

describe('calculateNameSimilarity', () => {
  // --- Exact matches -------------------------------------------------------

  describe('exact matches', () => {
    it('returns 1.0 for identical strings', () => {
      expect(calculateNameSimilarity('John Doe', 'John Doe')).toBe(1.0);
    });

    it('returns 1.0 for identical single-word names', () => {
      expect(calculateNameSimilarity('Alice', 'Alice')).toBe(1.0);
    });
  });

  // --- Case insensitivity --------------------------------------------------

  describe('case insensitivity', () => {
    it('treats differently-cased names as equal', () => {
      expect(calculateNameSimilarity('John Doe', 'john doe')).toBe(1.0);
    });

    it('treats all-caps as equal to lowercase', () => {
      expect(calculateNameSimilarity('JOHN DOE', 'john doe')).toBe(1.0);
    });

    it('handles mixed case', () => {
      expect(calculateNameSimilarity('jOhN dOe', 'John Doe')).toBe(1.0);
    });
  });

  // --- Special character normalization -------------------------------------

  describe('special character normalization', () => {
    it('strips apostrophes before comparison', () => {
      expect(calculateNameSimilarity("O'Brien", 'OBrien')).toBe(1.0);
    });

    it('strips hyphens before comparison', () => {
      expect(calculateNameSimilarity('Mary-Jane', 'MaryJane')).toBe(1.0);
    });

    it('strips periods before comparison', () => {
      expect(calculateNameSimilarity('J. Smith', 'J Smith')).toBe(1.0);
    });

    it('normalizes multiple special characters', () => {
      expect(calculateNameSimilarity("Mary-Jane O'Brien", 'MaryJane OBrien')).toBe(1.0);
    });
  });

  // --- Partial name matches ------------------------------------------------

  describe('partial name matches', () => {
    it('returns 0.6 when only first names match', () => {
      expect(calculateNameSimilarity('John Smith', 'John Williams')).toBe(0.6);
    });

    it('returns 0.5 when only last names match', () => {
      expect(calculateNameSimilarity('Alice Smith', 'Bob Smith')).toBe(0.5);
    });
  });

  // --- First + last match with middle name ---------------------------------

  describe('first and last name match with middle name difference', () => {
    it('returns 0.9 when first and last match but middle differs', () => {
      expect(calculateNameSimilarity('John Smith', 'John A Smith')).toBe(0.9);
    });

    it('returns 0.9 when first and last match with extra middle parts', () => {
      expect(calculateNameSimilarity('John A Smith', 'John B Smith')).toBe(0.9);
    });
  });

  // --- All parts contained (0.95 branch) -----------------------------------

  describe('all parts contained in each other', () => {
    it('returns 0.95 when name parts are substrings of each other', () => {
      // e.g. "Jon" is contained in "Jonathan", "Doe" equals "Doe"
      expect(calculateNameSimilarity('Jon Doe', 'Jonathan Doe')).toBe(0.95);
    });
  });

  // --- Completely different names ------------------------------------------

  describe('completely different names', () => {
    it('returns a low score for unrelated names', () => {
      const score = calculateNameSimilarity('John Doe', 'Alice Wonderland');
      expect(score).toBeLessThan(0.3);
    });

    it('returns a low score for single unrelated names', () => {
      const score = calculateNameSimilarity('Zachary', 'Bethany');
      expect(score).toBeLessThan(0.5);
    });
  });

  // --- Empty strings -------------------------------------------------------

  describe('empty strings', () => {
    it('returns 1.0 when both strings are empty', () => {
      expect(calculateNameSimilarity('', '')).toBe(1.0);
    });

    it('returns 0 when one string is empty and the other is not', () => {
      expect(calculateNameSimilarity('', 'John')).toBe(0);
    });

    it('returns 0 when the first string is non-empty and the second is empty', () => {
      expect(calculateNameSimilarity('John', '')).toBe(0);
    });
  });

  // --- Whitespace handling -------------------------------------------------

  describe('whitespace handling', () => {
    it('trims leading and trailing whitespace', () => {
      expect(calculateNameSimilarity('  John Doe  ', 'John Doe')).toBe(1.0);
    });

    it('collapses multiple internal spaces', () => {
      expect(calculateNameSimilarity('John   Doe', 'John Doe')).toBe(1.0);
    });
  });
});

// ---------------------------------------------------------------------------
// deriveCategoryFromMemo
// ---------------------------------------------------------------------------

describe('deriveCategoryFromMemo', () => {
  // --- DUES ----------------------------------------------------------------

  describe('DUES patterns', () => {
    const duesMemos = [
      'Monthly Dues',
      'monthly dues payment',
      'membership fee',
      'Membership',
      'Fall Semester',
      'spring 2025',
      'quarterly',
      'Quarter payment',
      'Winter dues',
      'Summer fees',
      'annual fee',
      'monthly fee',
    ];

    it.each(duesMemos)('returns DUES for memo: "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBe('DUES');
    });
  });

  // --- EVENT ---------------------------------------------------------------

  describe('EVENT patterns', () => {
    const eventMemos = [
      'Formal Ticket',
      'Rush event',
      'spring mixer',
      'Social night',
      'date night',
      'tailgate',
      'concert tickets',
      'retreat fee',
      'house party',
      'trip deposit',
    ];

    it.each(eventMemos)('returns EVENT for memo: "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBe('EVENT');
    });
  });

  // --- FINE ----------------------------------------------------------------

  describe('FINE patterns', () => {
    const fineMemos = [
      'Late fee',
      'absence penalty',
      'missed meeting fine',
      'fine for damages',
      'Penalty charge',
      'missed chapter',
    ];

    it.each(fineMemos)('returns FINE for memo: "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBe('FINE');
    });
  });

  // --- MERCH ---------------------------------------------------------------

  describe('MERCH patterns', () => {
    const merchMemos = [
      't-shirt',
      'hoodie order',
      'rush gear',
      'Merch purchase',
      'Apparel',
      'clothing order',
      'hat',
      'swag bag',
      'jersey order',
      'custom shirt',
    ];

    it.each(merchMemos)('returns MERCH for memo: "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBe('MERCH');
    });
  });

  // --- No match (null) -----------------------------------------------------

  describe('no match returns null', () => {
    const nullMemos = [
      'random payment',
      'transfer',
      'reimbursement',
      'groceries',
      'lunch',
      'venmo',
    ];

    it.each(nullMemos)('returns null for memo: "%s"', (memo) => {
      expect(deriveCategoryFromMemo(memo)).toBeNull();
    });
  });

  // --- Priority / ordering -------------------------------------------------

  describe('category priority when multiple patterns could match', () => {
    it('returns DUES over EVENT when memo contains both "semester" and "event"', () => {
      // DUES patterns are checked first
      expect(deriveCategoryFromMemo('Fall Semester event')).toBe('DUES');
    });

    it('returns EVENT over FINE when memo contains "event" and "penalty"', () => {
      // EVENT is checked before FINE
      expect(deriveCategoryFromMemo('event penalty')).toBe('EVENT');
    });

    it('returns FINE over MERCH when memo contains "fine" and "shirt"', () => {
      // FINE is checked before MERCH
      expect(deriveCategoryFromMemo('fine for shirt damage')).toBe('FINE');
    });
  });
});
