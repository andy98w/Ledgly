export interface RowAction {
  label: string;
  type: 'direct' | 'ai';
  action: string;
  icon?: 'reminder' | 'match' | 'allocate' | 'void' | 'delete' | 'search';
  destructive?: boolean;
}

interface ActionRow {
  id: string;
  type: 'charge' | 'expense' | 'payment';
  description: string;
  member?: string;
  outstandingCents: number;
  status?: string;
  unallocatedCents?: number;
  isParent?: boolean;
}

export function getRowActions(row: ActionRow): RowAction[] {
  const actions: RowAction[] = [];

  if (row.type === 'charge') {
    if (row.outstandingCents > 0 && row.status !== 'VOID') {
      if (row.member && !row.isParent) {
        actions.push({
          label: `Send reminder to ${row.member}`,
          type: 'ai',
          action: `Send a payment reminder for the charge "${row.description}" to ${row.member}`,
          icon: 'reminder',
        });
      } else if (row.isParent) {
        actions.push({
          label: 'Send reminders to all',
          type: 'ai',
          action: `Send payment reminders for the charge "${row.description}" to all members who haven't paid`,
          icon: 'reminder',
        });
      }
      actions.push({
        label: 'Auto-match payment',
        type: 'direct',
        action: 'auto-allocate',
        icon: 'match',
      });
    }
    if (row.status !== 'VOID') {
      actions.push({
        label: 'Void charge',
        type: 'direct',
        action: 'void',
        icon: 'void',
        destructive: true,
      });
    }
  }

  if (row.type === 'payment') {
    if (row.unallocatedCents != null && row.unallocatedCents > 0) {
      actions.push({
        label: 'Auto-allocate payment',
        type: 'direct',
        action: 'auto-allocate',
        icon: 'allocate',
      });
      actions.push({
        label: 'Find matching charge',
        type: 'ai',
        action: `Find and allocate the best matching charge for the payment "${row.description}" from ${row.member || 'unknown payer'} ($${((row.unallocatedCents || 0) / 100).toFixed(2)} unallocated)`,
        icon: 'search',
      });
    }
    actions.push({
      label: 'Delete payment',
      type: 'direct',
      action: 'delete',
      icon: 'delete',
      destructive: true,
    });
  }

  if (row.type === 'expense') {
    actions.push({
      label: 'Find similar expenses',
      type: 'ai',
      action: `Find expenses similar to "${row.description}"`,
      icon: 'search',
    });
    actions.push({
      label: 'Delete expense',
      type: 'direct',
      action: 'delete',
      icon: 'delete',
      destructive: true,
    });
  }

  return actions;
}
