import { computeInsights } from '../spreadsheet-insights';

const NOW = '2026-03-13T12:00:00.000Z';

function makeRow(overrides: Record<string, any>) {
  return {
    id: 'row-1',
    type: 'charge' as const,
    date: '2026-03-01T00:00:00.000Z',
    description: 'Test',
    incomeCents: 0,
    outstandingCents: 0,
    expenseCents: 0,
    ...overrides,
  };
}

describe('computeInsights', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(NOW));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns empty for no rows', () => {
    expect(computeInsights([])).toEqual([]);
  });

  it('flags overdue charges', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-02-01T00:00:00.000Z',
        outstandingCents: 5000,
        status: 'OPEN',
      }),
    ];
    const insights = computeInsights(rows);
    expect(insights).toHaveLength(1);
    expect(insights[0].type).toBe('overdue');
    expect(insights[0].rowId).toBe('c1');
    expect(insights[0].message).toContain('outstanding');
  });

  it('does not flag voided charges as overdue', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-02-01T00:00:00.000Z',
        outstandingCents: 5000,
        status: 'VOID',
      }),
    ];
    expect(computeInsights(rows)).toHaveLength(0);
  });

  it('does not flag future charges as overdue', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-04-01T00:00:00.000Z',
        outstandingCents: 5000,
        status: 'OPEN',
      }),
    ];
    expect(computeInsights(rows)).toHaveLength(0);
  });

  it('does not flag paid charges as overdue', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-02-01T00:00:00.000Z',
        outstandingCents: 0,
        status: 'PAID',
      }),
    ];
    expect(computeInsights(rows)).toHaveLength(0);
  });

  it('flags high severity for charges overdue > 30 days', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-01-01T00:00:00.000Z',
        outstandingCents: 5000,
        status: 'OPEN',
      }),
    ];
    const insights = computeInsights(rows);
    expect(insights[0].severity).toBe('high');
  });

  it('flags medium severity for charges overdue <= 30 days', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-03-01T00:00:00.000Z',
        outstandingCents: 5000,
        status: 'OPEN',
      }),
    ];
    const insights = computeInsights(rows);
    expect(insights[0].severity).toBe('medium');
  });

  it('flags unmatched payments', () => {
    const rows = [
      makeRow({
        id: 'p1',
        type: 'payment',
        unallocatedCents: 3000,
      }),
    ];
    const insights = computeInsights(rows);
    expect(insights).toHaveLength(1);
    expect(insights[0].type).toBe('unmatched');
    expect(insights[0].message).toContain('$30.00');
  });

  it('does not flag fully allocated payments', () => {
    const rows = [
      makeRow({
        id: 'p1',
        type: 'payment',
        unallocatedCents: 0,
      }),
    ];
    expect(computeInsights(rows)).toHaveLength(0);
  });

  it('detects duplicate charges (same member, same amount, within 7 days)', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-03-01T00:00:00.000Z',
        membershipId: 'm-1',
        outstandingCents: 5000,
        allocatedCents: 0,
      }),
      makeRow({
        id: 'c2',
        type: 'charge',
        date: '2026-03-03T00:00:00.000Z',
        membershipId: 'm-1',
        outstandingCents: 5000,
        allocatedCents: 0,
      }),
    ];
    const insights = computeInsights(rows);
    const dupes = insights.filter((i) => i.type === 'duplicate');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].rowId).toBe('c2');
  });

  it('does not flag duplicates for different members', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-03-01T00:00:00.000Z',
        membershipId: 'm-1',
        outstandingCents: 5000,
        allocatedCents: 0,
      }),
      makeRow({
        id: 'c2',
        type: 'charge',
        date: '2026-03-03T00:00:00.000Z',
        membershipId: 'm-2',
        outstandingCents: 5000,
        allocatedCents: 0,
      }),
    ];
    const dupes = computeInsights(rows).filter((i) => i.type === 'duplicate');
    expect(dupes).toHaveLength(0);
  });

  it('does not flag duplicates for charges > 7 days apart', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-03-01T00:00:00.000Z',
        membershipId: 'm-1',
        outstandingCents: 5000,
        allocatedCents: 0,
      }),
      makeRow({
        id: 'c2',
        type: 'charge',
        date: '2026-03-15T00:00:00.000Z',
        membershipId: 'm-1',
        outstandingCents: 5000,
        allocatedCents: 0,
      }),
    ];
    const dupes = computeInsights(rows).filter((i) => i.type === 'duplicate');
    expect(dupes).toHaveLength(0);
  });

  it('skips child rows', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-02-01T00:00:00.000Z',
        outstandingCents: 5000,
        status: 'OPEN',
        isChild: true,
      }),
    ];
    expect(computeInsights(rows)).toHaveLength(0);
  });

  it('handles multiple insight types on different rows', () => {
    const rows = [
      makeRow({
        id: 'c1',
        type: 'charge',
        date: '2026-02-01T00:00:00.000Z',
        outstandingCents: 5000,
        status: 'OPEN',
      }),
      makeRow({
        id: 'p1',
        type: 'payment',
        unallocatedCents: 2000,
      }),
    ];
    const insights = computeInsights(rows);
    expect(insights).toHaveLength(2);
    expect(insights.map((i) => i.type).sort()).toEqual(['overdue', 'unmatched']);
  });
});
