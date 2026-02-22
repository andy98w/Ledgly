export interface ChargeGroup {
  key: string;
  title: string;
  category: string;
  amountCents: number;
  dueDate: string | null;
  createdAt: string;
  charges: any[];
  totalAmount: number;
  totalPaid: number;
  memberCount: number;
}

/**
 * Groups charges by title + category + due date + created within 1 minute.
 * Uses O(1) Map lookup per charge instead of O(n) iteration over all groups.
 */
export function groupCharges(charges: any[]): ChargeGroup[] {
  const allGroups: ChargeGroup[] = [];
  // Maps baseKey -> the most recent group for that key (for 1-minute window matching)
  const latestGroupByBaseKey = new Map<string, ChargeGroup>();

  // Sort by createdAt first
  const sorted = [...charges].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const charge of sorted) {
    const dueDateKey = charge.dueDate
      ? new Date(charge.dueDate).toISOString().split('T')[0]
      : 'no-due';
    const baseKey = `${charge.title}|${charge.category}|${dueDateKey}`;

    const existingGroup = latestGroupByBaseKey.get(baseKey);

    if (existingGroup) {
      const groupTime = new Date(existingGroup.createdAt).getTime();
      const chargeTime = new Date(charge.createdAt).getTime();

      if (Math.abs(chargeTime - groupTime) < 60000) {
        existingGroup.charges.push(charge);
        existingGroup.totalAmount += charge.amountCents;
        existingGroup.totalPaid += charge.allocatedCents || 0;
        existingGroup.memberCount++;
        continue;
      }
    }

    // No match — create a new group
    const groupKey = `${baseKey}|${charge.createdAt}`;
    const newGroup: ChargeGroup = {
      key: groupKey,
      title: charge.title,
      category: charge.category,
      amountCents: charge.amountCents,
      dueDate: charge.dueDate,
      createdAt: charge.createdAt,
      charges: [charge],
      totalAmount: charge.amountCents,
      totalPaid: charge.allocatedCents || 0,
      memberCount: 1,
    };

    allGroups.push(newGroup);
    latestGroupByBaseKey.set(baseKey, newGroup);
  }

  // Sort groups by createdAt descending (newest first)
  return allGroups.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
