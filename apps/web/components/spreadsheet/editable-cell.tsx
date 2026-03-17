'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/utils';
import { parseNaturalAmount, parseNaturalDate } from '@/lib/utils/natural-language';
import {
  CHARGE_CATEGORIES,
  CHARGE_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ChargeCategory,
  type ExpenseCategory,
} from '@ledgly/shared';

export function formatShortDate(date: string | Date): string {
  const d = new Date(date);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear() % 100;
  return `${m}/${day}/${y.toString().padStart(2, '0')}`;
}

function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDateInput(value: string): string | null {
  const parts = value.split('/');
  if (parts.length !== 3) return null;
  const [mm, dd, yy] = parts;
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  const year = parseInt(yy, 10);
  if (!month || !day || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const fullYear = year < 100 ? 2000 + year : year;
  const d = new Date(fullYear, month - 1, day);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function EditableCell({
  value,
  type,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onNavigate,
  isAdmin,
  rowType,
  column,
  members,
  onAddMember,
}: {
  value: string | number;
  type: 'text' | 'money' | 'category' | 'date' | 'member';
  isEditing: boolean;
  onEdit: () => void;
  onSave: (newValue: string | number) => void;
  onCancel: () => void;
  onNavigate?: (direction: 'next' | 'prev' | 'down') => void;
  isAdmin: boolean;
  rowType: 'charge' | 'expense' | 'payment';
  column: string;
  members?: Array<{ id: string; name: string | null; displayName?: string | null; user?: { name: string | null } | null }>;
  onAddMember?: (name: string) => Promise<string | null>;
}) {
  const [editValue, setEditValue] = useState(String(value));
  const [memberSearch, setMemberSearch] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (type === 'money') {
      setEditValue(((value as number) / 100).toFixed(2));
    } else if (type === 'date') {
      setEditValue(formatShortDate(value as string));
    } else {
      setEditValue(String(value));
    }
  }, [value, type]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      handleSave();
      onNavigate?.(e.shiftKey ? 'prev' : 'next');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
      onNavigate?.('down');
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleSave = () => {
    if (type === 'money') {
      const parsed = parseFloat(editValue || '0');
      if (!isNaN(parsed)) {
        onSave(Math.round(parsed * 100));
      } else {
        const nlCents = parseNaturalAmount(editValue);
        onSave(nlCents ?? 0);
      }
    } else if (type === 'date') {
      const iso = parseDateInput(editValue);
      if (iso) {
        onSave(iso);
      } else {
        const nlDate = parseNaturalDate(editValue);
        if (nlDate) {
          onSave(new Date(nlDate).toISOString());
        } else {
          onCancel();
        }
      }
    } else {
      onSave(editValue);
    }
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim() || !onAddMember) return;
    setIsAddingMember(true);
    try {
      const newMemberId = await onAddMember(newMemberName.trim());
      if (newMemberId) {
        onSave(newMemberId);
      }
      setShowAddMember(false);
      setNewMemberName('');
    } finally {
      setIsAddingMember(false);
    }
  };

  if (isEditing) {
    if (type === 'category') {
      const categories = rowType === 'charge' ? CHARGE_CATEGORIES : EXPENSE_CATEGORIES;
      const labels = rowType === 'charge' ? CHARGE_CATEGORY_LABELS : EXPENSE_CATEGORY_LABELS;
      return (
        <Popover open={true} onOpenChange={(open) => !open && onCancel()}>
          <PopoverTrigger asChild>
            <button className="text-left px-1 py-0.5 rounded -mx-1">
              <Badge variant="secondary" className="text-xs">
                {labels[editValue as keyof typeof labels] || editValue}
              </Badge>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setEditValue(cat);
                    onSave(cat);
                  }}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-secondary transition-colors',
                    editValue === cat && 'bg-primary/10 text-primary'
                  )}
                >
                  {labels[cat as keyof typeof labels]}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    if (type === 'member' && members) {
      const filteredMembers = memberSearch.trim()
        ? members.filter((m) => {
            const name = m.displayName || m.name || m.user?.name || '';
            return name.toLowerCase().includes(memberSearch.toLowerCase());
          })
        : members;

      return (
        <Popover open={true} onOpenChange={(open) => !open && onCancel()}>
          <PopoverTrigger asChild>
            <button className="text-left font-medium px-1 py-0.5 -mx-1 rounded hover:bg-secondary/50 transition-colors">
              {members.find((m) => m.id === editValue)?.displayName ||
                members.find((m) => m.id === editValue)?.name ||
                members.find((m) => m.id === editValue)?.user?.name ||
                'Select member...'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            {showAddMember ? (
              <div className="space-y-2">
                <p className="text-xs font-medium">Add New Member</p>
                <Input
                  placeholder="Member name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddMember();
                    if (e.key === 'Escape') setShowAddMember(false);
                  }}
                  autoFocus
                  className="h-8 text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddMember(false)}
                    className="flex-1 h-7 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddMember}
                    disabled={!newMemberName.trim() || isAddingMember}
                    className="flex-1 h-7 text-xs"
                  >
                    {isAddingMember ? 'Adding...' : 'Add'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search members..."
                    aria-label="Search members"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="h-7 text-xs pl-7"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredMembers.filter((m) => m.id).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setEditValue(m.id);
                        onSave(m.id);
                      }}
                      className={cn(
                        'w-full text-left px-2 py-1.5 text-xs rounded hover:bg-secondary transition-colors',
                        editValue === m.id && 'bg-primary/10 text-primary'
                      )}
                    >
                      {m.displayName || m.name || m.user?.name || 'Unknown'}
                    </button>
                  ))}
                  {filteredMembers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No members found
                    </p>
                  )}
                </div>
                {onAddMember && (
                  <button
                    onClick={() => {
                      setNewMemberName(memberSearch);
                      setShowAddMember(true);
                    }}
                    className="w-full mt-2 pt-2 border-t text-left px-2 py-1.5 text-xs text-primary hover:bg-secondary rounded transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add new member{memberSearch && `: "${memberSearch}"`}
                  </button>
                )}
              </>
            )}
          </PopoverContent>
        </Popover>
      );
    }

    if (type === 'date') {
      return (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => {
            const raw = e.target.value;
            if (/^\d*[\/\d]*$/.test(raw)) {
              setEditValue(applyDateMask(raw));
            } else {
              setEditValue(raw);
            }
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder="mm/dd/yy or 'yesterday'"
          className="h-5 text-xs bg-transparent shadow-none !ring-0 !outline-none !border-none rounded px-0 w-full"
          type="text"
        />
      );
    }

    if (type === 'money') {
      return (
        <div className="inline-flex items-baseline justify-end w-full">
          <span className="text-sm font-semibold opacity-70 mr-0.5">$</span>
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="w-16 text-right tabular-nums text-sm font-semibold bg-transparent shadow-none !ring-0 !outline-none !border-none p-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            type="text"
            inputMode="decimal"
          />
        </div>
      );
    }

    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="h-5 w-full text-sm bg-transparent shadow-none !ring-0 !outline-none !border-none rounded px-0"
        type="text"
      />
    );
  }

  const getMemberDisplayValue = () => {
    if (type !== 'member' || !members || !value) return '-';
    const member = members.find((m) => m.id === value);
    return member?.displayName || member?.name || member?.user?.name || '-';
  };

  const TruncatedText = ({ text, className: cls, wrap }: { text: string; className?: string; wrap?: boolean }) => {
    if (!text || text === '-') return <span className={cls}>{text || '-'}</span>;
    if (wrap) return <span className={cls}>{text}</span>;
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn('block truncate', cls)}>{text}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-sm">{text}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  if (!isAdmin) {
    if (type === 'date') {
      return <span className="text-muted-foreground whitespace-nowrap">{formatShortDate(value as string)}</span>;
    }
    if (type === 'member') {
      return <TruncatedText text={getMemberDisplayValue()} />;
    }
    if (type === 'money') {
      return <span><Money cents={value as number} size="sm" /></span>;
    }
    return <TruncatedText text={String(value)} wrap={column === 'description'} />;
  }

  return (
    <div
      className={cn(
        'px-1 py-0.5 rounded -mx-1 transition-colors cursor-default w-full',
        type === 'money' ? 'text-right' : 'text-left',
      )}
    >
      {type === 'money' ? (
        <Money cents={value as number} size="sm" className={column === 'income' ? 'text-success' : 'text-destructive'} />
      ) : type === 'category' ? (
        <Badge variant="secondary" className="text-xs">
          {rowType === 'charge'
            ? CHARGE_CATEGORY_LABELS[value as ChargeCategory] || value
            : EXPENSE_CATEGORY_LABELS[value as ExpenseCategory] || value}
        </Badge>
      ) : type === 'date' ? (
        <span className="text-muted-foreground whitespace-nowrap">{formatShortDate(value as string)}</span>
      ) : type === 'member' ? (
        <TruncatedText text={getMemberDisplayValue()} className="font-medium" />
      ) : (
        <TruncatedText text={String(value || '-')} className="font-medium" wrap={column === 'description'} />
      )}
    </div>
  );
}
