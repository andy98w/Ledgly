'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { Send, X, Loader2, Sparkles, RotateCcw, Wand2, Paperclip } from 'lucide-react';
import { useAuthStore, useIsAdminOrTreasurer } from '@/lib/stores/auth';
import { useAISidebarStore, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH } from '@/lib/stores/ai-sidebar';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  MessageContent,
  ConfirmationCard,
  formatMessageTime,
  type DisplayMessage,
} from '@/components/agent/message-content';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import {
  WIZARD_ACTIONS,
  WIZARD_ENTITIES,
  WIZARD_TEMPLATES,
  type WizardActionId,
} from '@/components/agent/wizard';
import { BracketInput } from '@/components/agent/bracket-picker';
import {
  streamAgentChat,
  useCreateAgentSession,
  useAgentSession,
  useUpdateAgentSession,
  useConfirmAgentActions,
  type ChatMessage,
  type ProposedAction,
  type SpreadsheetContext,
} from '@/lib/queries/agent';
import { useDashboard } from '@/lib/queries/organizations';
import { useAISuggestions } from '@/hooks/use-ai-suggestions';
import { queryKeys } from '@/lib/query-keys';
import { useSpreadsheetContextStore } from '@/lib/stores/spreadsheet-context';

function getStorageKey(orgId: string) {
  return `ai-sidebar-${orgId}`;
}

// Strip wizard hint text before sending to LLM
function stripWizardHints(text: string): string {
  // Strip parenthesized instruction lines at the end (e.g., "(one per line — email and role optional: Name, Email, Role)")
  let result = text.replace(/\n\([^)]*\)\s*$/, '');
  // Strip list-mode bracket placeholders: [member names], [charge titles], [charge details], [expense details]
  result = result.replace(/\n?\[(?:member (?:names|details)|charge (?:titles|details)|expense details)\]/gi, '');
  return result.trim();
}

function getContextSuggestions(pathname: string, hasSelectedRows: boolean): string[] {
  if (pathname.startsWith('/spreadsheet') && hasSelectedRows) {
    return ['Send reminders to selected', 'Total outstanding for these', 'Void these charges'];
  }
  if (pathname.startsWith('/spreadsheet')) {
    return ['Show unpaid charges', 'Match all unmatched payments'];
  }
  if (pathname.startsWith('/payments')) {
    return ['Match all unmatched payments', "Who hasn't paid?"];
  }
  if (pathname.startsWith('/charges')) {
    return ['Send reminders for unpaid charges', 'Charge all members $50'];
  }
  if (pathname.startsWith('/members')) {
    return ['Show member balances', 'Who owes the most?'];
  }
  if (pathname.startsWith('/expenses')) {
    return ['Show expense summary this month'];
  }
  if (pathname === '/dashboard') {
    return ['Give me a financial summary'];
  }
  return [];
}

export function AISidebar() {
  const pathname = usePathname();
  const isAdmin = useIsAdminOrTreasurer();
  const spreadsheetRows = useSpreadsheetContextStore((s) => s.selectedRows);
  const hasSpreadsheetContext = spreadsheetRows.length > 0;
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const userName = user?.name || user?.email || 'You';
  const { isOpen, close, toggle, width, setWidth, consumePendingMessage } = useAISidebarStore();

  const { data: dashboardStats } = useDashboard(currentOrgId);
  const suggestions = useAISuggestions(dashboardStats);

  const hidden = !isAdmin || !currentOrgId || pathname === '/agent' || pathname.startsWith('/settings');


  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wizardAction, setWizardAction] = useState<WizardActionId | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<{ name: string; content: string; rowCount: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMutatingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isResizing = useRef(false);

  const queryClient = useQueryClient();
  const createSession = useCreateAgentSession();
  const updateSession = useUpdateAgentSession();
  const confirmActions = useConfirmAgentActions();

  // Load persisted session ID
  useEffect(() => {
    if (!currentOrgId || !isOpen) return;
    const storedId = localStorage.getItem(getStorageKey(currentOrgId));
    setSessionId(storedId);
    if (!storedId) setMessages([]);
  }, [currentOrgId, isOpen]);

  const { data: loadedSession } = useAgentSession(
    currentOrgId,
    isOpen ? sessionId : null,
  );

  useEffect(() => {
    if (loadedSession?.messages && sessionId && !isMutatingRef.current) {
      const saved = Array.isArray(loadedSession.messages) ? loadedSession.messages : [];
      setMessages(saved as DisplayMessage[]);
    }
  }, [loadedSession, sessionId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Resize drag handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX - ev.clientX;
      setWidth(startWidth + delta);
    };
    const onUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width, setWidth]);

  const saveMessages = useCallback(
    (msgs: DisplayMessage[], sid: string | null) => {
      if (!currentOrgId || !sid) {
        isMutatingRef.current = false;
        return;
      }
      const firstUserMsg = msgs.find((m) => m.role === 'user');
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
        : 'New conversation';

      // Cancel any in-flight session refetches to prevent stale data overwriting local state
      queryClient.cancelQueries({
        queryKey: queryKeys.agentSessions.detail(currentOrgId, sid),
      });
      // Optimistically update the cache so any subsequent refetch sees correct data
      queryClient.setQueryData(
        queryKeys.agentSessions.detail(currentOrgId, sid),
        (old: any) => old ? { ...old, messages: msgs, title } : { messages: msgs, title },
      );

      updateSession.mutate(
        {
          orgId: currentOrgId,
          sessionId: sid,
          data: { messages: msgs, title },
        },
        {
          onSettled: () => {
            isMutatingRef.current = false;
          },
        },
      );
    },
    [currentOrgId, updateSession, queryClient],
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.csv')) return;
    const text = await file.text();
    const rowCount = text.trim().split('\n').length - 1;
    setCsvFile({ name: file.name, content: text, rowCount: Math.max(rowCount, 0) });
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.csv')) return;
    const text = await file.text();
    const rowCount = text.trim().split('\n').length - 1;
    setCsvFile({ name: file.name, content: text, rowCount: Math.max(rowCount, 0) });
  };

  const handleSend = useCallback(async (overrideMessage?: string) => {
    const messageText = overrideMessage || input.trim();
    if ((!messageText && !csvFile) || isStreaming || !currentOrgId) return;
    isMutatingRef.current = true;

    const userContent = csvFile
      ? `${messageText || 'Please import this CSV data.'}\n\n[Attached: ${csvFile.name}]`
      : messageText;

    const now = new Date().toISOString();
    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      createdAt: now,
      csvFileName: csvFile?.name,
    };
    const assistantMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: now,
    };

    const newMessages = [...messages, userMessage, assistantMessage];
    setMessages(newMessages);
    setInput('');
    setIsStreaming(true);

    let sid = sessionId;
    if (!sid) {
      try {
        const session = await createSession.mutateAsync({ orgId: currentOrgId });
        sid = session.id;
        setSessionId(session.id);
        localStorage.setItem(getStorageKey(currentOrgId), session.id);
      } catch {
        // Continue without persistence
      }
    }

    if (inputRef.current) inputRef.current.style.height = 'auto';

    const chatHistory: ChatMessage[] = [
      ...messages
        .filter((m) => m.content || (m.role === 'assistant' && m.actions?.length))
        .map((m) => {
          // For assistant messages that had tool calls, append the action outcome
          // so the LLM knows whether to re-propose or move on
          if (m.role === 'assistant' && m.actions && m.actions.length > 0) {
            const status = m.actionStatus;
            let suffix: string;
            if (status === 'confirmed') {
              suffix = '\n\n[Actions confirmed.';
              if (m.actionResults?.length) {
                const parts: string[] = [];
                for (const r of m.actionResults) {
                  if (!r.success || !r.details) continue;
                  const d = r.details;
                  if (r.toolName === 'create_charges' || r.toolName === 'create_multi_charge') {
                    const ids = Array.isArray(d)
                      ? d.map((c: any) => c.id)
                      : [d.parent?.id, ...(d.children?.map((c: any) => c.id) || [])].filter(Boolean);
                    if (ids.length) parts.push(`created charges [${ids.join(', ')}]`);
                  } else if (r.toolName === 'create_expense') {
                    if (d.id) parts.push(`created expense [${d.id}]`);
                  } else if (r.toolName === 'create_multi_expense') {
                    const ids = [d.id, ...(d.children?.map((c: any) => c.id) || [])].filter(Boolean);
                    if (ids.length) parts.push(`created expenses [${ids.join(', ')}]`);
                  } else if (r.toolName === 'add_members') {
                    const ids = Array.isArray(d) ? d.map((m: any) => m.id) : [];
                    if (ids.length) parts.push(`added members [${ids.join(', ')}]`);
                  } else if (r.toolName === 'record_payments') {
                    const ids = d.created?.map((p: any) => p.id) || (Array.isArray(d) ? d.map((p: any) => p.id) : []);
                    if (ids.length) parts.push(`recorded payments [${ids.join(', ')}]`);
                  } else if (r.toolName === 'void_charges') {
                    const ids = m.actions!.find((a) => a.toolName === 'void_charges')?.args?.chargeIds || [];
                    if (ids.length) parts.push(`voided charges [${ids.join(', ')}]`);
                  } else if (r.toolName === 'delete_expenses') {
                    const ids = m.actions!.find((a) => a.toolName === 'delete_expenses')?.args?.expenseIds || [];
                    if (ids.length) parts.push(`deleted expenses [${ids.join(', ')}]`);
                  } else if (r.toolName === 'remove_members') {
                    const ids = m.actions!.find((a) => a.toolName === 'remove_members')?.args?.memberIds || [];
                    if (ids.length) parts.push(`removed members [${ids.join(', ')}]`);
                  } else if (r.toolName === 'delete_payments') {
                    const ids = m.actions!.find((a) => a.toolName === 'delete_payments')?.args?.paymentIds || [];
                    if (ids.length) parts.push(`deleted payments [${ids.join(', ')}]`);
                  } else if (r.toolName === 'restore_charges') {
                    const ids = m.actions!.find((a) => a.toolName === 'restore_charges')?.args?.chargeIds || [];
                    if (ids.length) parts.push(`restored charges [${ids.join(', ')}]`);
                  } else if (r.toolName === 'restore_expenses') {
                    const ids = m.actions!.find((a) => a.toolName === 'restore_expenses')?.args?.expenseIds || [];
                    if (ids.length) parts.push(`restored expenses [${ids.join(', ')}]`);
                  } else if (r.toolName === 'restore_members') {
                    const ids = m.actions!.find((a) => a.toolName === 'restore_members')?.args?.memberIds || [];
                    if (ids.length) parts.push(`restored members [${ids.join(', ')}]`);
                  } else if (r.toolName === 'restore_payments') {
                    const ids = m.actions!.find((a) => a.toolName === 'restore_payments')?.args?.paymentIds || [];
                    if (ids.length) parts.push(`restored payments [${ids.join(', ')}]`);
                  } else if (r.toolName === 'deallocate_payment') {
                    const count = d.removedCount ?? m.actions!.find((a) => a.toolName === 'deallocate_payment')?.args?.allocationIds?.length ?? 0;
                    parts.push(`deallocated ${count} match(es)`);
                  } else if (r.toolName === 'send_reminders') {
                    parts.push(`sent ${d.sent ?? 0} reminder(s)`);
                  }
                }
                if (parts.length) suffix += ` Results: ${parts.join(', ')}.`;
              }
              suffix += ']';
            } else if (status === 'cancelled') {
              suffix = '\n\n[User cancelled the proposed actions.]';
            } else {
              suffix = '\n\n[Proposed actions were not confirmed — user moved on.]';
            }
            return { role: m.role, content: (m.content || '') + suffix };
          }
          return { role: m.role, content: m.content };
        }),
      { role: 'user' as const, content: stripWizardHints(messageText) || 'Please import this CSV data.' },
    ];

    const csvContent = csvFile?.content;
    setCsvFile(null);

    let finalMessages = newMessages;

    const updateLastAssistant = (patch: Partial<DisplayMessage>) => {
      const updated = [...finalMessages];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = { ...last, ...patch };
      }
      finalMessages = updated;
      setMessages(updated);
    };

    const ssContext: SpreadsheetContext | undefined = hasSpreadsheetContext
      ? { selectedRows: spreadsheetRows }
      : undefined;

    try {
      await streamAgentChat(
        currentOrgId,
        chatHistory,
        csvContent,
        (text) => {
          const last = finalMessages[finalMessages.length - 1];
          updateLastAssistant({ content: (last?.content || '') + text });
        },
        (actions) => {
          updateLastAssistant({ actions, actionStatus: 'pending' });
        },
        () => {
          setIsStreaming(false);
          saveMessages(finalMessages, sid);
        },
        (error) => {
          const last = finalMessages[finalMessages.length - 1];
          updateLastAssistant({
            content: last?.content || `Something went wrong: ${error}`,
          });
          setIsStreaming(false);
          saveMessages(finalMessages, sid);
        },
        ssContext,
      );
    } catch {
      isMutatingRef.current = false;
      setIsStreaming(false);
    }
  }, [input, csvFile, isStreaming, currentOrgId, messages, sessionId, createSession, saveMessages, hasSpreadsheetContext, spreadsheetRows]);

  useEffect(() => {
    if (!isOpen || isStreaming) return;
    const pending = consumePendingMessage();
    if (pending) {
      setTimeout(() => handleSend(pending), 300);
    }
  }, [isOpen]);

  const handleConfirm = async (messageId: string, modifiedActions?: ProposedAction[]) => {
    if (!currentOrgId) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.actions) return;

    const actionsToSend = modifiedActions || msg.actions;
    isMutatingRef.current = true;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, actionStatus: 'confirming' } : m)),
    );

    try {
      const results = await confirmActions.mutateAsync({
        orgId: currentOrgId,
        actions: actionsToSend.map((a) => ({ toolName: a.toolName, args: a.args })),
      });
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === messageId ? { ...m, actionStatus: 'confirmed' as const, actionResults: results } : m,
        );
        saveMessages(updated, sessionId);
        return updated;
      });
    } catch (err: any) {
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                actionStatus: 'confirmed' as const,
                actionResults: [{ toolName: '', success: false, message: err.message || 'Action failed' }],
              }
            : m,
        );
        saveMessages(updated, sessionId);
        return updated;
      });
    }
  };

  const handleCancel = (messageId: string) => {
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.id === messageId ? { ...m, actionStatus: 'cancelled' as const } : m,
      );
      saveMessages(updated, sessionId);
      return updated;
    });
  };

  const handleReset = () => {
    if (!currentOrgId) return;
    // Don't delete the session — just clear local state so it stays visible
    // in the agent page's session list
    localStorage.removeItem(getStorageKey(currentOrgId));
    setSessionId(null);
    setMessages([]);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (hidden) return null;

  return (
    <>
      {/* Sidebar panel — desktop: fixed right, mobile: full-screen overlay */}
      <div
        className={cn(
          'fixed z-40 bg-background flex flex-col transition-[right] duration-300 ease-in-out',
          // Desktop
          'max-md:hidden md:top-0 md:bottom-0 md:border-l md:border-border',
          isOpen ? 'md:right-0' : 'md:-right-[var(--sidebar-w)]',
        )}
        style={{ '--sidebar-w': `${width}px`, width: `${width}px` } as React.CSSProperties}
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-50 hidden md:block"
        />
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Chat</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleReset}
              title="Reset conversation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={close}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-xl border-2 border-dashed border-primary">
              <div className="text-center">
                <Paperclip className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium">Drop CSV file here</p>
              </div>
            </div>
          )}
          {messages.length === 0 && (() => {
            const suggestions = getContextSuggestions(pathname, hasSpreadsheetContext);
            return (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="p-3 rounded-xl bg-primary/10 mb-3">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium mb-1">LedgelyAI</p>
                <p className="text-xs text-muted-foreground mb-4">Ask me anything about your organization.</p>
                {suggestions.length > 0 && (
                  <div className="space-y-1.5 w-full max-w-[240px]">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        disabled={isStreaming}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border/50 bg-secondary/30 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-2',
                msg.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              {msg.role !== 'user' && (
                <div className="shrink-0 mt-1">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
              )}

              <div className={cn('max-w-[85%]', msg.role === 'user' ? 'text-right' : 'text-left')}>
                <div className={cn('flex items-center gap-2 mb-0.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <span className="text-xs font-medium text-muted-foreground">
                    {msg.role === 'user' ? userName : 'LedgelyAI'}
                  </span>
                  {msg.createdAt && (
                    <span className="text-xs text-muted-foreground/50">
                      {formatMessageTime(msg.createdAt)}
                    </span>
                  )}
                </div>

                <div>
                  {msg.content && (
                    <MessageContent content={msg.content.replace(/\[Actions confirmed\.[\s\S]*?\]/g, '').replace(/^\s*\.?\s*\]?\s*$/g, '').trim()} />
                  )}

                  {msg.role === 'assistant' && isStreaming && msg === messages[messages.length - 1] && !msg.actions && (
                    <span className="inline-block w-1.5 h-3.5 bg-foreground/60 animate-pulse ml-0.5" />
                  )}

                  {msg.actions && msg.actions.length > 0 && (
                    <ConfirmationCard
                      actions={msg.actions}
                      status={msg.actionStatus || 'pending'}
                      results={msg.actionResults}
                      onConfirm={(modified) => handleConfirm(msg.id, modified)}
                      onCancel={() => handleCancel(msg.id)}
                      onUndo={() => handleSend('undo that')}
                      orgId={currentOrgId}
                    />
                  )}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="shrink-0 mt-1">
                  <AvatarGradient name={userName} size="sm" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-border shrink-0">
          {/* Spreadsheet context chip */}
          {hasSpreadsheetContext && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-primary/5">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs text-primary">
                Asking about {spreadsheetRows.length} selected row{spreadsheetRows.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {/* Inline wizard bar */}
          {wizardOpen && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50 bg-secondary/20">
              {!wizardAction ? (
                <>
                  {WIZARD_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={() => setWizardAction(action.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {action.label}
                      </button>
                    );
                  })}
                </>
              ) : (
                <>
                  {WIZARD_ENTITIES.filter((e) => e.actions.includes(wizardAction)).map((entity) => (
                    <button
                      key={entity.id}
                      onClick={() => {
                        const template = WIZARD_TEMPLATES[`${wizardAction}-${entity.id}`];
                        if (template) {
                          setInput(template);
                          setWizardAction(null);
                          setWizardOpen(false);
                          setTimeout(() => inputRef.current?.focus(), 0);
                        }
                      }}
                      className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      {entity.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setWizardAction(null)}
                    className="inline-flex items-center rounded-lg p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors ml-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}

          {csvFile && (
            <div className="flex items-center gap-2 px-3 pt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs">
                <Paperclip className="h-3 w-3" />
                {csvFile.name} ({csvFile.rowCount} rows)
                <button
                  onClick={() => setCsvFile(null)}
                  className="ml-0.5 hover:text-primary/70 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}

          <div className="flex items-end gap-2 px-3 py-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground"
              disabled={isStreaming}
              onClick={() => fileInputRef.current?.click()}
              title="Attach CSV"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground"
              disabled={isStreaming}
              onClick={() => { setWizardOpen((v) => !v); setWizardAction(null); }}
            >
              <Wand2 className="h-4 w-4" />
            </Button>

            <BracketInput
              value={input}
              onChange={setInput}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
              orgId={currentOrgId || ''}
              placeholder="Ask something..."
              disabled={isStreaming}
              inputRef={inputRef}
              maxHeight={9999}
              className="resize-none rounded-lg border border-border bg-secondary/30 px-3 py-[7px] text-sm leading-5 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
            />
            <Button
              onClick={() => handleSend()}
              disabled={(!input.trim() && !csvFile) || isStreaming}
              size="icon"
              className="shrink-0 h-9 w-9"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile overlay — z-[60] to sit above mobile nav (z-50) */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col md:hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Chat</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleReset}
                title="Reset conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={close}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-xl border-2 border-dashed border-primary">
                <div className="text-center">
                  <Paperclip className="h-6 w-6 text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium">Drop CSV file here</p>
                </div>
              </div>
            )}
            {messages.length === 0 && (() => {
              const suggestions = getContextSuggestions(pathname, hasSpreadsheetContext);
              return (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="p-3 rounded-xl bg-primary/10 mb-3">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium mb-1">LedgelyAI</p>
                  <p className="text-xs text-muted-foreground mb-4">Ask me anything about your organization.</p>
                  {suggestions.length > 0 && (
                    <div className="space-y-1.5 w-full max-w-[240px]">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleSend(s)}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border/50 bg-secondary/30 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-2',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {msg.role !== 'user' && (
                  <div className="shrink-0 mt-1">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                  </div>
                )}
                <div className={cn('max-w-[85%]', msg.role === 'user' ? 'text-right' : 'text-left')}>
                  <div className={cn('flex items-center gap-2 mb-0.5', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <span className="text-xs font-medium text-muted-foreground">
                      {msg.role === 'user' ? userName : 'LedgelyAI'}
                    </span>
                    {msg.createdAt && (
                      <span className="text-xs text-muted-foreground/50">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    )}
                  </div>
                  <div>
                    {msg.content && (
                      <MessageContent content={msg.content.replace(/\[Actions confirmed\.[\s\S]*?\]/g, '').replace(/^\s*\.?\s*\]?\s*$/g, '').trim()} />
                    )}
                    {msg.role === 'assistant' && isStreaming && msg === messages[messages.length - 1] && !msg.actions && (
                      <span className="inline-block w-1.5 h-3.5 bg-foreground/60 animate-pulse ml-0.5" />
                    )}
                    {msg.actions && msg.actions.length > 0 && (
                      <ConfirmationCard
                        actions={msg.actions}
                        status={msg.actionStatus || 'pending'}
                        results={msg.actionResults}
                        onConfirm={(modified) => handleConfirm(msg.id, modified)}
                        onCancel={() => handleCancel(msg.id)}
                        orgId={currentOrgId}
                      />
                    )}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="shrink-0 mt-1">
                    <AvatarGradient name={userName} size="sm" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-border pb-safe shrink-0">
            {/* Spreadsheet context chip (mobile) */}
            {hasSpreadsheetContext && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-primary/5">
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs text-primary">
                  Asking about {spreadsheetRows.length} selected row{spreadsheetRows.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {/* Inline wizard bar (mobile) */}
            {wizardOpen && (
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50 bg-secondary/20">
                {!wizardAction ? (
                  WIZARD_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        onClick={() => setWizardAction(action.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {action.label}
                      </button>
                    );
                  })
                ) : (
                  <>
                    {WIZARD_ENTITIES.filter((e) => e.actions.includes(wizardAction)).map((entity) => (
                      <button
                        key={entity.id}
                        onClick={() => {
                          const template = WIZARD_TEMPLATES[`${wizardAction}-${entity.id}`];
                          if (template) {
                            setInput(template);
                            setWizardAction(null);
                            setWizardOpen(false);
                            setTimeout(() => inputRef.current?.focus(), 0);
                          }
                        }}
                        className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                      >
                        {entity.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setWizardAction(null)}
                      className="inline-flex items-center rounded-lg p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors ml-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
            {csvFile && (
              <div className="flex items-center gap-2 px-3 pt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs">
                  <Paperclip className="h-3 w-3" />
                  {csvFile.name} ({csvFile.rowCount} rows)
                  <button
                    onClick={() => setCsvFile(null)}
                    className="ml-0.5 hover:text-primary/70 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )}
            <div className="flex items-end gap-2 px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                disabled={isStreaming}
                onClick={() => fileInputRef.current?.click()}
                title="Attach CSV"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground"
                disabled={isStreaming}
                onClick={() => { setWizardOpen((v) => !v); setWizardAction(null); }}
              >
                <Wand2 className="h-4 w-4" />
              </Button>
              <BracketInput
                value={input}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                orgId={currentOrgId || ''}
                placeholder="Ask something..."
                disabled={isStreaming}
                maxHeight={9999}
                className="resize-none rounded-lg border border-border bg-secondary/30 px-3 py-[7px] text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              />
              <Button
                onClick={() => handleSend()}
                disabled={(!input.trim() && !csvFile) || isStreaming}
                size="icon"
                className="shrink-0 h-9 w-9"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle button — top-right */}
      {!hidden && !isOpen && (
        <button
          onClick={toggle}
          className="fixed top-2.5 right-3 z-30 hidden md:flex items-center justify-center rounded-lg h-10 w-10 text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary border border-border/50 transition-colors shadow-sm"
          title="Open AI sidebar"
        >
          <Sparkles className="h-5 w-5 text-primary" />
          {suggestions.length > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              {suggestions.length}
            </span>
          )}
        </button>
      )}

    </>
  );
}
