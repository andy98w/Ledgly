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
  agentSessions: {
    all: (orgId: string | null) => ['organizations', orgId, 'agent-sessions'] as const,
    list: (orgId: string | null) => ['organizations', orgId, 'agent-sessions', 'list'] as const,
    detail: (orgId: string | null, sessionId: string | null) =>
      ['organizations', orgId, 'agent-sessions', sessionId] as const,
  },
  dashboard: {
    all: (orgId: string | null) => ['organizations', orgId, 'dashboard'] as const,
  },
  notifications: {
    all: (orgId: string | null) => ['notifications', orgId] as const,
    list: (orgId: string | null, filters: Record<string, any>) =>
      ['notifications', orgId, filters] as const,
    unreadCount: (orgId: string | null) => ['notifications', orgId, 'unread-count'] as const,
  },
  gmail: {
    all: (orgId: string | null) => ['organizations', orgId, 'gmail'] as const,
    status: (orgId: string | null) => ['organizations', orgId, 'gmail', 'status'] as const,
    imports: (orgId: string | null) => ['organizations', orgId, 'gmail', 'imports'] as const,
  },
  schedules: {
    all: (orgId: string | null) => ['organizations', orgId, 'schedules'] as const,
    list: (orgId: string | null) => ['organizations', orgId, 'schedules', 'list'] as const,
  },
  reminders: {
    all: (orgId: string | null) => ['organizations', orgId, 'reminders'] as const,
    rules: (orgId: string | null) => ['organizations', orgId, 'reminders', 'rules'] as const,
  },
  reports: {
    all: (orgId: string | null) => ['organizations', orgId, 'reports'] as const,
    collection: (orgId: string | null, params: Record<string, any>) =>
      ['organizations', orgId, 'reports', 'collection', params] as const,
    outstanding: (orgId: string | null) =>
      ['organizations', orgId, 'reports', 'outstanding'] as const,
    comparison: (orgId: string | null, params: Record<string, any>) =>
      ['organizations', orgId, 'reports', 'comparison', params] as const,
  },
  insights: {
    all: (orgId: string | null) => ['organizations', orgId, 'insights'] as const,
  },
  plaid: {
    all: (orgId: string | null) => ['organizations', orgId, 'plaid'] as const,
    status: (orgId: string | null) => ['organizations', orgId, 'plaid', 'status'] as const,
    connections: (orgId: string | null) =>
      ['organizations', orgId, 'plaid', 'connections'] as const,
  },
  groupme: {
    all: (orgId: string | null) => ['organizations', orgId, 'groupme'] as const,
  },
};
