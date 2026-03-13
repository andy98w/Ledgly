export interface RowInsight {
  rowId: string;
  type: 'overdue' | 'unmatched' | 'duplicate';
  severity: 'high' | 'medium' | 'low';
  message: string;
}

interface InsightRow {
  id: string;
  type: 'charge' | 'expense' | 'payment';
  date: string;
  description: string;
  member?: string;
  membershipId?: string;
  incomeCents: number;
  outstandingCents: number;
  expenseCents: number;
  status?: string;
  allocatedCents?: number;
  unallocatedCents?: number;
  isChild?: boolean;
}

export function computeInsights(rows: InsightRow[]): RowInsight[] {
  const insights: RowInsight[] = [];
  const now = Date.now();

  for (const row of rows) {
    if (row.isChild) continue;

    // Overdue charges
    if (
      row.type === 'charge' &&
      row.outstandingCents > 0 &&
      row.status !== 'VOID' &&
      new Date(row.date).getTime() < now
    ) {
      const days = Math.floor((now - new Date(row.date).getTime()) / 86400000);
      insights.push({
        rowId: row.id,
        type: 'overdue',
        severity: days > 30 ? 'high' : 'medium',
        message: `Overdue by ${days} day${days !== 1 ? 's' : ''} — $${(row.outstandingCents / 100).toFixed(2)} outstanding`,
      });
    }

    // Unmatched payments
    if (
      row.type === 'payment' &&
      row.unallocatedCents != null &&
      row.unallocatedCents > 0
    ) {
      insights.push({
        rowId: row.id,
        type: 'unmatched',
        severity: 'medium',
        message: `$${(row.unallocatedCents / 100).toFixed(2)} unallocated`,
      });
    }
  }

  // Duplicate detection: same member + same amount within 7 days
  const chargeGroups = new Map<string, InsightRow[]>();
  for (const row of rows) {
    if (row.type !== 'charge' || row.isChild || !row.membershipId) continue;
    const key = `${row.membershipId}:${row.outstandingCents + (row.allocatedCents || 0)}`;
    const group = chargeGroups.get(key) || [];
    group.push(row);
    chargeGroups.set(key, group);
  }
  chargeGroups.forEach((group) => {
    if (group.length < 2) return;
    const sorted = group.sort((a: InsightRow, b: InsightRow) => new Date(a.date).getTime() - new Date(b.date).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const daysDiff = Math.abs(
        new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()
      ) / 86400000;
      if (daysDiff <= 7) {
        insights.push({
          rowId: sorted[i].id,
          type: 'duplicate',
          severity: 'low',
          message: `Possible duplicate — same member & amount within ${Math.ceil(daysDiff)} day${daysDiff > 1 ? 's' : ''}`,
        });
      }
    }
  });

  return insights;
}
