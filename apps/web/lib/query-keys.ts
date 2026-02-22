export const queryKeys = {
  charges: {
    all: (orgId: string | null) => ['organizations', orgId, 'charges'] as const,
    list: (orgId: string | null, filters: Record<string, any>) =>
      ['organizations', orgId, 'charges', filters] as const,
    detail: (orgId: string | null, chargeId: string | null) =>
      ['organizations', orgId, 'charges', chargeId] as const,
  },
  members: {
    all: (orgId: string | null) => ['organizations', orgId, 'members'] as const,
    list: (orgId: string | null, filters: Record<string, any>) =>
      ['organizations', orgId, 'members', filters] as const,
    detail: (orgId: string | null, memberId: string | null) =>
      ['organizations', orgId, 'members', memberId] as const,
  },
  payments: {
    all: (orgId: string | null) => ['organizations', orgId, 'payments'] as const,
    list: (orgId: string | null, filters: Record<string, any>) =>
      ['organizations', orgId, 'payments', filters] as const,
    detail: (orgId: string | null, paymentId: string | null) =>
      ['organizations', orgId, 'payments', paymentId] as const,
    memberUnallocated: (orgId: string | null, membershipId: string | null) =>
      ['organizations', orgId, 'payments', 'member', membershipId, 'unallocated'] as const,
  },
  expenses: {
    all: (orgId: string | null) => ['organizations', orgId, 'expenses'] as const,
    list: (orgId: string | null, filters: Record<string, any>) =>
      ['organizations', orgId, 'expenses', filters] as const,
    detail: (orgId: string | null, expenseId: string | null) =>
      ['organizations', orgId, 'expenses', expenseId] as const,
    summary: (orgId: string | null, params: Record<string, any>) =>
      ['organizations', orgId, 'expenses', 'summary', params] as const,
  },
  audit: {
    all: (orgId: string | null) => ['organizations', orgId, 'audit'] as const,
    list: (orgId: string | null, options: Record<string, any>) =>
      ['organizations', orgId, 'audit', options] as const,
  },
  dashboard: {
    all: (orgId: string | null) => ['organizations', orgId, 'dashboard'] as const,
  },
};
