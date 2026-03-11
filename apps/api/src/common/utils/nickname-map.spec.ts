import { resolveNicknames, NICKNAME_MAP } from './nickname-map';

describe('nickname-map', () => {
  describe('resolveNicknames', () => {
    it('resolves formal name to nicknames', () => {
      const variants = resolveNicknames('William');
      expect(variants).toContain('bill');
      expect(variants).toContain('will');
      expect(variants).toContain('liam');
    });

    it('resolves nickname to formal name and other variants', () => {
      const variants = resolveNicknames('Bob');
      expect(variants).toContain('robert');
      expect(variants).toContain('bobby');
      expect(variants).toContain('rob');
    });

    it('is case-insensitive', () => {
      expect(resolveNicknames('JAMES')).toContain('jim');
      expect(resolveNicknames('jim')).toContain('james');
      expect(resolveNicknames('Jim')).toContain('james');
    });

    it('returns empty array for unknown names', () => {
      expect(resolveNicknames('Xyzzy')).toEqual([]);
      expect(resolveNicknames('Bartholomew')).toEqual([]);
    });

    it('handles whitespace', () => {
      expect(resolveNicknames('  mike  ')).toContain('michael');
    });

    it('handles female names', () => {
      const variants = resolveNicknames('elizabeth');
      expect(variants).toContain('liz');
      expect(variants).toContain('beth');
      expect(variants).toContain('betty');
    });

    it('does not include self in variants', () => {
      const variants = resolveNicknames('michael');
      expect(variants).not.toContain('michael');
    });
  });

  describe('NICKNAME_MAP', () => {
    it('is bidirectional', () => {
      // If bill → robert variants, then robert → bill variants
      expect(NICKNAME_MAP.get('bill')?.has('william')).toBe(true);
      expect(NICKNAME_MAP.get('william')?.has('bill')).toBe(true);
    });

    it('contains expected common pairs', () => {
      const pairs: [string, string][] = [
        ['robert', 'bob'],
        ['richard', 'dick'],
        ['james', 'jim'],
        ['john', 'jack'],
        ['michael', 'mike'],
        ['thomas', 'tom'],
        ['charles', 'charlie'],
        ['jennifer', 'jen'],
        ['margaret', 'maggie'],
        ['katherine', 'kate'],
      ];
      for (const [formal, nick] of pairs) {
        expect(NICKNAME_MAP.get(formal)?.has(nick)).toBe(true);
        expect(NICKNAME_MAP.get(nick)?.has(formal)).toBe(true);
      }
    });
  });
});
