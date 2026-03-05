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
  isMultiCharge: boolean;
  parentId?: string;
}

/**
 * Groups charges into ChargeGroups.
 *
 * Two modes:
 * 1. Parent-child (server-side multi-charges): charges with `children[]` are
 *    built into a group directly from the parent.
 * 2. Legacy: standalone charges without parentId are grouped using the
 *    existing title + category + dueDate + 1-minute window heuristic.
 */
export function groupCharges(charges: any[]): ChargeGroup[] {
  const allGroups: ChargeGroup[] = [];
  const standaloneCharges: any[] = [];

  // First pass: handle parent-child multi-charges
  for (const charge of charges) {
    if (charge.children && charge.children.length > 0) {
      // This is a parent charge with server-side children
      const children = charge.children;
      const totalAmount = children.reduce((sum: number, c: any) => sum + c.amountCents, 0);
      const totalPaid = children.reduce((sum: number, c: any) => sum + (c.allocatedCents || 0), 0);

      allGroups.push({
        key: `multi-${charge.id}`,
        title: charge.title,
        category: charge.category,
        amountCents: charge.amountCents,
        dueDate: charge.dueDate,
        createdAt: charge.createdAt,
        charges: children,
        totalAmount,
        totalPaid,
        memberCount: children.length,
        isMultiCharge: true,
        parentId: charge.id,
      });
    } else if (!charge.parentId) {
      // Standalone charge — goes through legacy grouping
      standaloneCharges.push(charge);
    }
    // Children with parentId are already nested, skip them
  }

  // Second pass: legacy grouping for standalone charges
  if (standaloneCharges.length > 0) {
    const latestGroupByBaseKey = new Map<string, ChargeGroup>();

    const sorted = [...standaloneCharges].sort(
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
        isMultiCharge: false,
      };

      allGroups.push(newGroup);
      latestGroupByBaseKey.set(baseKey, newGroup);
    }
  }

  // Sort groups by createdAt descending (newest first)
  return allGroups.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
