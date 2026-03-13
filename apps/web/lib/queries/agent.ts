import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
const API_URL = '/api/v1';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProposedAction {
  id: string;
  toolName: string;
  args: Record<string, any>;
  description: string;
}

export interface ActionResult {
  toolName: string;
  success: boolean;
  message: string;
  details?: any;
  skipped?: Array<{ id: string; reason: string }>;
}

interface SSEEvent {
  type: 'text' | 'tool_calls' | 'done' | 'error';
  content?: string;
  actions?: ProposedAction[];
  message?: string;
}

// ── Session types ───────────────────────────────────────────

export interface AgentSession {
  id: string;
  title: string;
  messages: any;
  createdAt: string;
  updatedAt: string;
  actor?: { id: string; name: string };
}

export interface AgentSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  actor?: { id: string; name: string };
}

export interface SpreadsheetContext {
  selectedRows: Array<{
    id: string;
    type: 'charge' | 'expense' | 'payment';
    description: string;
    member?: string;
    category: string;
    incomeCents: number;
    outstandingCents: number;
    expenseCents: number;
    status?: string;
    unallocatedCents?: number;
  }>;
}

export interface SpreadsheetQueryResult {
  type: 'filter' | 'compute' | 'sort';
  // filter
  typeFilter?: string;
  search?: string;
  statuses?: string[];
  categories?: string[];
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
  // compute — expression for client-side evaluation
  expression?: 'sum' | 'count' | 'avg' | 'min' | 'max';
  field?: string;
  explanation?: string;
  filters?: { type?: string; status?: string; category?: string };
  // computed result (set by frontend after evaluation)
  result?: string;
  // sort
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function querySpreadsheet(
  orgId: string,
  query: string,
  viewMetadata: { typeFilter: string; rowCount: number; columns: string[] },
): Promise<SpreadsheetQueryResult> {
  const response = await fetch(`${API_URL}/organizations/${orgId}/agent/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ query, viewMetadata }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Query failed' }));
    throw new Error(err.message || 'Query failed');
  }

  return response.json();
}

export async function streamAgentChat(
  orgId: string,
  messages: ChatMessage[],
  csvContent: string | undefined,
  onTextChunk: (text: string) => void,
  onToolCalls: (actions: ProposedAction[]) => void,
  onDone: () => void,
  onError: (error: string) => void,
  spreadsheetContext?: SpreadsheetContext,
): Promise<void> {
  const response = await fetch(`${API_URL}/organizations/${orgId}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ messages, csvContent, spreadsheetContext }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Request failed' }));
    onError(err.message || `Error ${response.status}`);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError('No response stream');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event: SSEEvent = JSON.parse(jsonStr);
          switch (event.type) {
            case 'text':
              if (event.content) onTextChunk(event.content);
              break;
            case 'tool_calls':
              if (event.actions) onToolCalls(event.actions);
              break;
            case 'done':
              onDone();
              return;
            case 'error':
              onError(event.message || 'Unknown error');
              return;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
    onDone();
  } catch (err: any) {
    onError(err.message || 'Stream interrupted');
  }
}

export async function confirmAgentActions(
  orgId: string,
  actions: Array<{ toolName: string; args: Record<string, any> }>,
): Promise<ActionResult[]> {
  const response = await fetch(`${API_URL}/organizations/${orgId}/agent/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ actions }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Confirm failed' }));
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(msg || 'Confirm failed');
  }

  return response.json();
}

// ── Session hooks ──────────────────────────────────────────

export function useAgentSessions(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.agentSessions.list(orgId),
    queryFn: () =>
      api.get<AgentSessionSummary[]>(`/organizations/${orgId}/agent/sessions`),
    enabled: !!orgId,
  });
}

export function useAgentSession(orgId: string | null, sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.agentSessions.detail(orgId, sessionId),
    queryFn: () =>
      api.get<AgentSession>(`/organizations/${orgId}/agent/sessions/${sessionId}`),
    enabled: !!orgId && !!sessionId,
  });
}

export function useCreateAgentSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId }: { orgId: string }) =>
      api.post<AgentSession>(`/organizations/${orgId}/agent/sessions`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all(orgId) });
    },
  });
}

export function useUpdateAgentSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      sessionId,
      data,
    }: {
      orgId: string;
      sessionId: string;
      data: { messages?: any; title?: string };
    }) => api.patch<AgentSession>(`/organizations/${orgId}/agent/sessions/${sessionId}`, data),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all(orgId) });
    },
  });
}

export function useDeleteAgentSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, sessionId }: { orgId: string; sessionId: string }) =>
      api.delete<{ success: boolean }>(`/organizations/${orgId}/agent/sessions/${sessionId}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all(orgId) });
    },
  });
}

// ── Confirm with cache invalidation ───────────────────────

const TOOL_QUERY_MAP: Record<string, (orgId: string) => readonly (readonly unknown[])[]> = {
  add_members: (orgId) => [queryKeys.members.all(orgId)],
  remove_members: (orgId) => [queryKeys.members.all(orgId)],
  update_member: (orgId) => [queryKeys.members.all(orgId)],
  create_charges: (orgId) => [queryKeys.charges.all(orgId), queryKeys.members.all(orgId)],
  update_charge: (orgId) => [queryKeys.charges.all(orgId), queryKeys.members.all(orgId)],
  void_charges: (orgId) => [queryKeys.charges.all(orgId), queryKeys.members.all(orgId)],
  record_payments: (orgId) => [
    queryKeys.payments.all(orgId),
    queryKeys.charges.all(orgId),
    queryKeys.members.all(orgId),
  ],
  create_expense: (orgId) => [queryKeys.expenses.all(orgId)],
  create_multi_charge: (orgId) => [queryKeys.charges.all(orgId), queryKeys.members.all(orgId)],
  create_multi_expense: (orgId) => [queryKeys.expenses.all(orgId)],
  update_expense: (orgId) => [queryKeys.expenses.all(orgId)],
  delete_expenses: (orgId) => [queryKeys.expenses.all(orgId)],
  restore_charges: (orgId) => [queryKeys.charges.all(orgId), queryKeys.members.all(orgId)],
  restore_expenses: (orgId) => [queryKeys.expenses.all(orgId)],
  restore_members: (orgId) => [queryKeys.members.all(orgId)],
  delete_payments: (orgId) => [
    queryKeys.payments.all(orgId),
    queryKeys.charges.all(orgId),
    queryKeys.members.all(orgId),
  ],
  restore_payments: (orgId) => [
    queryKeys.payments.all(orgId),
    queryKeys.charges.all(orgId),
    queryKeys.members.all(orgId),
  ],
  import_csv: (orgId) => [
    queryKeys.members.all(orgId),
    queryKeys.charges.all(orgId),
    queryKeys.payments.all(orgId),
    queryKeys.expenses.all(orgId),
  ],
  allocate_payment: (orgId) => [queryKeys.payments.all(orgId), queryKeys.charges.all(orgId), queryKeys.members.all(orgId)],
  auto_allocate_payment: (orgId) => [queryKeys.payments.all(orgId), queryKeys.charges.all(orgId), queryKeys.members.all(orgId)],
};

export function useConfirmAgentActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      actions,
    }: {
      orgId: string;
      actions: Array<{ toolName: string; args: Record<string, any> }>;
    }) => confirmAgentActions(orgId, actions),
    onSuccess: (_, { orgId, actions }) => {
      // Always invalidate dashboard + audit
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(orgId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(orgId) });
      // Invalidate per-tool query keys
      const seen = new Set<string>();
      for (const action of actions) {
        const getKeys = TOOL_QUERY_MAP[action.toolName];
        if (!getKeys) continue;
        for (const key of getKeys(orgId)) {
          const k = JSON.stringify(key);
          if (seen.has(k)) continue;
          seen.add(k);
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
    },
  });
}
