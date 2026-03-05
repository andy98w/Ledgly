'use client';

import { useState, useRef, useMemo, useCallback, useEffect, Fragment } from 'react';
import { Loader2, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMembers } from '@/lib/queries/members';
import { useCharges } from '@/lib/queries/charges';
import { useExpenses } from '@/lib/queries/expenses';

// ── Bracket parsing ──────────────────────────────────────────

interface BracketToken {
  text: string;
  inner: string;
  start: number;
  end: number;
}

function parseBrackets(value: string): BracketToken[] {
  const tokens: BracketToken[] = [];
  const regex = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    tokens.push({
      text: match[0],
      inner: match[1],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

// ── Entity detection ─────────────────────────────────────────

type SearchableEntity = 'members' | 'charges' | 'expenses';

function detectEntity(inner: string): SearchableEntity | null {
  const lower = inner.toLowerCase();
  // Skip edit-template "new X" placeholders (user types new values)
  if (lower.startsWith('new ')) return null;
  if (lower.includes('member')) return 'members';
  if (lower.includes('charge')) return 'charges';
  if (lower.includes('expense')) return 'expenses';
  return null;
}

// ── List-mode bracket support ────────────────────────────────
// Brackets like [member names] or [charge titles] act as a picker
// trigger. Each selection inserts a "- item" line above the bracket.

const LIST_PLACEHOLDERS = ['member names', 'charge titles'];

function getListPlaceholder(inner: string): string | null {
  const lower = inner.trim().toLowerCase();
  for (const ph of LIST_PLACEHOLDERS) {
    if (lower === ph) return ph;
  }
  return null;
}

/** Find "- item" bullet lines immediately above a bracket token */
function getSelectedItemsAbove(value: string, tokenStart: number): string[] {
  const textBefore = value.slice(0, tokenStart);
  const lines = textBefore.split('\n');
  const items: string[] = [];
  // Walk backwards from the line just before the bracket
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ')) {
      items.unshift(trimmed.slice(2).trim());
    } else if (trimmed === '') {
      // skip blank lines between bullets and bracket
      continue;
    } else {
      break; // hit non-bullet content, stop
    }
  }
  return items;
}

// ── Search result item ───────────────────────────────────────

interface SearchItem {
  id: string;
  label: string;
  sublabel?: string;
  /** Replacement for single-select mode (e.g., edit: multi-line bullet details) */
  replaceValue?: string;
  /** Replacement for list-select mode (e.g., void: compact single-line) */
  listValue?: string;
  /** Group key for collapsible grouping (e.g., charge title) */
  groupKey?: string;
  /** Label shown for this item inside its group (e.g., member name) */
  groupItemLabel?: string;
}

interface SearchGroup {
  key: string;
  label: string;
  sublabel: string;
  items: SearchItem[];
}

// ── InlineBracket (with popover) ─────────────────────────────

function InlineBracket({
  token,
  orgId,
  onSelect,
  selectedItems,
  onSend,
}: {
  token: BracketToken;
  orgId: string;
  onSelect: (token: BracketToken, value: string) => void;
  selectedItems?: string[];
  onSend?: () => void;
}) {
  const entity = detectEntity(token.inner);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const isListMode = getListPlaceholder(token.inner) !== null;

  const { data: membersData, isLoading: membersLoading } = useMembers(
    entity === 'members' && open ? orgId : null,
    { search: search || undefined, limit: 10 },
  );
  const { data: chargesData, isLoading: chargesLoading } = useCharges(
    entity === 'charges' && open ? orgId : null,
    { limit: 50 },
  );
  const { data: expensesData, isLoading: expensesLoading } = useExpenses(
    entity === 'expenses' && open ? orgId : null,
    { limit: 20 },
  );

  const isLoading = (entity === 'members' && membersLoading)
    || (entity === 'charges' && chargesLoading)
    || (entity === 'expenses' && expensesLoading);

  const items = useMemo((): SearchItem[] => {
    let results: SearchItem[] = [];
    if (entity === 'members' && membersData?.data) {
      results = membersData.data.map((m) => {
        const name = m.name || m.displayName || 'Unnamed';
        const email = m.user?.email || m.invitedEmail || null;
        const details = [
          `- Name: ${name}`,
          email ? `- Email: ${email}` : null,
          `- Role: ${m.role}`,
          `- Status: ${m.status}`,
        ].filter(Boolean).join('\n');
        return {
          id: m.id,
          label: name,
          sublabel: m.balanceCents !== undefined
            ? `$${(Math.abs(m.balanceCents) / 100).toFixed(2)} ${m.balanceCents < 0 ? 'owed' : 'credit'}`
            : undefined,
          replaceValue: details,
        };
      });
    }
    if (entity === 'charges' && chargesData?.data) {
      const filtered = search
        ? chargesData.data.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
        : chargesData.data;
      results = filtered.map((c) => {
        const memberName = c.membership?.user?.name || c.membership?.name || 'Unknown';
        const amount = `$${(c.amountCents / 100).toFixed(2)}`;
        return {
          id: c.id,
          label: c.title,
          sublabel: `${amount} · ${memberName}`,
          replaceValue: `- Title: ${c.title}\n- Amount: ${amount}\n- Category: ${c.category}\n- Member: ${memberName}`,
          listValue: `${c.title} — ${memberName} (${amount})`,
          groupKey: `${c.title}|${c.amountCents}|${c.category}`,
          groupItemLabel: memberName,
        };
      });
    }
    if (entity === 'expenses' && expensesData?.data) {
      const filtered = search
        ? expensesData.data.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()))
        : expensesData.data;
      results = filtered.map((e) => ({
        id: e.id,
        label: e.title,
        sublabel: `$${(e.amountCents / 100).toFixed(2)}`,
        replaceValue: `- Title: ${e.title}\n- Amount: $${(e.amountCents / 100).toFixed(2)}\n- Category: ${e.category}`,
        listValue: `${e.title} ($${(e.amountCents / 100).toFixed(2)})`,
      }));
    }
    // Filter out already-selected items in list mode (match on exact listValue/label)
    if (isListMode && selectedItems && selectedItems.length > 0) {
      const selectedLower = new Set(selectedItems.map((s) => s.toLowerCase()));
      results = results.filter((item) => {
        const listVal = (item.listValue || item.label).toLowerCase();
        return !selectedLower.has(listVal);
      });
    }
    return results;
  }, [entity, membersData, chargesData, expensesData, search, isListMode, selectedItems]);

  // Group items that share a groupKey (e.g., charges with same title/amount/category)
  const { groups, ungrouped } = useMemo(() => {
    const hasGroups = items.some((item) => item.groupKey);
    if (!hasGroups) return { groups: [] as SearchGroup[], ungrouped: items };

    const groupMap = new Map<string, SearchItem[]>();
    const ungroupedItems: SearchItem[] = [];
    for (const item of items) {
      if (item.groupKey) {
        const arr = groupMap.get(item.groupKey) || [];
        arr.push(item);
        groupMap.set(item.groupKey, arr);
      } else {
        ungroupedItems.push(item);
      }
    }
    const groupList: SearchGroup[] = [];
    for (const [key, groupItems] of Array.from(groupMap.entries())) {
      const first = groupItems[0];
      const amount = first.sublabel?.split(' · ')[0] || '';
      groupList.push({
        key,
        label: first.label,
        sublabel: `${amount} × ${groupItems.length}`,
        items: groupItems,
      });
    }
    return { groups: groupList, ungrouped: ungroupedItems };
  }, [items]);

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  if (!entity) {
    return <span className="text-muted-foreground">[{token.inner}]</span>;
  }

  const handleItemClick = (item: SearchItem) => {
    const replacement = isListMode
      ? (item.listValue || item.label)
      : (item.replaceValue || item.label);
    onSelect(token, replacement);
    if (!isListMode) {
      setOpen(false);
    }
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(''); setExpandedGroup(null); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline rounded-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer px-0.5 -mx-0.5 underline decoration-primary/30 decoration-dotted underline-offset-2 pointer-events-auto"
          onMouseDown={(e) => e.preventDefault()}
        >
          [{token.inner}]
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-0 z-[60]" sideOffset={6}>
        <div className="p-2 border-b border-border">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                setOpen(false);
                onSend?.();
              }
            }}
            placeholder={`Search ${entity}...`}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {isLoading && items.length === 0 && (
            <div className="px-3 py-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading {entity}...
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No {entity} found
            </div>
          )}

          {/* Grouped items (charges) */}
          {groups.map((group) => (
            <Fragment key={group.key}>
              <button
                type="button"
                onClick={() => setExpandedGroup(expandedGroup === group.key ? null : group.key)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/50 transition-colors text-left"
              >
                <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${expandedGroup === group.key ? 'rotate-90' : ''}`} />
                <span className="truncate font-medium">{group.label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{group.sublabel}</span>
              </button>
              {expandedGroup === group.key && group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className="flex w-full items-center justify-between pl-9 pr-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors text-left gap-2"
                >
                  <span className="truncate text-muted-foreground">{item.groupItemLabel || item.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{item.sublabel?.split(' · ')[0]}</span>
                </button>
              ))}
            </Fragment>
          ))}

          {/* Ungrouped items (members, expenses, etc.) */}
          {ungrouped.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-secondary/50 transition-colors text-left gap-2"
            >
              <span className="truncate">{item.label}</span>
              {item.sublabel && (
                <span className="shrink-0 text-xs text-muted-foreground text-right">
                  {item.sublabel}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── BracketInput ─────────────────────────────────────────────
// Replaces <textarea>. Rich overlay is ALWAYS shown on top when brackets
// exist — brackets remain clickable even while typing. The textarea
// underneath captures all keyboard input with transparent text but a
// visible caret.

export function BracketInput({
  value,
  onChange,
  onKeyDown,
  onSend,
  orgId,
  placeholder,
  disabled,
  className,
  maxHeight = 120,
  inputRef: externalRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onSend?: () => void;
  orgId: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxHeight?: number;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const tokens = useMemo(() => parseBrackets(value), [value]);
  const hasBrackets = tokens.length > 0;

  const handleSelect = useCallback(
    (token: BracketToken, replacement: string) => {
      const listPh = getListPlaceholder(token.inner);

      if (listPh) {
        // List mode: insert a bullet line before the bracket, keep bracket as-is
        const bulletLine = `- ${replacement}\n`;
        const newValue = value.slice(0, token.start) + bulletLine + `[${listPh}]` + value.slice(token.end);
        onChange(newValue);
      } else {
        // Regular mode: replace bracket with plain value
        const newValue = value.slice(0, token.start) + replacement + value.slice(token.end);
        onChange(newValue);
      }

      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [value, onChange],
  );

  // Compute selected items for each list-mode bracket (for dedup)
  const selectedItemsByStart = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const token of tokens) {
      if (getListPlaceholder(token.inner)) {
        map.set(token.start, getSelectedItemsAbove(value, token.start));
      }
    }
    return map;
  }, [tokens, value]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Sync external ref
  useEffect(() => {
    if (externalRef && 'current' in externalRef) {
      (externalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = textareaRef.current;
    }
  });

  // Auto-resize textarea — scrollHeight excludes border, but border-box
  // sizing means height includes border, so we must compensate.
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = Math.min(el.scrollHeight + border, maxHeight) + 'px';
  }, [maxHeight]);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  // Build rich content — always computed when brackets exist
  const richContent = useMemo(() => {
    if (!hasBrackets) return null;
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    tokens.forEach((token, i) => {
      if (token.start > lastEnd) {
        parts.push(
          <span key={`t-${i}`} className="whitespace-pre-wrap pointer-events-none">
            {value.slice(lastEnd, token.start)}
          </span>,
        );
      }
      parts.push(
        <InlineBracket
          key={`b-${i}`}
          token={token}
          orgId={orgId}
          onSelect={handleSelect}
          selectedItems={selectedItemsByStart.get(token.start)}
          onSend={onSend}
        />,
      );
      lastEnd = token.end;
    });
    if (lastEnd < value.length) {
      parts.push(
        <span key="tail" className="whitespace-pre-wrap pointer-events-none">
          {value.slice(lastEnd)}
        </span>,
      );
    }
    return parts;
  }, [hasBrackets, tokens, value, orgId, handleSelect, selectedItemsByStart]);

  return (
    <div className="relative flex-1 min-w-0 flex flex-col">
      {/* Textarea — always in flow for consistent height */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={() => {
          if (overlayRef.current && textareaRef.current) {
            overlayRef.current.scrollTop = textareaRef.current.scrollTop;
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`w-full m-0 leading-5 ${className || ''} ${hasBrackets ? 'text-transparent caret-foreground selection:bg-primary/20' : ''}`}
      />

      {/* Rich overlay — always on top when brackets exist, pointer-events only on bracket buttons */}
      {hasBrackets && (
        <div
          ref={overlayRef}
          className={`absolute inset-0 w-full overflow-y-auto whitespace-pre-wrap ${className || ''} bg-transparent border-transparent pointer-events-none`}
        >
          {richContent}
        </div>
      )}
    </div>
  );
}
