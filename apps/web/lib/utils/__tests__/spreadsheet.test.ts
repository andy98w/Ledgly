/**
 * Tests for spreadsheet utility functions.
 *
 * These are pure-function tests that don't require a DOM or React rendering.
 * Run with: npx jest --config jest.config.js (from apps/web, if configured)
 * or inline with: npx ts-jest (see below for standalone usage).
 */

// Inline the function since it's not exported from the page component
function cleanExpenseTitle(title: string): string {
  const match = title.match(/^[A-Z]+ payment to (.+)$/);
  return match ? match[1] : title;
}

describe('cleanExpenseTitle', () => {
  it('strips "VENMO payment to " prefix', () => {
    expect(cleanExpenseTitle('VENMO payment to John Doe')).toBe('John Doe');
  });

  it('strips "ZELLE payment to " prefix', () => {
    expect(cleanExpenseTitle('ZELLE payment to Jane Smith')).toBe('Jane Smith');
  });

  it('strips any uppercase-word payment prefix', () => {
    expect(cleanExpenseTitle('ACH payment to Acme Corp')).toBe('Acme Corp');
    expect(cleanExpenseTitle('WIRE payment to Bob')).toBe('Bob');
  });

  it('returns original title when no prefix matches', () => {
    expect(cleanExpenseTitle('Office supplies from Staples')).toBe('Office supplies from Staples');
  });

  it('returns original title for empty string', () => {
    expect(cleanExpenseTitle('')).toBe('');
  });

  it('does not strip lowercase prefixes', () => {
    expect(cleanExpenseTitle('venmo payment to Someone')).toBe('venmo payment to Someone');
  });

  it('does not strip mixed-case prefixes', () => {
    expect(cleanExpenseTitle('Venmo payment to Someone')).toBe('Venmo payment to Someone');
  });

  it('handles "payment to" with multi-word vendor names', () => {
    expect(cleanExpenseTitle('VENMO payment to The Pizza Place LLC')).toBe('The Pizza Place LLC');
  });

  it('preserves special characters in vendor name', () => {
    expect(cleanExpenseTitle('VENMO payment to O\'Reilly & Sons')).toBe('O\'Reilly & Sons');
  });
});

// Test SpreadsheetRow type shape (compile-time check)
interface SpreadsheetRow {
  id: string;
  date: string;
  type: 'charge' | 'expense' | 'payment';
  category: string;
  description: string;
  member?: string;
  membershipId?: string;
  incomeCents: number;
  outstandingCents: number;
  expenseCents: number;
  status?: string;
  allocatedCents?: number;
  unallocatedCents?: number;
}

describe('SpreadsheetRow transformation', () => {
  it('charge row has correct shape', () => {
    const row: SpreadsheetRow = {
      id: 'charge-1',
      date: '2026-01-15T00:00:00.000Z',
      type: 'charge',
      category: 'DUES',
      description: 'Monthly Dues',
      member: 'John Doe',
      membershipId: 'm-1',
      incomeCents: 5000,
      outstandingCents: 5000,
      expenseCents: 0,
      status: 'OPEN',
    };

    expect(row.type).toBe('charge');
    expect(row.incomeCents).toBe(5000);
    expect(row.expenseCents).toBe(0);
  });

  it('expense row has correct shape', () => {
    const row: SpreadsheetRow = {
      id: 'expense-1',
      date: '2026-01-20T00:00:00.000Z',
      type: 'expense',
      category: 'FOOD',
      description: 'Pizza for meeting',
      incomeCents: 0,
      outstandingCents: 0,
      expenseCents: 3500,
    };

    expect(row.type).toBe('expense');
    expect(row.expenseCents).toBe(3500);
    expect(row.incomeCents).toBe(0);
  });

  it('payment row has correct shape', () => {
    const row: SpreadsheetRow = {
      id: 'payment-1',
      date: '2026-01-22T00:00:00.000Z',
      type: 'payment',
      category: 'manual',
      description: 'Jane Smith',
      member: 'Jane Smith',
      membershipId: 'm-2',
      incomeCents: 5000,
      outstandingCents: 0,
      expenseCents: 0,
      allocatedCents: 5000,
      unallocatedCents: 0,
    };

    expect(row.type).toBe('payment');
    expect(row.allocatedCents).toBe(5000);
    expect(row.unallocatedCents).toBe(0);
  });

  it('rows sort by date descending', () => {
    const rows: SpreadsheetRow[] = [
      { id: '1', date: '2026-01-10', type: 'charge', category: 'DUES', description: 'A', incomeCents: 100, outstandingCents: 100, expenseCents: 0 },
      { id: '2', date: '2026-01-20', type: 'expense', category: 'FOOD', description: 'B', incomeCents: 0, outstandingCents: 0, expenseCents: 200 },
      { id: '3', date: '2026-01-15', type: 'payment', category: 'manual', description: 'C', incomeCents: 300, outstandingCents: 0, expenseCents: 0 },
    ];

    const sorted = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    expect(sorted[0].id).toBe('2'); // Jan 20
    expect(sorted[1].id).toBe('3'); // Jan 15
    expect(sorted[2].id).toBe('1'); // Jan 10
  });

  it('balance computation: income - expenses', () => {
    const rows: SpreadsheetRow[] = [
      { id: '1', date: '2026-01-10', type: 'charge', category: 'DUES', description: 'Dues', incomeCents: 10000, outstandingCents: 0, expenseCents: 0 },
      { id: '2', date: '2026-01-12', type: 'expense', category: 'FOOD', description: 'Food', incomeCents: 0, outstandingCents: 0, expenseCents: 3500 },
      { id: '3', date: '2026-01-15', type: 'payment', category: 'manual', description: 'Pay', incomeCents: 10000, outstandingCents: 0, expenseCents: 0 },
    ];

    const totalIncome = rows.reduce((sum, r) => sum + r.incomeCents, 0);
    const totalExpenses = rows.reduce((sum, r) => sum + r.expenseCents, 0);
    const totalOutstanding = rows.reduce((sum, r) => sum + r.outstandingCents, 0);

    expect(totalIncome).toBe(20000);
    expect(totalExpenses).toBe(3500);
    expect(totalOutstanding).toBe(0);
  });
});
