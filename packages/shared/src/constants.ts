export const MEMBERSHIP_ROLES = ['OWNER', 'ADMIN', 'TREASURER', 'MEMBER'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'INACTIVE', 'LEFT', 'INVITED', 'PENDING'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const CHARGE_CATEGORIES = ['DUES', 'EVENT', 'FINE', 'MERCH', 'OTHER'] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

export const CHARGE_STATUSES = ['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const PAYMENT_SOURCES = ['manual', 'venmo_email', 'csv_venmo', 'csv_bank'] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

export const CHARGE_CATEGORY_LABELS: Record<ChargeCategory, string> = {
  DUES: 'Dues',
  EVENT: 'Event',
  FINE: 'Fine',
  MERCH: 'Merchandise',
  OTHER: 'Other',
};

export const MEMBERSHIP_ROLE_LABELS: Record<MembershipRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  TREASURER: 'Treasurer',
  MEMBER: 'Member',
};

export const EXPENSE_CATEGORIES = ['EVENT', 'SUPPLIES', 'FOOD', 'VENUE', 'MARKETING', 'SERVICES', 'OTHER'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  EVENT: 'Event',
  SUPPLIES: 'Supplies',
  FOOD: 'Food & Drinks',
  VENUE: 'Venue',
  MARKETING: 'Marketing',
  SERVICES: 'Services',
  OTHER: 'Other',
};
