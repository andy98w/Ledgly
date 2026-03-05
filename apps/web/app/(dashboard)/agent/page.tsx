'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Paperclip, X, Loader2, Sparkles, Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft, Wand2 } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth';
import { useSidebarStore } from '@/lib/stores/sidebar';
import { cn, formatRelativeDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { FadeIn } from '@/components/ui/page-transition';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import {
  QuickActionPopover,
  WIZARD_TEMPLATES,
  type WizardActionId,
  type WizardEntityId,
} from '@/components/agent/wizard';
import { BracketInput } from '@/components/agent/bracket-picker';
import {
  MessageContent,
  ConfirmationCard,
  formatMessageTime,
  type DisplayMessage,
} from '@/components/agent/message-content';
import {
  streamAgentChat,
  useAgentSessions,
  useCreateAgentSession,
  useAgentSession,
  useUpdateAgentSession,
  useDeleteAgentSession,
  useConfirmAgentActions,
  type ChatMessage,
  type ProposedAction,
} from '@/lib/queries/agent';
import { queryKeys } from '@/lib/query-keys';

// Strip wizard hint text before sending to LLM
function stripWizardHints(text: string): string {
  // Strip parenthesized instruction lines at the end (e.g., "(one per line — email and role optional: Name, Email, Role)")
  let result = text.replace(/\n\([^)]*\)\s*$/, '');
  // Strip list-mode bracket placeholders: [member names], [charge titles], [charge details], [expense details]
  result = result.replace(/\n?\[(?:member (?:names|details)|charge (?:titles|details)|expense details)\]/gi, '');
  return result.trim();
}

export default function AgentPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const isSidebarCollapsed = useSidebarStore((s) => s.isCollapsed);
  const userName = user?.name || user?.email || 'You';

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [csvFile, setCsvFile] = useState<{ name: string; content: string; rowCount: number } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [wizardAction, setWizardAction] = useState<WizardActionId | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('agent-sidebar-open');
    return saved === null ? false : saved === 'true';
  });

  // Persist sidebar preference
  useEffect(() => {
    localStorage.setItem('agent-sidebar-open', String(showSidebar));
  }, [showSidebar]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMutatingRef = useRef(false);

  // Session queries
  const queryClient = useQueryClient();
  const { data: sessions } = useAgentSessions(currentOrgId);
  const createSession = useCreateAgentSession();
  const updateSession = useUpdateAgentSession();
  const deleteSession = useDeleteAgentSession();
  const confirmActions = useConfirmAgentActions();
  const { data: loadedSession } = useAgentSession(
    currentOrgId,
    activeSessionId,
  );

  // Auto-select the most recent session on first load
  const hasAutoLoaded = useRef(false);
  useEffect(() => {
    if (!hasAutoLoaded.current && sessions && sessions.length > 0 && !activeSessionId) {
      hasAutoLoaded.current = true;
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Load session messages when switching sessions
  useEffect(() => {
    if (loadedSession?.messages && activeSessionId && !isMutatingRef.current) {
      const saved = Array.isArray(loadedSession.messages) ? loadedSession.messages : [];
      setMessages(saved as DisplayMessage[]);
    }
  }, [loadedSession, activeSessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.csv')) return;

    const text = await file.text();
    const rowCount = text.trim().split('\n').length - 1; // minus header
    setCsvFile({ name: file.name, content: text, rowCount: Math.max(rowCount, 0) });
    e.target.value = '';
  };

  const saveMessages = useCallback(
    (msgs: DisplayMessage[], sessionId: string | null) => {
      if (!currentOrgId || !sessionId) {
        isMutatingRef.current = false;
        return;
      }
      // Derive title from first user message
      const firstUserMsg = msgs.find((m) => m.role === 'user');
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
        : 'New conversation';

      // Cancel any in-flight session refetches to prevent stale data overwriting local state
      queryClient.cancelQueries({
        queryKey: queryKeys.agentSessions.detail(currentOrgId, sessionId),
      });
      // Optimistically update the cache so any subsequent refetch sees correct data
      queryClient.setQueryData(
        queryKeys.agentSessions.detail(currentOrgId, sessionId),
        (old: any) => old ? { ...old, messages: msgs, title } : { messages: msgs, title },
      );

      updateSession.mutate(
        {
          orgId: currentOrgId,
          sessionId,
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

  const handleNewChat = async () => {
    if (!currentOrgId) return;
    setMessages([]);
    setActiveSessionId(null);
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!currentOrgId) return;
    deleteSession.mutate({ orgId: currentOrgId, sessionId });
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const handleSend = useCallback(async () => {
    if ((!input.trim() && !csvFile) || isStreaming || !currentOrgId) return;
    isMutatingRef.current = true;

    const userContent = csvFile
      ? `${input.trim() || 'Please import this CSV data.'}\n\n[Attached: ${csvFile.name}]`
      : input.trim();

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

    // Create session if needed
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const session = await createSession.mutateAsync({ orgId: currentOrgId });
        sessionId = session.id;
        setActiveSessionId(session.id);
      } catch {
        // Continue without persistence
      }
    }

    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // Build chat history for API (only text content, not display metadata)
    const chatHistory: ChatMessage[] = [
      ...messages
        .filter((m) => m.content || (m.role === 'assistant' && m.actions?.length))
        .map((m) => {
          if (m.role === 'assistant' && m.actions && m.actions.length > 0) {
            const status = m.actionStatus;
            const suffix =
              status === 'confirmed'
                ? '\n\n[Actions were confirmed and executed successfully.]'
                : status === 'cancelled'
                  ? '\n\n[User cancelled the proposed actions.]'
                  : '\n\n[Proposed actions were not confirmed — user moved on.]';
            return { role: m.role, content: (m.content || '') + suffix };
          }
          return { role: m.role, content: m.content };
        }),
      { role: 'user' as const, content: stripWizardHints(input.trim()) || 'Please import this CSV data.' },
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
          saveMessages(finalMessages, sessionId);
        },
        (error) => {
          const last = finalMessages[finalMessages.length - 1];
          updateLastAssistant({
            content: last?.content || `Something went wrong: ${error}`,
          });
          setIsStreaming(false);
          saveMessages(finalMessages, sessionId);
        },
      );
    } catch {
      isMutatingRef.current = false;
      setIsStreaming(false);
    }
  }, [input, csvFile, isStreaming, currentOrgId, messages, activeSessionId, createSession, saveMessages]);

  const handleConfirm = async (messageId: string, modifiedActions?: ProposedAction[]) => {
    if (!currentOrgId) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.actions) return;

    const actionsToSend = modifiedActions || msg.actions;

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
        saveMessages(updated, activeSessionId);
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
        saveMessages(updated, activeSessionId);
        return updated;
      });
    }
  };

  const handleCancel = (messageId: string) => {
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.id === messageId ? { ...m, actionStatus: 'cancelled' as const } : m,
      );
      saveMessages(updated, activeSessionId);
      return updated;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Drag and drop
  const [isDragging, setIsDragging] = useState(false);

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

  return (
    <FadeIn>
      <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
        {/* Session sidebar */}
        {showSidebar && (
          <div className="w-56 shrink-0 border-r border-border flex flex-col mr-3 hidden md:flex">
            <div className="flex items-center justify-between px-3 py-3 border-b border-border">
              <span className="text-sm font-medium">Sessions</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat}>
                  <Plus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSidebar(false)}>
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
              {sessions?.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer text-sm transition-colors',
                    activeSessionId === s.id
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
                  )}
                  onClick={() => handleSelectSession(s.id)}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground/60 truncate">
                      {formatRelativeDate(s.updatedAt)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(s.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {(!sessions || sessions.length === 0) && (
                <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No conversations yet
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main chat area */}
        <div
          data-tour="agent-chat"
          className="flex-1 flex flex-col min-w-0 px-2 md:px-4"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex items-center gap-2">
            {!showSidebar && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hidden md:flex" onClick={() => setShowSidebar(true)}>
                <PanelLeft className="h-4 w-4" />
              </Button>
            )}
            <PageHeader
              title="LedgelyAI"
              helpText="Use natural language to manage members, charges, expenses, and payments. Drop a CSV file or click the attach button to import data in bulk."
            />
          </div>

          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto mt-6 space-y-4 pb-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="p-4 rounded-2xl bg-primary/10 mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold mb-2">LedgelyAI</h2>
                <p className="text-muted-foreground text-sm max-w-md">
                  I can help you manage your organization.
                </p>

                {/* Suggestion buttons */}
                <div className="grid gap-2 text-sm text-left max-w-sm w-full mt-6">
                  {[
                    'How many members do I have?',
                    'Charge all active members $50 for Spring Dues',
                    'Add John Smith and Jane Doe as members',
                    'Show me all outstanding balances',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="px-4 py-3 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors text-left text-muted-foreground hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {/* Avatar (user: after content visually) */}
                {msg.role !== 'user' && (
                  <div className="shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                )}

                {/* Bubble + meta */}
                <div className={cn("max-w-[90%] md:max-w-[80%]", msg.role === 'user' ? 'text-right' : 'text-left')}>

                  {/* Name + timestamp */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {msg.role === 'user' ? userName : 'LedgelyAI'}
                    </span>
                    {msg.createdAt && (
                      <span className="text-xs text-muted-foreground/50">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    )}
                  </div>

                  {/* Message content — no bubble, transparent */}
                  <div>
                    {msg.content && (
                      <MessageContent content={msg.content} />
                    )}

                    {/* Streaming indicator */}
                    {msg.role === 'assistant' && isStreaming && msg === messages[messages.length - 1] && !msg.actions && (
                      <span className="inline-block w-2 h-4 bg-foreground/60 animate-pulse ml-0.5" />
                    )}

                    {/* Confirmation card */}
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

                {/* User avatar (right side) */}
                {msg.role === 'user' && (
                  <div className="shrink-0 mt-1">
                    <AvatarGradient name={userName} size="sm" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-xl border-2 border-dashed border-primary">
              <div className="text-center">
                <Paperclip className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium">Drop CSV file here</p>
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-border pt-2 mt-auto">
            {csvFile && (
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm">
                  <Paperclip className="h-3.5 w-3.5" />
                  {csvFile.name} ({csvFile.rowCount} rows)
                  <button
                    onClick={() => setCsvFile(null)}
                    className="ml-1 hover:text-primary/70 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            )}

            <div className="flex items-end gap-2">
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
                className="shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming}
              >
                <Paperclip className="h-5 w-5" />
              </Button>

              <QuickActionPopover
                wizardAction={wizardAction}
                open={wizardOpen}
                onOpenChange={(open) => { setWizardOpen(open); if (!open) setWizardAction(null); }}
                onSelectAction={setWizardAction}
                onSelectEntity={(entity) => {
                  const template = WIZARD_TEMPLATES[`${wizardAction}-${entity}`];
                  if (template) {
                    setInput(template);
                    setWizardAction(null);
                    setWizardOpen(false);
                    setTimeout(() => {
                      if (inputRef.current) {
                        inputRef.current.focus();
                        inputRef.current.style.height = 'auto';
                        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px';
                      }
                    }, 0);
                  }
                }}
                onBack={() => setWizardAction(null)}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                  disabled={isStreaming}
                >
                  <Wand2 className="h-5 w-5" />
                </Button>
              </QuickActionPopover>

              <BracketInput
                value={input}
                onChange={setInput}
                onKeyDown={handleKeyDown}
                onSend={handleSend}
                orgId={currentOrgId || ''}
                placeholder="Ask me to manage members, charges, expenses, or payments..."
                disabled={isStreaming}
                inputRef={inputRef}
                maxHeight={160}
                className="resize-none rounded-xl border border-border bg-secondary/30 px-4 py-[9px] text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />

              <Button
                onClick={handleSend}
                disabled={(!input.trim() && !csvFile) || isStreaming}
                size="icon"
                className="shrink-0 h-10 w-10"
              >
                {isStreaming ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>

          </div>
        </div>
      </div>
    </FadeIn>
  );
}
