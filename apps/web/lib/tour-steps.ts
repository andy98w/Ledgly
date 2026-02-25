export interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  page?: string;
}

export const tourSteps: TourStep[] = [
  {
    id: 'sidebar-nav',
    target: '[data-tour="sidebar-nav"]',
    title: 'Navigation',
    description:
      'This is your navigation. Each section manages a different part of your org\'s finances.',
    placement: 'right',
    page: '/dashboard',
  },
  {
    id: 'dashboard-stats',
    target: '[data-tour="dashboard-stats"]',
    title: 'Financial Overview',
    description:
      'Your financial overview at a glance — outstanding charges, collections, members, and overdue items.',
    placement: 'bottom',
    page: '/dashboard',
  },
  {
    id: 'inbox-content',
    target: '[data-tour="inbox-content"]',
    title: 'Inbox',
    description:
      'Connect Gmail to auto-import Venmo, Zelle, and CashApp notifications. Payments get matched to members automatically.',
    placement: 'left',
    page: '/inbox',
  },
  {
    id: 'quick-actions',
    target: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    description:
      'Jump straight to the most common tasks: add members, create charges, or record payments.',
    placement: 'top',
    page: '/dashboard',
  },
  {
    id: 'members-list',
    target: '[data-tour="members-list"]',
    title: 'Members',
    description:
      'Manage your members here. Add them first, then create charges against them.',
    placement: 'left',
    page: '/members',
  },
  {
    id: 'charges-list',
    target: '[data-tour="charges-list"]',
    title: 'Charges',
    description:
      'Create charges for dues, events, fines, or fees. Assign to one or multiple members at once.',
    placement: 'top',
    page: '/charges',
  },
  {
    id: 'payments-list',
    target: '[data-tour="payments-list"]',
    title: 'Payments',
    description:
      'Record payments manually or import from Gmail. Allocate payments to charges to track what\'s been paid.',
    placement: 'left',
    page: '/payments',
  },
  {
    id: 'expenses-list',
    target: '[data-tour="expenses-list"]',
    title: 'Expenses',
    description:
      'Track where your org\'s money goes. Log expenses by category, vendor, and date. Gmail imports outgoing payments here automatically.',
    placement: 'left',
    page: '/expenses',
  },
  {
    id: 'spreadsheet-view',
    target: '[data-tour="spreadsheet-view"]',
    title: 'Spreadsheet',
    description:
      'See every charge, payment, and expense in one spreadsheet. Click any cell to edit, sort by columns, and export to CSV.',
    placement: 'left',
    page: '/spreadsheet',
  },
  {
    id: 'audit-list',
    target: '[data-tour="audit-list"]',
    title: 'Audit Log',
    description:
      'Every action is tracked here. See who did what, and undo or redo any change with one click.',
    placement: 'left',
    page: '/audit',
  },
  {
    id: 'settings-tutorial',
    target: '[data-tour="launch-tutorial"]',
    title: 'Happy Financing! 🎉',
    description:
      'You\'re all set! If you ever want to revisit this tour, you can relaunch it from the Settings page right here.',
    placement: 'top',
    page: '/settings',
  },
];
