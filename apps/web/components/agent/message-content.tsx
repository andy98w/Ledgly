'use client';

import { useMemo, useState, useEffect } from 'react';
import { Check, X, XCircle, Loader2, AlertCircle, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatCents } from '@/lib/utils';
import { useMembers } from '@/lib/queries/members';
import type { ProposedAction, ActionResult } from '@/lib/queries/agent';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  actions?: ProposedAction[];
  actionStatus?: 'pending' | 'confirming' | 'confirmed' | 'cancelled';
  actionResults?: ActionResult[];
  csvFileName?: string;
}

export function formatMessageTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Lightweight inline markdown: **bold**, *italic*, `code` */
export function InlineMarkdown({ text }: { text: string }) {
  const parts = useMemo(() => {
    const tokens: { type: 'text' | 'bold' | 'italic' | 'code'; value: string }[] = [];
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

/** Parse a markdown table row into cell strings */
function parseTableRow(line: string): string[] {
  return line.split('|').slice(1, -1).map((c) => c.trim());
}

/** Check if a line is a table separator (e.g. |---|---|) */
function isTableSeparator(line: string): boolean {
  return /^\|[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(line.trim());
}

/** Render a markdown table block */
function MarkdownTable({ lines }: { lines: string[] }) {
  const headerCells = parseTableRow(lines[0]);
  const bodyLines = lines.filter((_, i) => i > 0 && !isTableSeparator(lines[i]));

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            {headerCells.map((cell, i) => (
              <th key={i} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                <InlineMarkdown text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyLines.map((line, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0">
              {parseTableRow(line).map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 whitespace-nowrap">
                  <InlineMarkdown text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Render text with line-by-line inline markdown + list + table handling */
export function MessageContent({ content }: { content: string }) {
  const lines = content.split('\n');

  const blocks: { type: 'lines' | 'table'; lines: string[]; startIndex: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trimStart();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      const startIndex = i;
      while (i < lines.length) {
        const t = lines[i].trimStart();
        if (t.startsWith('|') && t.endsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        } else break;
      }
      if (tableLines.length >= 2) {
        blocks.push({ type: 'table', lines: tableLines, startIndex });
      } else {
        blocks.push({ type: 'lines', lines: tableLines, startIndex });
      }
    } else {
      if (blocks.length > 0 && blocks[blocks.length - 1].type === 'lines') {
        blocks[blocks.length - 1].lines.push(lines[i]);
      } else {
        blocks.push({ type: 'lines', lines: [lines[i]], startIndex: i });
      }
      i++;
    }
  }

  return (
    <div className="text-sm whitespace-pre-wrap break-words space-y-1">
      {blocks.map((block) => {
        if (block.type === 'table') {
          return <MarkdownTable key={block.startIndex} lines={block.lines} />;
        }
        return block.lines.map((line, li) => {
          const idx = block.startIndex + li;
          const trimmed = line.trimStart();
          if (/^[-*]\s/.test(trimmed)) {
            return (
              <div key={idx} className="flex gap-2 pl-1">
                <span className="text-muted-foreground shrink-0">•</span>
                <span><InlineMarkdown text={trimmed.slice(2)} /></span>
              </div>
            );
          }
          const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
          if (numMatch) {
            return (
              <div key={idx} className="flex gap-2 pl-1">
                <span className="text-muted-foreground shrink-0">{numMatch[1]}.</span>
                <span><InlineMarkdown text={numMatch[2]} /></span>
              </div>
            );
          }
          if (!line.trim()) return <div key={idx} className="h-2" />;
          return <div key={idx}><InlineMarkdown text={line} /></div>;
        });
      })}
    </div>
  );
}

/** Editable inline editor for a single create_charges action */
function ChargeActionEditor({
  action,
  memberNameMap,
  onChange,
}: {
  action: ProposedAction;
  memberNameMap: Map<string, string>;
  onChange: (updated: ProposedAction) => void;
}) {
  const memberIds: string[] = action.args.membershipIds || [];
  const [expanded, setExpanded] = useState(false);
  const VISIBLE_LIMIT = 5;
  const visibleIds = expanded ? memberIds : memberIds.slice(0, VISIBLE_LIMIT);
  const hiddenCount = memberIds.length - VISIBLE_LIMIT;

  const removeMember = (idToRemove: string) => {
    onChange({
      ...action,
      args: {
        ...action.args,
        membershipIds: memberIds.filter((id: string) => id !== idToRemove),
      },
    });
  };

  const updateTitle = (title: string) => {
    onChange({ ...action, args: { ...action.args, title } });
  };

  const updateAmount = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const cents = Math.round(parseFloat(cleaned || '0') * 100);
    if (!isNaN(cents)) {
      onChange({ ...action, args: { ...action.args, amountCents: cents } });
    }
  };

  return (
    <div className="space-y-2">
      {/* Description header */}
      <span className="font-medium text-sm">{action.description}</span>

      {/* Editable fields */}
      <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-2">
        {/* Title */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12 shrink-0">Title</span>
          <input
            type="text"
            value={action.args.title || ''}
            onChange={(e) => updateTitle(e.target.value)}
            className="font-medium text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-full py-0.5"
          />
        </div>

        {/* Amount + metadata row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground w-12 shrink-0">Amount</span>
          <span className="text-muted-foreground text-xs">$</span>
          <input
            type="text"
            value={(action.args.amountCents / 100).toFixed(2)}
            onChange={(e) => updateAmount(e.target.value)}
            className="w-20 text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors tabular-nums py-0.5"
          />
          <span className="text-xs text-muted-foreground">each</span>
          {action.args.category && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {action.args.category}
            </span>
          )}
          {action.args.dueDate && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              Due {new Date(action.args.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Members */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-12 shrink-0">For</span>
            <span className="text-xs text-muted-foreground">
              {memberIds.length} member{memberIds.length !== 1 ? 's' : ''}
            </span>
          </div>
          {memberIds.length === 0 ? (
            <p className="text-xs text-destructive pl-14">No members selected — add at least one to confirm.</p>
          ) : (
            <div className="flex flex-wrap gap-1 pl-14">
              {visibleIds.map((id: string) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-secondary text-foreground"
                >
                  {memberNameMap.get(id) || id.slice(0, 8)}
                  <button
                    type="button"
                    onClick={() => removeMember(id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {!expanded && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-xs px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  +{hiddenCount} more
                </button>
              )}
              {expanded && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="text-xs px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Editable inline editor for a create_multi_expense action */
function ExpenseActionEditor({
  action,
  onChange,
}: {
  action: ProposedAction;
  onChange: (updated: ProposedAction) => void;
}) {
  const children: Array<{ title: string; amountCents: number; vendor?: string }> = action.args.children || [];

  const updateParentTitle = (title: string) => {
    onChange({ ...action, args: { ...action.args, title } });
  };

  const updateChild = (idx: number, field: string, value: any) => {
    const updated = [...children];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange({ ...action, args: { ...action.args, children: updated } });
  };

  const updateChildAmount = (idx: number, raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const cents = Math.round(parseFloat(cleaned || '0') * 100);
    if (!isNaN(cents)) updateChild(idx, 'amountCents', cents);
  };

  const removeChild = (idx: number) => {
    const updated = children.filter((_, i) => i !== idx);
    onChange({ ...action, args: { ...action.args, children: updated } });
  };

  const totalCents = children.reduce((sum, c) => sum + (c.amountCents || 0), 0);

  return (
    <div className="space-y-2">
      <span className="font-medium text-sm">{action.description}</span>

      <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-2">
        {/* Parent title */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-12 shrink-0">Title</span>
          <input
            type="text"
            value={action.args.title || ''}
            onChange={(e) => updateParentTitle(e.target.value)}
            className="font-medium text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-full py-0.5"
          />
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-2 flex-wrap">
          {action.args.category && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {action.args.category}
            </span>
          )}
          {action.args.date && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {new Date(action.args.date).toLocaleDateString()}
            </span>
          )}
          {action.args.vendor && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {action.args.vendor}
            </span>
          )}
        </div>

        {/* Line items */}
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">
            {children.length} line item{children.length !== 1 ? 's' : ''}
          </span>
          {children.length === 0 ? (
            <p className="text-xs text-destructive">No line items — add at least one to confirm.</p>
          ) : (
            <div className="space-y-1">
              {children.map((child, idx) => (
                <div key={idx} className="flex items-center gap-2 pl-2">
                  <input
                    type="text"
                    value={child.title}
                    onChange={(e) => updateChild(idx, 'title', e.target.value)}
                    className="flex-1 text-xs bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5"
                  />
                  <span className="text-muted-foreground text-xs">$</span>
                  <input
                    type="text"
                    value={(child.amountCents / 100).toFixed(2)}
                    onChange={(e) => updateChildAmount(idx, e.target.value)}
                    className="w-20 text-xs bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors tabular-nums py-0.5"
                  />
                  {children.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeChild(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <XIcon className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
          <span className="text-xs text-muted-foreground w-12 shrink-0">Total</span>
          <span className="text-sm font-medium tabular-nums">{formatCents(totalCents)}</span>
        </div>
      </div>
    </div>
  );
}

export function ConfirmationCard({
  actions,
  status,
  results,
  onConfirm,
  onCancel,
  orgId,
}: {
  actions: ProposedAction[];
  status: 'pending' | 'confirming' | 'confirmed' | 'cancelled';
  results?: ActionResult[];
  onConfirm: (modifiedActions: ProposedAction[]) => void;
  onCancel: () => void;
  orgId?: string | null;
}) {
  const allSucceeded = results?.every((r) => r.success);
  const hasSkipped = results?.some((r) => r.skipped && r.skipped.length > 0);

  // Editable copy of actions (only used while status === 'pending')
  const [editableActions, setEditableActions] = useState<ProposedAction[]>(actions);
  useEffect(() => {
    setEditableActions(actions);
  }, [actions]);

  // Resolve member names for charge actions
  const hasCharges = actions.some((a) => a.toolName === 'create_charges' || a.toolName === 'create_multi_charge');
  const { data: membersData } = useMembers(hasCharges ? (orgId ?? null) : null, { limit: 200 });
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (membersData?.data) {
      for (const m of membersData.data) {
        map.set(m.id, m.displayName || m.name || m.id.slice(0, 8));
      }
    }
    return map;
  }, [membersData]);

  const updateAction = (index: number, updated: ProposedAction) => {
    setEditableActions((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  // Disable confirm if any charge action has 0 members
  const hasEmptyCharge = editableActions.some(
    (a) => (a.toolName === 'create_charges' || a.toolName === 'create_multi_charge') && (!a.args.membershipIds || a.args.membershipIds.length === 0),
  );
  const hasEmptyExpense = editableActions.some(
    (a) => a.toolName === 'create_multi_expense' && (!a.args.children || a.args.children.length === 0),
  );

  // Use editableActions for display when pending, original actions otherwise
  const displayActions = status === 'pending' ? editableActions : actions;

  return (
    <div className="mt-3 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 space-y-3">
      <div className="space-y-2">
        {displayActions.map((action, index) => (
          <div key={action.id} className="flex items-start gap-2 text-sm">
            <span className={cn(
              'font-medium shrink-0',
              action.toolName.startsWith('delete') || action.toolName.startsWith('remove') || action.toolName.startsWith('void')
                ? 'text-destructive'
                : action.toolName.startsWith('update')
                  ? 'text-amber-500'
                  : 'text-primary',
            )}>
              {action.toolName.startsWith('delete') || action.toolName.startsWith('remove') || action.toolName.startsWith('void')
                ? '−'
                : action.toolName.startsWith('update')
                  ? '~'
                  : '+'}
            </span>
            <div className="flex-1 min-w-0">
              {(action.toolName === 'create_charges' || action.toolName === 'create_multi_charge') && status === 'pending' ? (
                <ChargeActionEditor
                  action={action}
                  memberNameMap={memberNameMap}
                  onChange={(updated) => updateAction(index, updated)}
                />
              ) : action.toolName === 'create_multi_expense' && status === 'pending' ? (
                <ExpenseActionEditor
                  action={action}
                  onChange={(updated) => updateAction(index, updated)}
                />
              ) : (
                <>
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
                  {action.toolName === 'create_expense' && (
                    <p className="text-muted-foreground mt-0.5">
                      {formatCents(action.args.amountCents)}
                      {action.args.vendor ? ` — ${action.args.vendor}` : ''}
                      {action.args.date ? ` on ${new Date(action.args.date).toLocaleDateString()}` : ''}
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
                  {(action.toolName === 'update_member' || action.toolName === 'update_charge' || action.toolName === 'update_expense') && action.args._old && (
                    <ul className="mt-1 space-y-1 text-sm">
                      {Object.entries(action.args)
                        .filter(([k]) => !k.endsWith('Id') && k !== '_old')
                        .map(([k, v]) => {
                          const oldVal = action.args._old[k];
                          const fmt = (val: any) => k === 'amountCents' ? formatCents(val as number) : k === 'date' || k === 'dueDate' ? new Date(val).toLocaleDateString() : String(val);
                          return (
                            <li key={k} className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground w-16 shrink-0">{k}</span>
                              {oldVal !== undefined && (
                                <span className="line-through text-muted-foreground/60">{fmt(oldVal)}</span>
                              )}
                              {oldVal !== undefined && <span className="text-muted-foreground">→</span>}
                              <span className="font-medium">{fmt(v)}</span>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {status === 'pending' && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={() => onConfirm(editableActions)} disabled={hasEmptyCharge || hasEmptyExpense} className="gap-1.5">
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
