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

const EXPENSE_CATEGORIES = ['EVENT', 'SUPPLIES', 'FOOD', 'VENUE', 'MARKETING', 'SERVICES', 'OTHER'] as const;
const CHARGE_CATEGORIES = ['DUES', 'EVENT', 'FINE', 'MERCH', 'OTHER'] as const;
const MEMBER_ROLES = ['MEMBER', 'ADMIN', 'TREASURER'] as const;

/** Shared editable field row */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
      {children}
    </div>
  );
}

/** Editable editor for a single create_expense action */
function SingleExpenseEditor({
  action,
  onChange,
}: {
  action: ProposedAction;
  onChange: (updated: ProposedAction) => void;
}) {
  const update = (field: string, value: any) => {
    onChange({ ...action, args: { ...action.args, [field]: value } });
  };
  const updateAmount = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const cents = Math.round(parseFloat(cleaned || '0') * 100);
    if (!isNaN(cents)) update('amountCents', cents);
  };

  return (
    <div className="space-y-2">
      <span className="font-medium text-sm">{action.description}</span>
      <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-2">
        <FieldRow label="Title">
          <input type="text" value={action.args.title || ''} onChange={(e) => update('title', e.target.value)}
            className="font-medium text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-full py-0.5" />
        </FieldRow>
        <FieldRow label="Amount">
          <span className="text-muted-foreground text-xs">$</span>
          <input type="text" value={((action.args.amountCents || 0) / 100).toFixed(2)} onChange={(e) => updateAmount(e.target.value)}
            className="w-24 text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors tabular-nums py-0.5" />
        </FieldRow>
        <FieldRow label="Category">
          <select value={action.args.category || 'OTHER'} onChange={(e) => update('category', e.target.value)}
            className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5 cursor-pointer">
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Date">
          <input type="date" value={action.args.date?.slice(0, 10) || ''} onChange={(e) => update('date', e.target.value)}
            className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5" />
        </FieldRow>
        <FieldRow label="Vendor">
          <input type="text" value={action.args.vendor || ''} onChange={(e) => update('vendor', e.target.value)} placeholder="Optional"
            className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-full py-0.5 placeholder:text-muted-foreground/40" />
        </FieldRow>
      </div>
    </div>
  );
}

/** Editable editor for update_expense / update_charge / update_member */
function UpdateFieldsEditor({
  action,
  onChange,
}: {
  action: ProposedAction;
  onChange: (updated: ProposedAction) => void;
}) {
  const old = action.args._old || {};
  const isExpense = action.toolName === 'update_expense';
  const isCharge = action.toolName === 'update_charge';
  const categories = isExpense ? EXPENSE_CATEGORIES : isCharge ? CHARGE_CATEGORIES : null;

  const update = (field: string, value: any) => {
    onChange({ ...action, args: { ...action.args, [field]: value } });
  };
  const updateAmount = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const cents = Math.round(parseFloat(cleaned || '0') * 100);
    if (!isNaN(cents)) update('amountCents', cents);
  };

  // Determine which fields to show: everything the LLM proposed + key fields from _old
  const fields = new Set<string>();
  for (const k of Object.keys(action.args)) {
    if (!k.startsWith('_') && !k.endsWith('Id')) fields.add(k);
  }
  // Always show key fields from old values so user can see context
  for (const k of Object.keys(old)) {
    if (!k.startsWith('_') && !k.endsWith('Id')) fields.add(k);
  }

  const getFieldValue = (field: string) => action.args[field] ?? old[field] ?? '';
  const formatDisplay = (field: string, val: any) => {
    if (val == null || val === '') return '—';
    if (field === 'amountCents') return formatCents(val as number);
    if (field === 'date' || field === 'dueDate') return new Date(val).toLocaleDateString();
    return String(val);
  };

  return (
    <div className="space-y-2">
      <span className="font-medium text-sm">{action.description}</span>
      <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-2">
        {Array.from(fields).map((field) => {
          const oldVal = old[field];
          const newVal = action.args[field];
          const isChanged = newVal !== undefined && newVal !== oldVal;
          const label = field === 'amountCents' ? 'Amount' : field === 'dueDate' ? 'Due date' : field.charAt(0).toUpperCase() + field.slice(1);

          // Amount field
          if (field === 'amountCents') {
            return (
              <FieldRow key={field} label={label}>
                {oldVal !== undefined && isChanged && (
                  <><span className="line-through text-muted-foreground/60 text-sm">{formatCents(oldVal)}</span><span className="text-muted-foreground text-xs">→</span></>
                )}
                <span className="text-muted-foreground text-xs">$</span>
                <input type="text" value={((getFieldValue(field) || 0) / 100).toFixed(2)} onChange={(e) => updateAmount(e.target.value)}
                  className="w-24 text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors tabular-nums py-0.5" />
              </FieldRow>
            );
          }

          // Category field (select)
          if (field === 'category' && categories) {
            return (
              <FieldRow key={field} label={label}>
                {oldVal !== undefined && isChanged && (
                  <><span className="line-through text-muted-foreground/60 text-sm">{oldVal}</span><span className="text-muted-foreground text-xs">→</span></>
                )}
                <select value={getFieldValue(field) || 'OTHER'} onChange={(e) => update(field, e.target.value)}
                  className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5 cursor-pointer">
                  {categories.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                </select>
              </FieldRow>
            );
          }

          // Role field (select)
          if (field === 'role') {
            return (
              <FieldRow key={field} label={label}>
                {oldVal !== undefined && isChanged && (
                  <><span className="line-through text-muted-foreground/60 text-sm">{oldVal}</span><span className="text-muted-foreground text-xs">→</span></>
                )}
                <select value={getFieldValue(field) || 'MEMBER'} onChange={(e) => update(field, e.target.value)}
                  className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5 cursor-pointer">
                  {MEMBER_ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
                </select>
              </FieldRow>
            );
          }

          // Date field
          if (field === 'date' || field === 'dueDate') {
            return (
              <FieldRow key={field} label={label}>
                {oldVal !== undefined && isChanged && (
                  <><span className="line-through text-muted-foreground/60 text-sm">{formatDisplay(field, oldVal)}</span><span className="text-muted-foreground text-xs">→</span></>
                )}
                <input type="date" value={String(getFieldValue(field) || '').slice(0, 10)} onChange={(e) => update(field, e.target.value)}
                  className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5" />
              </FieldRow>
            );
          }

          // Text field (title, name, email, vendor, etc.)
          return (
            <FieldRow key={field} label={label}>
              {oldVal !== undefined && isChanged && (
                <><span className="line-through text-muted-foreground/60 text-sm">{oldVal}</span><span className="text-muted-foreground text-xs">→</span></>
              )}
              <input type="text" value={getFieldValue(field)} onChange={(e) => update(field, e.target.value)}
                className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors w-full py-0.5" />
            </FieldRow>
          );
        })}
      </div>
    </div>
  );
}

/** Editable editor for add_members */
function MembersEditor({
  action,
  onChange,
}: {
  action: ProposedAction;
  onChange: (updated: ProposedAction) => void;
}) {
  const members: Array<{ name: string; email?: string; role?: string }> = action.args.members || [];

  const updateMember = (idx: number, field: string, value: string) => {
    const updated = [...members];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange({ ...action, args: { ...action.args, members: updated } });
  };

  const removeMember = (idx: number) => {
    onChange({ ...action, args: { ...action.args, members: members.filter((_, i) => i !== idx) } });
  };

  return (
    <div className="space-y-2">
      <span className="font-medium text-sm">{action.description}</span>
      <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-2">
        {members.map((m, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input type="text" value={m.name} onChange={(e) => updateMember(idx, 'name', e.target.value)} placeholder="Name"
              className="flex-1 text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5" />
            <input type="text" value={m.email || ''} onChange={(e) => updateMember(idx, 'email', e.target.value)} placeholder="Email"
              className="flex-1 text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5 placeholder:text-muted-foreground/40" />
            <select value={m.role || 'MEMBER'} onChange={(e) => updateMember(idx, 'role', e.target.value)}
              className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5 cursor-pointer">
              {MEMBER_ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
            </select>
            {members.length > 1 && (
              <button type="button" onClick={() => removeMember(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Editable editor for record_payments */
function PaymentsEditor({
  action,
  onChange,
}: {
  action: ProposedAction;
  onChange: (updated: ProposedAction) => void;
}) {
  const payments: Array<{ rawPayerName: string; amountCents: number; date?: string; method?: string }> = action.args.payments || [];

  const updatePayment = (idx: number, field: string, value: any) => {
    const updated = [...payments];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange({ ...action, args: { ...action.args, payments: updated } });
  };

  const updatePaymentAmount = (idx: number, raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const cents = Math.round(parseFloat(cleaned || '0') * 100);
    if (!isNaN(cents)) updatePayment(idx, 'amountCents', cents);
  };

  const removePayment = (idx: number) => {
    onChange({ ...action, args: { ...action.args, payments: payments.filter((_, i) => i !== idx) } });
  };

  return (
    <div className="space-y-2">
      <span className="font-medium text-sm">{action.description}</span>
      <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-2">
        {payments.map((p, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input type="text" value={p.rawPayerName || ''} onChange={(e) => updatePayment(idx, 'rawPayerName', e.target.value)} placeholder="Payer"
              className="flex-1 text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5" />
            <span className="text-muted-foreground text-xs">$</span>
            <input type="text" value={(p.amountCents / 100).toFixed(2)} onChange={(e) => updatePaymentAmount(idx, e.target.value)}
              className="w-20 text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors tabular-nums py-0.5" />
            <input type="date" value={p.date?.slice(0, 10) || ''} onChange={(e) => updatePayment(idx, 'date', e.target.value)}
              className="text-sm bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-colors py-0.5" />
            {payments.length > 1 && (
              <button type="button" onClick={() => removePayment(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
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
              {status === 'pending' && (action.toolName === 'create_charges' || action.toolName === 'create_multi_charge') ? (
                <ChargeActionEditor action={action} memberNameMap={memberNameMap} onChange={(updated) => updateAction(index, updated)} />
              ) : status === 'pending' && action.toolName === 'create_multi_expense' ? (
                <ExpenseActionEditor action={action} onChange={(updated) => updateAction(index, updated)} />
              ) : status === 'pending' && action.toolName === 'create_expense' ? (
                <SingleExpenseEditor action={action} onChange={(updated) => updateAction(index, updated)} />
              ) : status === 'pending' && (action.toolName === 'update_expense' || action.toolName === 'update_charge' || action.toolName === 'update_member') ? (
                <UpdateFieldsEditor action={action} onChange={(updated) => updateAction(index, updated)} />
              ) : status === 'pending' && action.toolName === 'add_members' ? (
                <MembersEditor action={action} onChange={(updated) => updateAction(index, updated)} />
              ) : status === 'pending' && action.toolName === 'record_payments' ? (
                <PaymentsEditor action={action} onChange={(updated) => updateAction(index, updated)} />
              ) : (
                <>
                  <span className="font-medium">{action.description}</span>
                  {action.args._items && action.args._items.length > 0 && (
                    <ul className="mt-1.5 space-y-1.5">
                      {action.args._items.slice(0, 10).map((item: any, i: number) => (
                        <li key={i} className="rounded-md border border-border/40 bg-secondary/20 px-2.5 py-1.5 text-sm">
                          <div className="font-medium">{item.title || item.name || 'Untitled'}</div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                          )}
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                            {item.amountCents != null && <span>{formatCents(item.amountCents)}</span>}
                            {item.memberName && <span>· {item.memberName}</span>}
                            {item.vendor && <span>· {item.vendor}</span>}
                            {item.date && <span>· {new Date(item.date).toLocaleDateString()}</span>}
                            {item.dueDate && <span>· Due {new Date(item.dueDate).toLocaleDateString()}</span>}
                            {item.category && <span>· {item.category}</span>}
                            {item.email && <span>{item.email}</span>}
                            {item.role && item.role !== 'MEMBER' && <span>· {item.role}</span>}
                          </div>
                        </li>
                      ))}
                      {action.args._items.length > 10 && (
                        <li className="text-xs text-muted-foreground px-2.5">
                          ...and {action.args._items.length - 10} more
                        </li>
                      )}
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
