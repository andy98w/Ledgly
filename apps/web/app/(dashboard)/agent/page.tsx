'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Paperclip, X, Loader2, Check, XCircle, Sparkles, AlertCircle, Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth';
import { useSidebarStore } from '@/lib/stores/sidebar';
import { cn, formatCents, formatRelativeDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { FadeIn } from '@/components/ui/page-transition';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import {
  streamAgentChat,
  confirmAgentActions,
  useAgentSessions,
  useCreateAgentSession,
  useAgentSession,
  useUpdateAgentSession,
  useDeleteAgentSession,
  type ChatMessage,
  type ProposedAction,
  type ActionResult,
} from '@/lib/queries/agent';


interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  actions?: ProposedAction[];
  actionStatus?: 'pending' | 'confirming' | 'confirmed' | 'cancelled';
  actionResults?: ActionResult[];
  csvFileName?: string;
}

function formatMessageTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Lightweight inline markdown: **bold**, *italic*, `code` */
function InlineMarkdown({ text }: { text: string }) {
  const parts = useMemo(() => {
    const tokens: { type: 'text' | 'bold' | 'italic' | 'code'; value: string }[] = [];
    // Process bold (**), italic (*), and inline code (`)
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      }
      if (match[2]) tokens.push({ type: 'bold', value: match[2] });
      else if (match[3]) tokens.push({ type: 'italic', value: match[3] });
      else if (match[4]) tokens.push({ type: 'code', value: match[4] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      tokens.push({ type: 'text', value: text.slice(lastIndex) });
    }
    return tokens;
  }, [text]);

  return (
    <>
      {parts.map((t, i) => {
        switch (t.type) {
          case 'bold': return <strong key={i} className="font-semibold">{t.value}</strong>;
          case 'italic': return <em key={i}>{t.value}</em>;
          case 'code': return <code key={i} className="px-1 py-0.5 rounded bg-secondary text-xs font-mono">{t.value}</code>;
          default: return <span key={i}>{t.value}</span>;
        }
      })}
    </>
  );
}

/** Render text with line-by-line inline markdown + list handling */
function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="text-sm whitespace-pre-wrap break-words space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        // Bullet list items (- or *)
        if (/^[-*]\s/.test(trimmed)) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-muted-foreground shrink-0">•</span>
              <span><InlineMarkdown text={trimmed.slice(2)} /></span>
            </div>
          );
        }
        // Numbered list items
        const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
        if (numMatch) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-muted-foreground shrink-0">{numMatch[1]}.</span>
              <span><InlineMarkdown text={numMatch[2]} /></span>
            </div>
          );
        }
        // Empty line
        if (!line.trim()) return <div key={i} className="h-2" />;
        // Normal text
        return <div key={i}><InlineMarkdown text={line} /></div>;
      })}
    </div>
  );
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

  // Session queries
  const { data: sessions } = useAgentSessions(currentOrgId);
  const createSession = useCreateAgentSession();
  const updateSession = useUpdateAgentSession();
  const deleteSession = useDeleteAgentSession();
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
    if (loadedSession?.messages && activeSessionId) {
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
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  };

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
      if (!currentOrgId || !sessionId) return;
      // Derive title from first user message
      const firstUserMsg = msgs.find((m) => m.role === 'user');
      const title = firstUserMsg
        ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
        : 'New conversation';
      updateSession.mutate({
        orgId: currentOrgId,
        sessionId,
        data: { messages: msgs, title },
      });
    },
    [currentOrgId, updateSession],
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
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: input.trim() || 'Please import this CSV data.' },
    ];

    const csvContent = csvFile?.content;
    setCsvFile(null);

    let finalMessages = newMessages;

    await streamAgentChat(
      currentOrgId,
      chatHistory,
      csvContent,
      // onTextChunk
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
      // onToolCalls
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
      // onDone
      () => {
        setIsStreaming(false);
        saveMessages(finalMessages, sessionId);
      },
      // onError
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
        setIsStreaming(false);
        saveMessages(finalMessages, sessionId);
      },
    );
  }, [input, csvFile, isStreaming, currentOrgId, messages, activeSessionId, createSession, saveMessages]);

  const handleConfirm = async (messageId: string) => {
    if (!currentOrgId) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.actions) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, actionStatus: 'confirming' } : m)),
    );

    try {
      const results = await confirmAgentActions(
        currentOrgId,
        msg.actions.map((a) => ({ toolName: a.toolName, args: a.args })),
      );
      const updatedMessages = messages.map((m) =>
        m.id === messageId ? { ...m, actionStatus: 'confirmed' as const, actionResults: results } : m,
      );
      setMessages(updatedMessages);
      saveMessages(updatedMessages, activeSessionId);
    } catch (err: any) {
      const updatedMessages = messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              actionStatus: 'confirmed' as const,
              actionResults: [{ toolName: '', success: false, message: err.message }],
            }
          : m,
      );
      setMessages(updatedMessages);
      saveMessages(updatedMessages, activeSessionId);
    }
  };

  const handleCancel = (messageId: string) => {
    const updatedMessages = messages.map((m) =>
      m.id === messageId ? { ...m, actionStatus: 'cancelled' as const } : m,
    );
    setMessages(updatedMessages);
    saveMessages(updatedMessages, activeSessionId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
                  I can help you manage your organization. Try:
                </p>
                <div className="mt-4 grid gap-2 text-sm text-left max-w-sm w-full">
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
                <div className={cn('max-w-[80%] md:max-w-[68%]', msg.role === 'user' ? 'text-right' : 'text-left')}>

                  {/* Name + timestamp */}
                  <div className={cn('flex items-center gap-2 mb-1', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
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
                        onConfirm={() => handleConfirm(msg.id)}
                        onCancel={() => handleCancel(msg.id)}
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

              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask me to manage members, charges, expenses, or payments..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
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

// ── Confirmation Card ─────────────────────────────────────────

function ConfirmationCard({
  actions,
  status,
  results,
  onConfirm,
  onCancel,
}: {
  actions: ProposedAction[];
  status: 'pending' | 'confirming' | 'confirmed' | 'cancelled';
  results?: ActionResult[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const allSucceeded = results?.every((r) => r.success);
  const hasSkipped = results?.some((r) => r.skipped && r.skipped.length > 0);

  return (
    <div className="mt-3 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 space-y-3">
      {/* Action list */}
      <div className="space-y-2">
        {actions.map((action) => (
          <div key={action.id} className="flex items-start gap-2 text-sm">
            <span className="text-primary font-medium shrink-0">+</span>
            <div>
              <span className="font-medium">{action.description}</span>
              {action.toolName === 'add_members' && action.args.members && (
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {action.args.members.slice(0, 10).map((m: any, i: number) => (
                    <li key={i}>
                      {m.name}
                      {m.email ? ` (${m.email})` : ''}
                      {m.role && m.role !== 'MEMBER' ? ` — ${m.role}` : ''}
                    </li>
                  ))}
                  {action.args.members.length > 10 && (
                    <li>...and {action.args.members.length - 10} more</li>
                  )}
                </ul>
              )}
              {action.toolName === 'create_charges' && (
                <p className="text-muted-foreground mt-0.5">
                  {formatCents(action.args.amountCents)} each for {action.args.membershipIds?.length} member(s)
                </p>
              )}
              {action.toolName === 'record_payments' && action.args.payments && (
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {action.args.payments.slice(0, 5).map((p: any, i: number) => (
                    <li key={i}>
                      {formatCents(p.amountCents)} from {p.rawPayerName || 'Unknown'}
                    </li>
                  ))}
                  {action.args.payments.length > 5 && (
                    <li>...and {action.args.payments.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Status / Buttons */}
      {status === 'pending' && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={onConfirm} className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Confirm
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} className="gap-1.5">
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      )}

      {status === 'confirming' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Executing...
        </div>
      )}

      {status === 'confirmed' && (
        <div className="space-y-1.5">
          {allSucceeded && !hasSkipped ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <Check className="h-4 w-4" />
              Done! Actions completed successfully.
            </div>
          ) : allSucceeded && hasSkipped ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <AlertCircle className="h-4 w-4" />
                Completed with warnings
              </div>
              {results?.filter((r) => r.skipped && r.skipped.length > 0).map((r, i) => (
                <p key={i} className="text-xs text-muted-foreground pl-6">
                  {r.message}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {results?.find((r) => !r.success)?.message || 'Some actions failed.'}
              </div>
              {results?.filter((r) => r.skipped && r.skipped.length > 0).map((r, i) => (
                <p key={i} className="text-xs text-muted-foreground pl-6">
                  {r.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {status === 'cancelled' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <XCircle className="h-4 w-4" />
          Cancelled
        </div>
      )}
    </div>
  );
}
