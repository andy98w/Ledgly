import { getRowActions } from '../row-actions';

function makeRow(overrides: Record<string, any>) {
  return {
    id: 'row-1',
    type: 'charge' as const,
    description: 'Test Charge',
    outstandingCents: 0,
    ...overrides,
  };
}

describe('getRowActions', () => {
  describe('charges', () => {
    it('returns reminder + auto-match + void for outstanding charge with member', () => {
      const actions = getRowActions(makeRow({
        type: 'charge',
        outstandingCents: 5000,
        status: 'OPEN',
        member: 'John',
      }));
      expect(actions.map((a) => a.icon)).toEqual(['reminder', 'match', 'void']);
    });

    it('returns "Send reminders to all" for parent charge', () => {
      const actions = getRowActions(makeRow({
        type: 'charge',
        outstandingCents: 5000,
        status: 'OPEN',
        isParent: true,
      }));
      const reminder = actions.find((a) => a.icon === 'reminder');
      expect(reminder?.label).toBe('Send reminders to all');
    });

    it('returns only void for paid charge', () => {
      const actions = getRowActions(makeRow({
        type: 'charge',
        outstandingCents: 0,
        status: 'PAID',
      }));
      expect(actions).toHaveLength(1);
      expect(actions[0].icon).toBe('void');
    });

    it('returns nothing for voided charge', () => {
      const actions = getRowActions(makeRow({
        type: 'charge',
        outstandingCents: 0,
        status: 'VOID',
      }));
      expect(actions).toHaveLength(0);
    });
  });

  describe('payments', () => {
    it('returns allocate + find match + delete for unallocated payment', () => {
      const actions = getRowActions(makeRow({
        type: 'payment',
        unallocatedCents: 3000,
        member: 'Jane',
      }));
      expect(actions.map((a) => a.icon)).toEqual(['allocate', 'search', 'delete']);
    });

    it('returns only delete for fully allocated payment', () => {
      const actions = getRowActions(makeRow({
        type: 'payment',
        unallocatedCents: 0,
      }));
      expect(actions).toHaveLength(1);
      expect(actions[0].icon).toBe('delete');
    });
  });

  describe('expenses', () => {
    it('returns find similar + delete', () => {
      const actions = getRowActions(makeRow({
        type: 'expense',
        description: 'Pizza',
      }));
      expect(actions).toHaveLength(2);
      expect(actions[0].icon).toBe('search');
      expect(actions[1].icon).toBe('delete');
    });
  });

  describe('action types', () => {
    it('reminder actions are AI type', () => {
      const actions = getRowActions(makeRow({
        type: 'charge',
        outstandingCents: 5000,
        status: 'OPEN',
        member: 'John',
      }));
      const reminder = actions.find((a) => a.icon === 'reminder');
      expect(reminder?.type).toBe('ai');
    });

    it('void actions are direct type', () => {
      const actions = getRowActions(makeRow({
        type: 'charge',
        outstandingCents: 5000,
        status: 'OPEN',
      }));
      const voidAction = actions.find((a) => a.icon === 'void');
      expect(voidAction?.type).toBe('direct');
      expect(voidAction?.destructive).toBe(true);
    });
  });
});
