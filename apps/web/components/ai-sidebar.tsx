'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Send, X, Loader2, Sparkles, RotateCcw, Wand2 } from 'lucide-react';
import { useAuthStore, useIsAdminOrTreasurer } from '@/lib/stores/auth';
import { useAISidebarStore } from '@/lib/stores/ai-sidebar';
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
  useDeleteAgentSession,
  useConfirmAgentActions,
  type ChatMessage,
  type ProposedAction,
} from '@/lib/queries/agent';

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

export function AISidebar() {
  const pathname = usePathname();
  const isAdmin = useIsAdminOrTreasurer();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const userName = user?.name || user?.email || 'You';
  const { isOpen, close, toggle } = useAISidebarStore();

  const hidden = !isAdmin || !currentOrgId || pathname === '/agent' || pathname.startsWith('/settings');

  // Auto-close sidebar when navigating to a page where it's hidden
  useEffect(() => {
    if (hidden && isOpen) close();
  }, [hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wizardAction, setWizardAction] = useState<WizardActionId | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isMutatingRef = useRef(false);

  const createSession = useCreateAgentSession();
  const updateSession = useUpdateAgentSession();
  const deleteSession = useDeleteAgentSession();
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

  const saveMessages = useCallback(
    (msgs: DisplayMessage[], sid: string | null) => {
      if (!currentOrgId || !sid) return;
      const firstUserMsg = msgs.find((m) => m.role === 'user');
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
        : 'New conversation';
      updateSession.mutate({
        orgId: currentOrgId,
        sessionId: sid,
        data: { messages: msgs, title },
      });
    },
    [currentOrgId, updateSession],
  );

  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !currentOrgId) return;
    isMutatingRef.current = true;

    const now = new Date().toISOString();
    const userMessage: DisplayMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      createdAt: now,
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
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: stripWizardHints(input.trim()) },
    ];

    let finalMessages = newMessages;

    try {
      await streamAgentChat(
        currentOrgId,
        chatHistory,
        undefined,
        (text) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + text };
            }
            finalMessages = updated;
            return updated;
          });
        },
        (actions) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, actions, actionStatus: 'pending' };
            }
            finalMessages = updated;
            return updated;
          });
        },
        () => {
          isMutatingRef.current = false;
          setIsStreaming(false);
          saveMessages(finalMessages, sid);
        },
        (error) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: last.content || `Something went wrong: ${error}`,
              };
            }
            finalMessages = updated;
            return updated;
          });
          isMutatingRef.current = false;
          setIsStreaming(false);
          saveMessages(finalMessages, sid);
        },
      );
    } catch {
      isMutatingRef.current = false;
      setIsStreaming(false);
    }
  }, [input, isStreaming, currentOrgId, messages, sessionId, createSession, saveMessages]);

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
    } finally {
      isMutatingRef.current = false;
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
    if (sessionId) {
      deleteSession.mutate({ orgId: currentOrgId, sessionId });
      localStorage.removeItem(getStorageKey(currentOrgId));
    }
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
          'max-md:hidden md:top-0 md:bottom-0 md:w-[400px] md:border-l md:border-border',
          isOpen ? 'md:right-0' : 'md:-right-[400px]',
        )}
      >
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="p-3 rounded-xl bg-primary/10 mb-3">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium mb-1">LedgelyAI</p>
              <p className="text-xs text-muted-foreground">Ask me anything about your organization.</p>
            </div>
          )}

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

              <div className={cn('max-w-[85%]', 'text-left')}>
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
                    <MessageContent content={msg.content} />
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
        <div className="border-t border-border shrink-0">
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

          <div className="flex items-end gap-2 px-3 py-2">
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
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
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

      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col md:hidden">
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
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="p-3 rounded-xl bg-primary/10 mb-3">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium mb-1">LedgelyAI</p>
                <p className="text-xs text-muted-foreground">Ask me anything about your organization.</p>
              </div>
            )}

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
                <div className={cn('max-w-[85%]', 'text-left')}>
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
                      <MessageContent content={msg.content} />
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
            <div className="flex items-end gap-2 px-3 py-2">
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
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
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
        </button>
      )}

      {/* Mobile FAB — bottom of screen */}
      {!hidden && !isOpen && (
        <button
          onClick={toggle}
          className="fixed bottom-24 right-4 z-30 md:hidden h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center transition-all hover:scale-105 hover:shadow-xl active:scale-95"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
