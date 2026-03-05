'use client';

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, Download, Upload, Filter, Plus, DollarSign, Wallet, Search, Minus, ArrowUp, ArrowDown, Trash2, Circle, CheckCircle2, Check, Link2, Loader2, CreditCard, MoreVertical, FileSpreadsheet, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { useCharges, useUpdateCharge, useCreateCharge, useCreateMultiCharge, useVoidCharge, useRestoreCharge, useBulkCreateCharges } from '@/lib/queries/charges';
import { useExpenses, useUpdateExpense, useCreateExpense, useCreateMultiExpense, useDeleteExpense, useRestoreExpense } from '@/lib/queries/expenses';
import { usePayments, useUpdatePayment, useCreatePayment, useDeletePayment, useRestorePayment, useAllocatePayment, useAutoAllocateToCharge, useBulkCreatePayments } from '@/lib/queries/payments';
import { useMembers } from '@/lib/queries/members';
import { useAuthStore, useIsAdminOrTreasurer, useCurrentMembership } from '@/lib/stores/auth';
import { formatDate } from '@/lib/utils';
import {
  CHARGE_CATEGORIES,
  CHARGE_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ChargeCategory,
  type ExpenseCategory,
} from '@ledgly/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useCreateMembers, useDeleteMember, useRestoreMember } from '@/lib/queries/members';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import { ToastUndoButton } from '@/components/ui/toast-undo-button';
import { FadeIn } from '@/components/ui/page-transition';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CSVImportDialog, type ImportField } from '@/components/import/csv-import-dialog';
import { calculateNameSimilarity } from '@/lib/utils/name-similarity';
import { ChargeCreateDialog } from '@/components/charges/charge-create-dialog';
import { MultiExpenseCreateDialog } from '@/components/expenses/multi-expense-create-dialog';

/** Strip "VENMO payment to " etc. prefixes from Gmail-imported expense titles */
function cleanExpenseTitle(title: string): string {
  const match = title.match(/^[A-Z]+ payment to (.+)$/);
  return match ? match[1] : title;
}

interface SpreadsheetRow {
  id: string;
  date: string;
  type: 'charge' | 'expense' | 'payment';
  category: string;
  description: string;
  member?: string;
  membershipId?: string;
  incomeCents: number;
  outstandingCents: number;
  expenseCents: number;
  status?: string;
  allocatedCents?: number;
  unallocatedCents?: number;
  isParent?: boolean;
  isChild?: boolean;
  parentId?: string;
  childCount?: number;
  children?: SpreadsheetRow[];
}

type EditingCell = {
  rowId: string;
  column: 'description' | 'category' | 'amount' | 'date' | 'member';
} | null;

function EditableCell({
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
      // Convert to YYYY-MM-DD for date input
      const date = new Date(value as string);
      setEditValue(date.toISOString().split('T')[0]);
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
      const cents = Math.round(parseFloat(editValue || '0') * 100);
      onSave(cents);
    } else if (type === 'date') {
      onSave(new Date(editValue).toISOString());
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
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="h-6 text-xs bg-transparent border-0 shadow-none ring-0 outline-none focus:ring-0 focus:border-0 focus:outline-none"
          type="date"
          style={{ WebkitAppearance: 'none', border: 'none', outline: 'none' }}
        />
      );
    }

    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className={cn(
          'h-6 text-xs bg-transparent border-0 shadow-none ring-0 outline-none focus:ring-0 focus:border-0 focus:outline-none',
          type === 'money' ? 'w-16 text-right' : 'w-full'
        )}
        type={type === 'money' ? 'number' : 'text'}
        step={type === 'money' ? '0.01' : undefined}
        style={{ WebkitAppearance: 'none', border: 'none', outline: 'none' }}
      />
    );
  }

  // Get display value for member type
  const getMemberDisplayValue = () => {
    if (type !== 'member' || !members || !value) return '-';
    const member = members.find((m) => m.id === value);
    return member?.displayName || member?.name || member?.user?.name || '-';
  };

  // Truncated text with tooltip helper
  const TruncatedText = ({ text, className: cls }: { text: string; className?: string }) => {
    if (!text || text === '-') return <span className={cls}>{text || '-'}</span>;
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

  // Non-editing display
  if (!isAdmin) {
    if (type === 'date') {
      return <span className="text-muted-foreground">{formatDate(value as string)}</span>;
    }
    if (type === 'member') {
      return <TruncatedText text={getMemberDisplayValue()} />;
    }
    if (type === 'money') {
      return <span><Money cents={value as number} size="sm" /></span>;
    }
    return <TruncatedText text={String(value)} />;
  }

  return (
    <button
      onClick={onEdit}
      className="text-left hover:bg-secondary/50 px-1 py-0.5 rounded -mx-1 transition-colors cursor-pointer w-full"
      title="Click to edit"
    >
      {type === 'money' ? (
        <Money cents={value as number} size="sm" className={column === 'income' ? 'text-success' : column === 'outstanding' ? 'text-warning' : 'text-destructive'} />
      ) : type === 'category' ? (
        <Badge variant="secondary" className="text-xs">
          {rowType === 'charge'
            ? CHARGE_CATEGORY_LABELS[value as ChargeCategory] || value
            : EXPENSE_CATEGORY_LABELS[value as ExpenseCategory] || value}
        </Badge>
      ) : type === 'date' ? (
        <span className="text-muted-foreground">{formatDate(value as string)}</span>
      ) : type === 'member' ? (
        <TruncatedText text={getMemberDisplayValue()} className="font-medium" />
      ) : (
        <TruncatedText text={String(value || '-')} className="font-medium" />
      )}
    </button>
  );
}

export default function SpreadsheetPage() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'type' | 'category' | 'member' | 'status' | 'income' | 'outstanding' | 'expense'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAllocateDialog, setShowAllocateDialog] = useState(false);
  const [inlineNewRow, setInlineNewRow] = useState(false);
  const [inlineNewRowField, setInlineNewRowField] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [newRowType, setNewRowType] = useState<'charge' | 'multi-charge' | 'expense' | 'multi-expense' | 'payment'>('charge');
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showMultiChargeDialog, setShowMultiChargeDialog] = useState(false);
  const [showMultiExpenseDialog, setShowMultiExpenseDialog] = useState(false);
  const [newRowData, setNewRowData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    membershipId: '',
    vendor: '',
    amountCents: 0,
    memo: '',
  });

  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { toast } = useToast();
  const isAdmin = useIsAdminOrTreasurer();
  const currentMembership = useCurrentMembership();

  const { data: chargesData, isLoading: chargesLoading } = useCharges(currentOrgId, { limit: 100 });
  const { data: expensesData, isLoading: expensesLoading } = useExpenses(currentOrgId, { limit: 100 });
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments(currentOrgId, { limit: 100 });
  const { data: membersData } = useMembers(currentOrgId);
  const updateCharge = useUpdateCharge();
  const updateExpense = useUpdateExpense();
  const updatePayment = useUpdatePayment();
  const createCharge = useCreateCharge();
  const createMultiCharge = useCreateMultiCharge();
  const createExpense = useCreateExpense();
  const createMultiExpense = useCreateMultiExpense();
  const createPayment = useCreatePayment();
  const voidCharge = useVoidCharge();
  const restoreCharge = useRestoreCharge();
  const deleteExpense = useDeleteExpense();
  const restoreExpense = useRestoreExpense();
  const deletePayment = useDeletePayment();
  const restorePayment = useRestorePayment();
  const createMembers = useCreateMembers();
  const deleteOneMember = useDeleteMember();
  const restoreMember = useRestoreMember();
  const allocatePayment = useAllocatePayment();
  const autoAllocate = useAutoAllocateToCharge();
  const bulkCreateCharges = useBulkCreateCharges();
  const bulkCreatePayments = useBulkCreatePayments();

  const [showImport, setShowImport] = useState(false);
  const [importType, setImportType] = useState<'charge' | 'expense' | 'payment'>('charge');

  const isLoading = chargesLoading || expensesLoading || paymentsLoading;
  const members = membersData?.data || [];

  // Create lookup maps for original data
  const chargesMap = useMemo(() => {
    const map = new Map();
    chargesData?.data.forEach((c) => map.set(c.id, c));
    return map;
  }, [chargesData]);

  const expensesMap = useMemo(() => {
    const map = new Map();
    expensesData?.data.forEach((e) => map.set(e.id, e));
    return map;
  }, [expensesData]);

  const paymentsMap = useMemo(() => {
    const map = new Map();
    paymentsData?.data.forEach((p) => map.set(p.id, p));
    return map;
  }, [paymentsData]);

  // Combine charges, expenses, and payments into spreadsheet rows
  const rows: SpreadsheetRow[] = useMemo(() => {
    const allRows: SpreadsheetRow[] = [];

    // Add charges (income)
    if (chargesData?.data) {
      for (const charge of chargesData.data) {
        if (typeFilter !== 'all' && typeFilter !== 'charge') continue;
        const c = charge as any;
        const hasChildren = c.children && c.children.length > 0;

        const childRows: SpreadsheetRow[] = hasChildren
          ? c.children.map((child: any) => ({
              id: child.id,
              date: typeof child.createdAt === 'string' ? child.createdAt : new Date(child.createdAt).toISOString(),
              type: 'charge' as const,
              category: child.category,
              description: child.title,
              member: child.membership?.displayName || child.membership?.name || child.membership?.user?.name || undefined,
              membershipId: child.membershipId,
              incomeCents: child.allocatedCents || 0,
              outstandingCents: child.balanceDueCents ?? child.amountCents,
              expenseCents: 0,
              status: child.status,
              allocatedCents: child.allocatedCents || 0,
              isChild: true,
              parentId: charge.id,
            }))
          : [];

        allRows.push({
          id: charge.id,
          date: typeof charge.createdAt === 'string' ? charge.createdAt : new Date(charge.createdAt).toISOString(),
          type: 'charge',
          category: charge.category,
          description: charge.title,
          member: hasChildren
            ? `${c.children.length} members`
            : (c.membership?.displayName || charge.membership?.name || charge.membership?.user?.name || undefined),
          membershipId: hasChildren ? undefined : charge.membershipId ?? undefined,
          incomeCents: c.allocatedCents || 0,
          outstandingCents: c.balanceDueCents ?? charge.amountCents,
          expenseCents: 0,
          status: charge.status,
          allocatedCents: c.allocatedCents || 0,
          isParent: hasChildren,
          childCount: hasChildren ? c.children.length : undefined,
          children: hasChildren ? childRows : undefined,
        });
      }
    }

    // Add expenses (outgoing)
    if (expensesData?.data) {
      for (const expense of expensesData.data) {
        if (typeFilter !== 'all' && typeFilter !== 'expense') continue;
        const e = expense as any;
        const hasChildren = e.children && e.children.length > 0;
        const cleanedTitle = cleanExpenseTitle(expense.title);

        const childRows: SpreadsheetRow[] = hasChildren
          ? e.children.map((child: any) => ({
              id: child.id,
              date: typeof child.date === 'string' ? child.date : new Date(child.date).toISOString(),
              type: 'expense' as const,
              category: child.category,
              description: child.description || cleanExpenseTitle(child.title),
              member: child.vendor || undefined,
              incomeCents: 0,
              outstandingCents: 0,
              expenseCents: child.amountCents,
              isChild: true,
              parentId: expense.id,
            }))
          : [];

        allRows.push({
          id: expense.id,
          date: typeof expense.date === 'string' ? expense.date : new Date(expense.date).toISOString(),
          type: 'expense',
          category: expense.category,
          description: expense.description || cleanedTitle,
          member: expense.vendor || undefined,
          incomeCents: 0,
          outstandingCents: 0,
          expenseCents: expense.amountCents,
          isParent: hasChildren,
          childCount: hasChildren ? e.children.length : undefined,
          children: hasChildren ? childRows : undefined,
        });
      }
    }

    // Add payments (income - actual money received)
    if (paymentsData?.data) {
      for (const payment of paymentsData.data) {
        if (typeFilter !== 'all' && typeFilter !== 'payment') continue;
        // Skip fully-unallocated payments
        if (payment.unallocatedCents === payment.amountCents) continue;
        // Use rawPayerName for payments
        const memberName = payment.rawPayerName || undefined;
        allRows.push({
          id: payment.id,
          date: typeof payment.paidAt === 'string' ? payment.paidAt : new Date(payment.paidAt).toISOString(),
          type: 'payment',
          category: payment.source || 'manual',
          description: payment.memo || memberName || 'Payment',
          member: memberName,
          membershipId: undefined,
          incomeCents: payment.amountCents,
          outstandingCents: 0,
          expenseCents: 0,
          allocatedCents: payment.allocatedCents,
          unallocatedCents: payment.unallocatedCents,
        });
      }
    }

    // Filter by search query
    let filteredRows = allRows;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filteredRows = allRows.filter((row) =>
        row.description?.toLowerCase().includes(query) ||
        row.member?.toLowerCase().includes(query) ||
        row.category?.toLowerCase().includes(query)
      );
    }

    // Sort
    filteredRows.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'amount':
          comparison = (a.incomeCents || a.expenseCents) - (b.incomeCents || b.expenseCents);
          break;
        case 'income':
          // Sort by income first (rows with income come before rows without)
          // Then by amount within each group
          const aHasIncome = a.incomeCents > 0 ? 1 : 0;
          const bHasIncome = b.incomeCents > 0 ? 1 : 0;
          comparison = bHasIncome - aHasIncome; // Income rows first
          if (comparison === 0) {
            comparison = a.incomeCents - b.incomeCents;
          }
          break;
        case 'outstanding':
          const aHasOutstanding = a.outstandingCents > 0 ? 1 : 0;
          const bHasOutstanding = b.outstandingCents > 0 ? 1 : 0;
          comparison = bHasOutstanding - aHasOutstanding;
          if (comparison === 0) {
            comparison = a.outstandingCents - b.outstandingCents;
          }
          break;
        case 'expense':
          // Sort by expense first (rows with expense come before rows without)
          // Then by amount within each group
          const aHasExpense = a.expenseCents > 0 ? 1 : 0;
          const bHasExpense = b.expenseCents > 0 ? 1 : 0;
          comparison = bHasExpense - aHasExpense; // Expense rows first
          if (comparison === 0) {
            comparison = a.expenseCents - b.expenseCents;
          }
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
        case 'member':
          comparison = (a.member || '').localeCompare(b.member || '');
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filteredRows;
  }, [chargesData, expensesData, paymentsData, members, typeFilter, searchQuery, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(rows.length / pageSize);
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    const sliced = rows.slice(start, start + pageSize);
    // Inject child rows after expanded parents
    const result: SpreadsheetRow[] = [];
    for (const row of sliced) {
      result.push(row);
      if (row.isParent && row.children && expandedParents.has(row.id)) {
        result.push(...row.children);
      }
    }
    return result;
  }, [rows, page, pageSize, expandedParents]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    setSelectedRows(new Set());
  }, [typeFilter, searchQuery, sortBy, sortOrder, pageSize]);

  const toggleParentExpand = (parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  // Calculate totals — separate realized income (payments) from outstanding (charges)
  const totals = useMemo(() => {
    let income = 0;
    let outstanding = 0;
    let expenses = 0;
    for (const r of rows) {
      income += r.incomeCents;
      outstanding += r.outstandingCents;
      expenses += r.expenseCents;
    }
    return {
      income,
      outstanding,
      expenses,
      net: income - expenses,
    };
  }, [rows]);

  const editableColumns: Array<'date' | 'member' | 'category' | 'description' | 'amount'> = ['date', 'member', 'category', 'description', 'amount'];

  const handleCellNavigate = (rowId: string, column: string, direction: 'next' | 'prev' | 'down') => {
    const colIdx = editableColumns.indexOf(column as any);
    if (direction === 'next') {
      if (colIdx < editableColumns.length - 1) {
        setEditingCell({ rowId, column: editableColumns[colIdx + 1] });
      } else {
        // Move to first column of next row
        const rowIdx = paginatedRows.findIndex((r) => r.id === rowId);
        if (rowIdx < paginatedRows.length - 1) {
          setEditingCell({ rowId: paginatedRows[rowIdx + 1].id, column: editableColumns[0] });
        } else {
          setEditingCell(null);
        }
      }
    } else if (direction === 'prev') {
      if (colIdx > 0) {
        setEditingCell({ rowId, column: editableColumns[colIdx - 1] });
      } else {
        const rowIdx = paginatedRows.findIndex((r) => r.id === rowId);
        if (rowIdx > 0) {
          setEditingCell({ rowId: paginatedRows[rowIdx - 1].id, column: editableColumns[editableColumns.length - 1] });
        } else {
          setEditingCell(null);
        }
      }
    } else if (direction === 'down') {
      const rowIdx = paginatedRows.findIndex((r) => r.id === rowId);
      if (rowIdx < paginatedRows.length - 1) {
        setEditingCell({ rowId: paginatedRows[rowIdx + 1].id, column: column as any });
      } else {
        setEditingCell(null);
      }
    }
  };

  const handleSaveCell = async (row: SpreadsheetRow, column: 'description' | 'category' | 'amount' | 'date' | 'member', newValue: string | number) => {
    if (!currentOrgId) return;

    try {
      if (row.type === 'charge') {
        const updateData: any = {};

        if (column === 'description') {
          updateData.title = newValue;
        } else if (column === 'category') {
          updateData.category = newValue;
        } else if (column === 'amount') {
          updateData.amountCents = newValue;
        } else if (column === 'date') {
          updateData.dueDate = newValue;
        } else if (column === 'member') {
          updateData.membershipId = newValue;
        }

        await updateCharge.mutateAsync({
          orgId: currentOrgId,
          chargeId: row.id,
          data: updateData,
        });
      } else if (row.type === 'expense') {
        const updateData: any = {};

        if (column === 'description') {
          updateData.title = newValue;
        } else if (column === 'category') {
          updateData.category = newValue;
        } else if (column === 'amount') {
          updateData.amountCents = newValue;
        } else if (column === 'date') {
          updateData.date = newValue;
        } else if (column === 'member') {
          updateData.vendor = newValue;
        }

        await updateExpense.mutateAsync({
          orgId: currentOrgId,
          expenseId: row.id,
          data: updateData,
        });
      } else if (row.type === 'payment') {
        const updateData: any = {};

        if (column === 'description') {
          updateData.memo = newValue;
        } else if (column === 'amount') {
          updateData.amountCents = newValue;
        } else if (column === 'date') {
          updateData.paidAt = newValue;
        } else if (column === 'member') {
          // Update membershipId and also get the member name for rawPayerName
          updateData.membershipId = newValue;
          const selectedMember = members.find(m => m.id === newValue);
          if (selectedMember) {
            updateData.rawPayerName = selectedMember.name || selectedMember.user?.name || undefined;
          }
        }

        await updatePayment.mutateAsync({
          orgId: currentOrgId,
          paymentId: row.id,
          data: updateData,
        });
      }

      toast({ title: 'Updated successfully' });
    } catch (error: any) {
      toast({
        title: 'Error updating',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }

    setEditingCell(null);
  };

  const handleAddMember = async (name: string): Promise<string | null> => {
    if (!currentOrgId) return null;
    try {
      const result = await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name }],
      });
      const createdId = Array.isArray(result) && result.length > 0 ? result[0].id : null;
      toast({
        title: `Added member: ${name}`,
        action: createdId ? (
          <ToastUndoButton onClick={() => deleteOneMember.mutate(
              { orgId: currentOrgId!, memberId: createdId },
              {
                onSuccess: () => toast({
                  title: `${name} removed`,
                  action: (
                    <ToastUndoButton onClick={() => restoreMember.mutate(
                        { orgId: currentOrgId!, memberId: createdId },
                        { onSuccess: () => toast({ title: `${name} restored` }) },
                      )} label="Redo" />
                  ),
                }),
                onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
              },
            )} />
        ) : undefined,
      });
      return createdId;
    } catch (error: any) {
      toast({
        title: 'Error adding member',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleAddRow = async () => {
    if (!currentOrgId || !currentMembership) return;

    try {
      if (newRowType === 'charge') {
        if (!newRowData.membershipId || !newRowData.category || !newRowData.description) {
          toast({ title: 'Please fill in required fields', variant: 'destructive' });
          return;
        }
        await createCharge.mutateAsync({
          orgId: currentOrgId,
          data: {
            membershipIds: [newRowData.membershipId],
            category: newRowData.category as ChargeCategory,
            title: newRowData.description,
            amountCents: newRowData.amountCents,
            dueDate: newRowData.date ? new Date(newRowData.date).toISOString() : undefined,
          },
        });
      } else if (newRowType === 'expense') {
        if (!newRowData.category || !newRowData.description) {
          toast({ title: 'Please fill in required fields', variant: 'destructive' });
          return;
        }
        await createExpense.mutateAsync({
          orgId: currentOrgId,
          data: {
            category: newRowData.category as ExpenseCategory,
            title: newRowData.description,
            amountCents: newRowData.amountCents,
            date: newRowData.date ? new Date(newRowData.date).toISOString() : new Date().toISOString(),
            vendor: newRowData.vendor || undefined,
          },
        });
      } else if (newRowType === 'payment') {
        if (!newRowData.amountCents) {
          toast({ title: 'Please enter an amount', variant: 'destructive' });
          return;
        }
        if (!newRowData.membershipId) {
          toast({ title: 'Please select a member', variant: 'destructive' });
          return;
        }
        // Get the member name from membershipId
        const selectedMember = members.find(m => m.id === newRowData.membershipId);
        const memberName = selectedMember?.name || selectedMember?.user?.name || undefined;

        await createPayment.mutateAsync({
          orgId: currentOrgId,
          data: {
            amountCents: newRowData.amountCents,
            paidAt: newRowData.date ? new Date(newRowData.date).toISOString() : new Date().toISOString(),
            rawPayerName: memberName,
            memo: newRowData.memo || undefined,
            membershipId: newRowData.membershipId,
          },
        });
      }

      toast({ title: `${newRowType.charAt(0).toUpperCase() + newRowType.slice(1)} created successfully` });
      setShowAddDialog(false);
      setNewRowData({
        date: new Date().toISOString().split('T')[0],
        category: '',
        description: '',
        membershipId: '',
        vendor: '',
        amountCents: 0,
        memo: '',
      });
    } catch (error: any) {
      toast({
        title: 'Error creating',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleStartInlineRow = () => {
    setInlineNewRow(true);
    setNewRowType('charge');
    setNewRowData({
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      membershipId: '',
      vendor: '',
      amountCents: 0,
      memo: '',
    });
    // Auto-focus the type selector on next render
    setTimeout(() => setInlineNewRowField('type'), 50);
  };

  const handleCancelInlineRow = () => {
    setInlineNewRow(false);
    setInlineNewRowField(null);
  };

  const handleSaveInlineRow = async () => {
    if (!currentOrgId || !currentMembership) return;

    try {
      if (newRowType === 'charge') {
        if (!newRowData.membershipId || !newRowData.description || !newRowData.amountCents) {
          toast({ title: 'Please fill in member, title, and amount', variant: 'destructive' });
          return;
        }
        await createCharge.mutateAsync({
          orgId: currentOrgId,
          data: {
            membershipIds: [newRowData.membershipId],
            category: (newRowData.category || 'OTHER') as ChargeCategory,
            title: newRowData.description,
            amountCents: newRowData.amountCents,
            dueDate: newRowData.date ? new Date(newRowData.date).toISOString() : undefined,
          },
        });
      } else if (newRowType === 'expense') {
        if (!newRowData.description || !newRowData.amountCents) {
          toast({ title: 'Please fill in title and amount', variant: 'destructive' });
          return;
        }
        await createExpense.mutateAsync({
          orgId: currentOrgId,
          data: {
            category: (newRowData.category || 'OTHER') as ExpenseCategory,
            title: newRowData.description,
            amountCents: newRowData.amountCents,
            date: newRowData.date ? new Date(newRowData.date).toISOString() : new Date().toISOString(),
            vendor: newRowData.vendor || undefined,
          },
        });
      } else if (newRowType === 'payment') {
        if (!newRowData.amountCents || !newRowData.membershipId) {
          toast({ title: 'Please fill in member and amount', variant: 'destructive' });
          return;
        }
        const selectedMember = members.find(m => m.id === newRowData.membershipId);
        const memberName = selectedMember?.name || selectedMember?.user?.name || undefined;
        await createPayment.mutateAsync({
          orgId: currentOrgId,
          data: {
            amountCents: newRowData.amountCents,
            paidAt: newRowData.date ? new Date(newRowData.date).toISOString() : new Date().toISOString(),
            rawPayerName: memberName,
            memo: newRowData.memo || undefined,
            membershipId: newRowData.membershipId,
          },
        });
      }

      toast({ title: `${newRowType.charAt(0).toUpperCase() + newRowType.slice(1)} created` });
      setInlineNewRow(false);
      setInlineNewRowField(null);
    } catch (error: any) {
      toast({ title: 'Error creating', description: error.message || 'Please try again', variant: 'destructive' });
    }
  };

  const handleDeleteRow = async (row: SpreadsheetRow) => {
    if (!currentOrgId) return;

    try {
      if (row.type === 'charge') {
        await voidCharge.mutateAsync({ orgId: currentOrgId, chargeId: row.id });
        toast({
          title: 'Charge deleted',
          action: (
            <ToastUndoButton onClick={() => restoreCharge.mutate(
                { orgId: currentOrgId, chargeId: row.id },
                {
                  onSuccess: () => toast({
                    title: 'Charge restored',
                    action: (
                      <ToastUndoButton onClick={() => voidCharge.mutate({ orgId: currentOrgId!, chargeId: row.id }, { onSuccess: () => toast({ title: 'Charge deleted' }) })} label="Redo" />
                    ),
                  }),
                },
              )} />
          ),
        });
      } else if (row.type === 'expense') {
        await deleteExpense.mutateAsync({ orgId: currentOrgId, expenseId: row.id });
        toast({
          title: 'Expense deleted',
          action: (
            <ToastUndoButton onClick={() => restoreExpense.mutate(
                { orgId: currentOrgId, expenseId: row.id },
                {
                  onSuccess: () => toast({
                    title: 'Expense restored',
                    action: (
                      <ToastUndoButton onClick={() => deleteExpense.mutate({ orgId: currentOrgId!, expenseId: row.id }, { onSuccess: () => toast({ title: 'Expense deleted' }) })} label="Redo" />
                    ),
                  }),
                },
              )} />
          ),
        });
      } else if (row.type === 'payment') {
        await deletePayment.mutateAsync({ orgId: currentOrgId, paymentId: row.id });
        toast({
          title: 'Payment deleted',
          action: (
            <ToastUndoButton onClick={() => restorePayment.mutate(
                { orgId: currentOrgId, paymentId: row.id },
                {
                  onSuccess: () => toast({
                    title: 'Payment restored',
                    action: (
                      <ToastUndoButton onClick={() => deletePayment.mutate({ orgId: currentOrgId!, paymentId: row.id }, { onSuccess: () => toast({ title: 'Payment deleted' }) })} label="Redo" />
                    ),
                  }),
                },
              )} />
          ),
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error deleting',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (!currentOrgId || selectedRows.size === 0) return;

    const rowsToDelete = paginatedRows.filter((r) => selectedRows.has(r.id));
    const deletedItems: Array<{ id: string; type: 'charge' | 'expense' | 'payment' }> = [];

    for (const row of rowsToDelete) {
      try {
        if (row.type === 'charge') {
          await voidCharge.mutateAsync({ orgId: currentOrgId, chargeId: row.id });
          deletedItems.push({ id: row.id, type: 'charge' });
        } else if (row.type === 'expense') {
          await deleteExpense.mutateAsync({ orgId: currentOrgId, expenseId: row.id });
          deletedItems.push({ id: row.id, type: 'expense' });
        } else if (row.type === 'payment') {
          await deletePayment.mutateAsync({ orgId: currentOrgId, paymentId: row.id });
          deletedItems.push({ id: row.id, type: 'payment' });
        }
      } catch (error) {
        // Continue with other deletions
      }
    }

    setSelectedRows(new Set());

    const handleUndo = async () => {
      let restoredCount = 0;
      for (const item of deletedItems) {
        try {
          if (item.type === 'charge') {
            await restoreCharge.mutateAsync({ orgId: currentOrgId, chargeId: item.id });
            restoredCount++;
          } else if (item.type === 'expense') {
            await restoreExpense.mutateAsync({ orgId: currentOrgId, expenseId: item.id });
            restoredCount++;
          } else if (item.type === 'payment') {
            await restorePayment.mutateAsync({ orgId: currentOrgId, paymentId: item.id });
            restoredCount++;
          }
        } catch (error) {
          // Continue with other restorations
        }
      }
      toast({
        title: `Restored ${restoredCount} item${restoredCount !== 1 ? 's' : ''}`,
        action: (
          <ToastUndoButton onClick={async () => {
              let redoneCount = 0;
              for (const item of deletedItems) {
                try {
                  if (item.type === 'charge') { await voidCharge.mutateAsync({ orgId: currentOrgId, chargeId: item.id }); redoneCount++; }
                  else if (item.type === 'expense') { await deleteExpense.mutateAsync({ orgId: currentOrgId, expenseId: item.id }); redoneCount++; }
                  else if (item.type === 'payment') { await deletePayment.mutateAsync({ orgId: currentOrgId, paymentId: item.id }); redoneCount++; }
                } catch { /* continue */ }
              }
              toast({ title: `Deleted ${redoneCount} item${redoneCount !== 1 ? 's' : ''}` });
            }} label="Redo" />
        ),
      });
    };

    toast({
      title: `Deleted ${deletedItems.length} item${deletedItems.length !== 1 ? 's' : ''}`,
      action: (
        <ToastUndoButton onClick={handleUndo} />
      ),
    });
  };

  const toggleRowSelection = (rowId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === paginatedRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedRows.map((r) => r.id)));
    }
  };

  const isAllSelected = paginatedRows.length > 0 && selectedRows.size === paginatedRows.length;

  const selectedOutstandingCharges = useMemo(
    () => paginatedRows.filter((r) => selectedRows.has(r.id) && r.type === 'charge' && r.outstandingCents > 0),
    [paginatedRows, selectedRows],
  );

  const handleExportCSV = () => {
    const headers = ['Date', 'Type', 'Member/Vendor', 'Category', 'Title', 'Income', 'Outstanding', 'Expense'];
    const csvRows = [
      headers.join(','),
      ...rows.map((row) => [
        formatDate(row.date),
        row.type,
        row.member || '',
        row.type === 'charge'
          ? CHARGE_CATEGORY_LABELS[row.category as ChargeCategory] || row.category
          : EXPENSE_CATEGORY_LABELS[row.category as ExpenseCategory] || row.category,
        `"${row.description}"`,
        row.incomeCents ? (row.incomeCents / 100).toFixed(2) : '',
        row.outstandingCents ? (row.outstandingCents / 100).toFixed(2) : '',
        row.expenseCents ? (row.expenseCents / 100).toFixed(2) : '',
      ].join(',')),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledgly-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFieldsByType: Record<string, ImportField[]> = {
    charge: [
      { key: 'member', label: 'Member', required: true, aliases: ['member name', 'name', 'student'] },
      { key: 'title', label: 'Title', required: true, aliases: ['charge', 'description', 'item'] },
      { key: 'amount', label: 'Amount', required: true, aliases: ['cost', 'price', 'fee'] },
      { key: 'category', label: 'Category', required: false, aliases: ['type', 'charge type'] },
      { key: 'dueDate', label: 'Due Date', required: false, aliases: ['due', 'due date', 'deadline'] },
    ],
    expense: [
      { key: 'title', label: 'Title', required: true, aliases: ['name', 'expense', 'description'] },
      { key: 'amount', label: 'Amount', required: true, aliases: ['cost', 'price', 'total'] },
      { key: 'date', label: 'Date', required: true, aliases: ['expense date', 'paid date'] },
      { key: 'category', label: 'Category', required: false, aliases: ['type', 'expense type'] },
      { key: 'vendor', label: 'Vendor', required: false, aliases: ['payee', 'paid to', 'store'] },
      { key: 'description', label: 'Description', required: false, aliases: ['notes', 'memo', 'details'] },
    ],
    payment: [
      { key: 'payerName', label: 'Payer Name', required: true, aliases: ['name', 'member', 'payer', 'from'] },
      { key: 'amount', label: 'Amount', required: true, aliases: ['cost', 'price', 'total'] },
      { key: 'date', label: 'Date', required: true, aliases: ['payment date', 'paid date', 'paid at'] },
      { key: 'memo', label: 'Memo', required: false, aliases: ['notes', 'description', 'details'] },
    ],
  };

  const handleImportRecords = async (records: Record<string, string>[]) => {
    if (!currentOrgId) throw new Error('No org selected');

    if (importType === 'charge') {
      const validCategories = ['DUES', 'EVENT', 'FINE', 'MERCH', 'OTHER'];
      const charges: Array<{ membershipId: string; category: string; title: string; amountCents: number; dueDate?: string }> = [];
      const errors: string[] = [];

      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const memberName = r.member?.trim();
        const title = r.title?.trim();
        const amountStr = r.amount?.trim();
        if (!memberName || !title || !amountStr) { errors.push(`Row ${i + 1}: missing required field(s)`); continue; }

        let bestMatch: { id: string; name: string; score: number } | null = null;
        for (const m of members) {
          const name = (m as any).displayName || (m as any).name || '';
          const score = calculateNameSimilarity(memberName, name);
          if (score > (bestMatch?.score || 0)) bestMatch = { id: m.id, name, score };
        }
        if (!bestMatch || bestMatch.score < 0.7) { errors.push(`Row ${i + 1}: could not match member "${memberName}"`); continue; }

        const cleaned = amountStr.replace(/[$,]/g, '');
        const amountCents = Math.round(parseFloat(cleaned) * 100);
        if (isNaN(amountCents) || amountCents <= 0) { errors.push(`Row ${i + 1}: invalid amount`); continue; }

        const rawCat = r.category?.trim().toUpperCase() || 'OTHER';
        const category = validCategories.includes(rawCat) ? rawCat : 'OTHER';
        let dueDate: string | undefined;
        if (r.dueDate?.trim()) { const d = new Date(r.dueDate.trim()); if (!isNaN(d.getTime())) dueDate = d.toISOString(); }

        charges.push({ membershipId: bestMatch.id, category, title, amountCents, dueDate });
      }

      if (charges.length === 0) throw new Error(errors.length > 0 ? errors.slice(0, 5).join('\n') : 'No valid charges found');
      await bulkCreateCharges.mutateAsync({ orgId: currentOrgId, charges });
      return { success: charges.length, errors: errors.length };
    }

    if (importType === 'expense') {
      const validCategories = ['EVENT', 'SUPPLIES', 'FOOD', 'VENUE', 'MARKETING', 'SERVICES', 'OTHER'];
      let success = 0, errorCount = 0;
      for (const r of records) {
        if (!r.title?.trim() || !r.amount?.trim()) { errorCount++; continue; }
        const amountCents = Math.round(parseFloat(r.amount.replace(/[$,]/g, '')) * 100);
        if (isNaN(amountCents) || amountCents <= 0) { errorCount++; continue; }
        const category = validCategories.includes(r.category?.toUpperCase() || '') ? r.category!.toUpperCase() : 'OTHER';
        try {
          await createExpense.mutateAsync({
            orgId: currentOrgId,
            data: {
              title: r.title.trim(),
              category,
              amountCents,
              date: r.date?.trim() || new Date().toISOString().split('T')[0],
              vendor: r.vendor?.trim() || undefined,
              description: r.description?.trim() || undefined,
            },
          });
          success++;
        } catch { errorCount++; }
      }
      return { success, errors: errorCount };
    }

    if (importType === 'payment') {
      const payments: Array<{ amountCents: number; paidAt: string; rawPayerName?: string; memo?: string; membershipId?: string }> = [];
      const errors: string[] = [];

      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const payerName = r.payerName?.trim();
        const amountStr = r.amount?.trim();
        const dateStr = r.date?.trim();
        if (!payerName || !amountStr || !dateStr) { errors.push(`Row ${i + 1}: missing required field(s)`); continue; }

        const amountCents = Math.round(parseFloat(amountStr.replace(/[$,]/g, '')) * 100);
        if (isNaN(amountCents) || amountCents <= 0) { errors.push(`Row ${i + 1}: invalid amount`); continue; }

        const paidAt = new Date(dateStr);
        if (isNaN(paidAt.getTime())) { errors.push(`Row ${i + 1}: invalid date`); continue; }

        // Try to match payer to a member
        let membershipId: string | undefined;
        for (const m of members) {
          const name = (m as any).displayName || (m as any).name || '';
          if (calculateNameSimilarity(payerName, name) >= 0.7) { membershipId = m.id; break; }
        }

        payments.push({
          amountCents,
          paidAt: paidAt.toISOString().split('T')[0],
          rawPayerName: payerName,
          memo: r.memo?.trim() || undefined,
          membershipId,
        });
      }

      if (payments.length === 0) throw new Error(errors.length > 0 ? errors.slice(0, 5).join('\n') : 'No valid payments found');
      const result = await bulkCreatePayments.mutateAsync({ orgId: currentOrgId, payments });
      return { success: result.createdCount, errors: result.errorCount + errors.length };
    }

    throw new Error('Unknown import type');
  };

  return (
    <div className="space-y-6" data-tour="spreadsheet-view">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Spreadsheet"
          helpText={`Combined view of all charges, expenses, and payments in one place. ${isAdmin ? 'Click any cell to edit. Sort by clicking column headers.' : 'View all financial transactions.'}`}
          actions={
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button size="sm" onClick={handleStartInlineRow} className="hover:opacity-90 transition-opacity" disabled={inlineNewRow}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Row
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isAdmin && (
                    <>
                      {(['charge', 'expense', 'payment'] as const).map((t) => (
                        <DropdownMenuItem
                          key={t}
                          onClick={() => { setImportType(t); setShowImport(true); }}
                          className="cursor-pointer"
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Import {t === 'charge' ? 'Charges' : t === 'expense' ? 'Expenses' : 'Payments'}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      </FadeIn>

      {/* Summary Cards */}
      {rows.length > 0 && (
        <FadeIn delay={0.1}>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-success mb-2">
                <ArrowUpRight className="w-4 h-4" />
                <span className="text-sm font-medium">Income</span>
              </div>
              <Money cents={totals.income} size="lg" className="text-success" />
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-warning mb-2">
                <Wallet className="w-4 h-4" />
                <span className="text-sm font-medium">Outstanding</span>
              </div>
              <Money cents={totals.outstanding} size="lg" className="text-warning" />
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <ArrowDownRight className="w-4 h-4" />
                <span className="text-sm font-medium">Total Expenses</span>
              </div>
              <Money cents={totals.expenses} size="lg" className="text-destructive" />
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <span className="text-sm font-medium">Net Balance</span>
              </div>
              <Money
                cents={totals.net}
                size="lg"
                className={totals.net >= 0 ? 'text-success' : 'text-destructive'}
              />
            </div>
          </div>
        </FadeIn>
      )}

      {/* Search + Filter */}
      <FadeIn delay={0.15}>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search transactions..."
              aria-label="Search spreadsheet"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-secondary/30 border-border/50"
            />
          </div>
          <div className="flex gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] h-8 bg-secondary/30 border-border/50 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="charge">Charges Only</SelectItem>
                <SelectItem value="expense">Expenses Only</SelectItem>
                <SelectItem value="payment">Payments Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FadeIn>

      {/* Spreadsheet Table */}
      <FadeIn delay={0.25}>
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {isAdmin && (
                    <th className="w-16 pl-5 pr-2 py-3">
                      <div className="w-14 h-7 flex items-center gap-1">
                        {selectedRows.size > 0 && (
                          <button
                            onClick={handleDeleteSelected}
                            className="w-7 h-7 shrink-0 flex items-center justify-center transition-colors hover:text-destructive"
                            title={`Delete ${selectedRows.size} selected`}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                        {selectedOutstandingCharges.length > 0 && (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setShowAllocateDialog(true)}
                                  className="w-7 h-7 shrink-0 flex items-center justify-center transition-colors hover:text-primary"
                                >
                                  <Link2 className="w-4 h-4 text-muted-foreground hover:text-primary" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                Allocate {selectedOutstandingCharges.length} charge{selectedOutstandingCharges.length !== 1 ? 's' : ''}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </th>
                  )}
                  <th
                    className="text-left px-5 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none w-28"
                    onClick={() => {
                      if (sortBy === 'date') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('date');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    <span className="flex items-center gap-1">
                      Date
                      {sortBy === 'date' && (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                  <th
                    className="text-left px-5 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none w-36"
                    onClick={() => {
                      if (sortBy === 'member') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('member');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <span className="flex items-center gap-1">
                      Member/Vendor
                      {sortBy === 'member' && (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                  <th
                    className="text-left px-5 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none w-28"
                    onClick={() => {
                      if (sortBy === 'category') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('category');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <span className="flex items-center gap-1">
                      Category
                      {sortBy === 'category' && (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground w-48 max-w-[12rem]">Title</th>
                  <th
                    className="text-right px-5 py-3 font-medium text-success cursor-pointer hover:text-success/80 select-none w-24"
                    onClick={() => {
                      if (sortBy === 'income') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('income');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    <span className="flex items-center justify-end gap-1">
                      <DollarSign className="h-3 w-3" />
                      Income
                      {sortBy === 'income' && (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                  <th
                    className="text-right px-5 py-3 font-medium text-warning cursor-pointer hover:text-warning/80 select-none w-24"
                    onClick={() => {
                      if (sortBy === 'outstanding') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('outstanding');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    <span className="flex items-center justify-end gap-1">
                      <Wallet className="h-3 w-3" />
                      Outstanding
                      {sortBy === 'outstanding' && (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                  <th
                    className="text-right pl-5 pr-8 py-3 font-medium text-destructive cursor-pointer hover:text-destructive/80 select-none w-24"
                    onClick={() => {
                      if (sortBy === 'expense') {
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy('expense');
                        setSortOrder('desc');
                      }
                    }}
                  >
                    <span className="flex items-center justify-end gap-1">
                      <DollarSign className="h-3 w-3" />
                      Expense
                      {sortBy === 'expense' && (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Inline New Row */}
                {isAdmin && inlineNewRow && (
                  <tr className="border-b border-border/50 bg-primary/5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <td className="pl-5 pr-2 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleSaveInlineRow}
                          className="w-7 h-7 flex items-center justify-center transition-colors hover:text-success text-success/70"
                          title="Save row"
                          disabled={createCharge.isPending || createExpense.isPending || createPayment.isPending}
                        >
                          {(createCharge.isPending || createExpense.isPending || createPayment.isPending) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={handleCancelInlineRow}
                          className="w-7 h-7 flex items-center justify-center transition-colors text-muted-foreground hover:text-destructive"
                          title="Cancel"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    {/* Type selector */}
                    <td className="px-5 py-2 w-28">
                      <Select value={newRowType} onValueChange={(v) => {
                        const val = v as typeof newRowType;
                        if (val === 'multi-charge') {
                          handleCancelInlineRow();
                          setShowMultiChargeDialog(true);
                          return;
                        }
                        if (val === 'multi-expense') {
                          handleCancelInlineRow();
                          setShowMultiExpenseDialog(true);
                          return;
                        }
                        setNewRowType(val);
                        setNewRowData(d => ({ ...d, category: '' }));
                        setInlineNewRowField('date');
                      }}>
                        <SelectTrigger className="h-7 text-xs bg-transparent border-border/50 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="charge">Charge</SelectItem>
                          <SelectItem value="multi-charge">Multi-charge</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                          <SelectItem value="multi-expense">Multi-expense</SelectItem>
                          <SelectItem value="payment">Payment</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    {/* Member */}
                    <td className="px-5 py-2 w-36">
                      {newRowType === 'expense' ? (
                        <input
                          placeholder="Vendor..."
                          value={newRowData.vendor}
                          onChange={(e) => setNewRowData(d => ({ ...d, vendor: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); setInlineNewRowField('category'); }
                            if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); setInlineNewRowField('date'); }
                            if (e.key === 'Escape') handleCancelInlineRow();
                            if (e.key === 'Enter') handleSaveInlineRow();
                          }}
                          autoFocus={inlineNewRowField === 'member'}
                          className="h-6 text-xs bg-transparent border-0 shadow-none ring-0 outline-none focus:ring-0 w-full"
                        />
                      ) : (
                        <Select value={newRowData.membershipId || 'none'} onValueChange={(v) => setNewRowData(d => ({ ...d, membershipId: v === 'none' ? '' : v }))}>
                          <SelectTrigger className="h-7 text-xs bg-transparent border-border/50">
                            <SelectValue placeholder="Member..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" disabled>Select member...</SelectItem>
                            {members.filter(m => m.id).map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {(m as any).displayName || (m as any).name || (m as any).user?.name || 'Unknown'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    {/* Category */}
                    <td className="px-5 py-2 w-28">
                      {newRowType === 'payment' ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Select value={newRowData.category || 'none'} onValueChange={(v) => setNewRowData(d => ({ ...d, category: v === 'none' ? '' : v }))}>
                          <SelectTrigger className="h-7 text-xs bg-transparent border-border/50 w-24">
                            <SelectValue placeholder="Category..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" disabled>Category...</SelectItem>
                            {(newRowType === 'charge' ? CHARGE_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {(newRowType === 'charge' ? CHARGE_CATEGORY_LABELS : EXPENSE_CATEGORY_LABELS)[cat as keyof typeof CHARGE_CATEGORY_LABELS & keyof typeof EXPENSE_CATEGORY_LABELS]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    {/* Title */}
                    <td className="px-5 py-2 w-48">
                      <input
                        placeholder={newRowType === 'payment' ? 'Memo...' : 'Title...'}
                        value={newRowType === 'payment' ? newRowData.memo : newRowData.description}
                        onChange={(e) => newRowType === 'payment'
                          ? setNewRowData(d => ({ ...d, memo: e.target.value }))
                          : setNewRowData(d => ({ ...d, description: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); setInlineNewRowField('amount'); }
                          if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); setInlineNewRowField('category'); }
                          if (e.key === 'Escape') handleCancelInlineRow();
                          if (e.key === 'Enter') handleSaveInlineRow();
                        }}
                        autoFocus={inlineNewRowField === 'description'}
                        className="h-6 text-xs bg-transparent border-0 shadow-none ring-0 outline-none focus:ring-0 w-full"
                      />
                    </td>
                    {/* Amount cells (spans 3 columns) */}
                    <td className="px-5 py-2 text-right w-24" colSpan={3}>
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs text-muted-foreground">$</span>
                        <input
                          placeholder="0.00"
                          value={newRowData.amountCents ? (newRowData.amountCents / 100).toFixed(2) : ''}
                          onChange={(e) => {
                            const cents = Math.round(parseFloat(e.target.value || '0') * 100);
                            setNewRowData(d => ({ ...d, amountCents: isNaN(cents) ? 0 : cents }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); setInlineNewRowField('description'); }
                            if (e.key === 'Escape') handleCancelInlineRow();
                            if (e.key === 'Enter') handleSaveInlineRow();
                          }}
                          autoFocus={inlineNewRowField === 'amount'}
                          type="number"
                          step="0.01"
                          className="h-6 text-xs bg-transparent border-0 shadow-none ring-0 outline-none focus:ring-0 w-20 text-right"
                        />
                      </div>
                    </td>
                  </tr>
                )}
                {/* Select All / Add Row */}
                {isAdmin && !isLoading && (
                  <tr className="border-b border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <td className="pl-5 pr-2 py-2">
                      <div className="flex items-center gap-1">
                        {!inlineNewRow && (
                          <button
                            onClick={handleStartInlineRow}
                            className="w-7 h-7 flex items-center justify-center transition-colors hover:text-primary"
                            title="Add new row"
                          >
                            <Plus className="w-4 h-4 text-muted-foreground hover:text-primary" />
                          </button>
                        )}
                        <button
                          onClick={toggleSelectAll}
                          className="w-7 h-7 flex items-center justify-center transition-colors hover:text-primary"
                          title={isAllSelected ? "Deselect all" : "Select all"}
                        >
                          {isAllSelected ? (
                            <CheckCircle2 className="w-4 h-4 text-primary" />
                          ) : (
                            <Circle className="w-4 h-4 text-muted-foreground hover:text-primary" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td colSpan={7}></td>
                  </tr>
                )}
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {isAdmin && <td className="pl-5 pr-2 py-3"><Skeleton className="h-7 w-14" /></td>}
                      <td className="px-5 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-5 w-20" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-5 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="pl-5 pr-8 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                    </tr>
                  ))
                ) : paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-muted-foreground">
                      No transactions found
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={cn(
                        'animate-in-up',
                        'border-b border-border/50 hover:bg-secondary/30 transition-colors',
                        row.type === 'charge' && 'bg-warning/5',
                        row.type === 'expense' && 'bg-destructive/5',
                        row.type === 'payment' && 'bg-success/5',
                        row.isChild && 'bg-secondary/20',
                      )}
                    >
                      {isAdmin && (
                        <td className="pl-5 pr-2 py-2">
                          <div className="flex items-center gap-1">
                            {row.isParent ? (
                              <button
                                onClick={() => toggleParentExpand(row.id)}
                                className="w-7 h-7 flex items-center justify-center transition-colors hover:text-primary"
                                title={expandedParents.has(row.id) ? 'Collapse' : 'Expand'}
                              >
                                {expandedParents.has(row.id) ? (
                                  <ChevronDown className="w-4 h-4 text-primary" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )}
                              </button>
                            ) : row.isChild ? (
                              <div className="w-7 h-7" />
                            ) : null}
                            {!row.isChild && (
                              <>
                                <button
                                  onClick={() => handleDeleteRow(row)}
                                  className="w-7 h-7 flex items-center justify-center transition-colors hover:text-destructive"
                                  title="Delete row"
                                >
                                  <Minus className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                                </button>
                                <button
                                  onClick={() => toggleRowSelection(row.id)}
                                  className="w-7 h-7 flex items-center justify-center transition-colors"
                                  title={selectedRows.has(row.id) ? "Deselect" : "Select"}
                                >
                                  {selectedRows.has(row.id) ? (
                                    <CheckCircle2 className="w-4 h-4 text-primary" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-muted-foreground hover:text-primary" />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-3 w-28">
                        <div className="flex items-center gap-1">
                          {!isAdmin && row.isParent && (
                            <button
                              onClick={() => toggleParentExpand(row.id)}
                              className="shrink-0 p-0.5 hover:text-primary transition-colors"
                            >
                              {expandedParents.has(row.id) ? (
                                <ChevronDown className="w-3.5 h-3.5 text-primary" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </button>
                          )}
                          <EditableCell
                            value={row.date}
                            type="date"
                            isEditing={editingCell?.rowId === row.id && editingCell?.column === 'date'}
                            onEdit={() => setEditingCell({ rowId: row.id, column: 'date' })}
                            onSave={(v) => handleSaveCell(row, 'date', v)}
                            onCancel={() => setEditingCell(null)}
                            onNavigate={(dir) => handleCellNavigate(row.id, 'date', dir)}
                            isAdmin={isAdmin}
                            rowType={row.type}
                            column="date"
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3 w-36">
                        {row.type === 'charge' || row.type === 'payment' ? (
                          <EditableCell
                            value={row.membershipId || ''}
                            type="member"
                            isEditing={editingCell?.rowId === row.id && editingCell?.column === 'member'}
                            onEdit={() => setEditingCell({ rowId: row.id, column: 'member' })}
                            onSave={(v) => handleSaveCell(row, 'member', v)}
                            onCancel={() => setEditingCell(null)}
                            onNavigate={(dir) => handleCellNavigate(row.id, 'member', dir)}
                            isAdmin={isAdmin}
                            rowType={row.type}
                            column="member"
                            members={members}
                            onAddMember={handleAddMember}
                          />
                        ) : (
                          <EditableCell
                            value={row.member || ''}
                            type="text"
                            isEditing={editingCell?.rowId === row.id && editingCell?.column === 'member'}
                            onEdit={() => setEditingCell({ rowId: row.id, column: 'member' })}
                            onSave={(v) => handleSaveCell(row, 'member', v)}
                            onCancel={() => setEditingCell(null)}
                            onNavigate={(dir) => handleCellNavigate(row.id, 'member', dir)}
                            isAdmin={isAdmin}
                            rowType={row.type}
                            column="member"
                          />
                        )}
                      </td>
                      <td className="px-5 py-3 w-28">
                        {row.type === 'payment' ? (
                          <span className="text-xs text-muted-foreground">{row.category}</span>
                        ) : (
                          <EditableCell
                            value={row.category}
                            type="category"
                            isEditing={editingCell?.rowId === row.id && editingCell?.column === 'category'}
                            onEdit={() => setEditingCell({ rowId: row.id, column: 'category' })}
                            onSave={(v) => handleSaveCell(row, 'category', v)}
                            onCancel={() => setEditingCell(null)}
                            onNavigate={(dir) => handleCellNavigate(row.id, 'category', dir)}
                            isAdmin={isAdmin}
                            rowType={row.type}
                            column="category"
                          />
                        )}
                      </td>
                      <td className={cn("px-5 py-3 w-48 max-w-[12rem]", row.isChild && "pl-10")}>
                        <div className="flex items-center gap-2 min-w-0">
                          {row.isParent && (
                            <Badge variant="outline" className="text-[10px] shrink-0 bg-primary/10 text-primary border-primary/30">
                              {row.type === 'charge' ? 'Multi' : 'Multi'}
                            </Badge>
                          )}
                          {row.isChild && !isAdmin && (
                            <span className="text-muted-foreground/50 shrink-0">&mdash;</span>
                          )}
                          <div className="min-w-0 flex-1">
                            <EditableCell
                              value={row.description}
                              type="text"
                              isEditing={editingCell?.rowId === row.id && editingCell?.column === 'description'}
                              onEdit={() => setEditingCell({ rowId: row.id, column: 'description' })}
                              onSave={(v) => handleSaveCell(row, 'description', v)}
                              onCancel={() => setEditingCell(null)}
                              onNavigate={(dir) => handleCellNavigate(row.id, 'description', dir)}
                              isAdmin={isAdmin}
                              rowType={row.type}
                              column="description"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right w-24">
                        {row.incomeCents > 0 ? (
                          row.type === 'charge' ? (
                            // Charge income = allocated payments (not editable, show payer tooltip)
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Money cents={row.incomeCents} size="sm" className="text-success" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  {(() => {
                                    const charge = chargesMap.get(row.id);
                                    const allocs = charge?.allocations || [];
                                    if (allocs.length === 0) return <p className="text-xs">Allocated</p>;
                                    return (
                                      <div className="space-y-1">
                                        {allocs.map((a: any) => (
                                          <p key={a.id} className="text-xs">
                                            {a.payerName || 'Unknown'} &mdash; <Money cents={a.amountCents} size="sm" inline />
                                          </p>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <EditableCell
                              value={row.incomeCents}
                              type="money"
                              isEditing={editingCell?.rowId === row.id && editingCell?.column === 'amount'}
                              onEdit={() => setEditingCell({ rowId: row.id, column: 'amount' })}
                              onSave={(v) => handleSaveCell(row, 'amount', v)}
                              onCancel={() => setEditingCell(null)}
                              onNavigate={(dir) => handleCellNavigate(row.id, 'amount', dir)}
                              isAdmin={isAdmin}
                              rowType={row.type}
                              column="income"
                            />
                          )
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right w-24">
                        {row.outstandingCents > 0 ? (
                          <EditableCell
                            value={row.outstandingCents}
                            type="money"
                            isEditing={editingCell?.rowId === row.id && editingCell?.column === 'amount'}
                            onEdit={() => setEditingCell({ rowId: row.id, column: 'amount' })}
                            onSave={(v) => handleSaveCell(row, 'amount', v)}
                            onCancel={() => setEditingCell(null)}
                            onNavigate={(dir) => handleCellNavigate(row.id, 'amount', dir)}
                            isAdmin={isAdmin}
                            rowType={row.type}
                            column="outstanding"
                          />
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </td>
                      <td className="pl-5 pr-8 py-3 text-right w-24">
                        {row.expenseCents > 0 ? (
                          <EditableCell
                            value={row.expenseCents}
                            type="money"
                            isEditing={editingCell?.rowId === row.id && editingCell?.column === 'amount'}
                            onEdit={() => setEditingCell({ rowId: row.id, column: 'amount' })}
                            onSave={(v) => handleSaveCell(row, 'amount', v)}
                            onCancel={() => setEditingCell(null)}
                            onNavigate={(dir) => handleCellNavigate(row.id, 'amount', dir)}
                            isAdmin={isAdmin}
                            rowType={row.type}
                            column="expense"
                          />
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Totals Row */}
              {!isLoading && rows.length > 0 && (
                <tfoot>
                  <tr className="bg-secondary/50 font-medium">
                    <td className="px-5 py-3" colSpan={isAdmin ? 5 : 4}>
                      <span className="text-muted-foreground">Total ({rows.length} transactions)</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Money cents={totals.income} size="sm" className="text-success font-semibold" />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Money cents={totals.outstanding} size="sm" className="text-warning font-semibold" />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Money cents={totals.expenses} size="sm" className="text-destructive font-semibold" />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </FadeIn>

      {/* Pagination Controls - Bottom */}
      {rows.length > 0 && (
        <FadeIn delay={0.3}>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="justify-center pt-4" />
        </FadeIn>
      )}

      {/* Add Row Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Row</DialogTitle>
            <DialogDescription>
              Create a new charge, expense, or payment entry.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Type</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={newRowType === 'charge' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNewRowType('charge')}
                  className="flex-1"
                >
                  <ArrowUpRight className="w-4 h-4 mr-1" />
                  Charge
                </Button>
                <Button
                  variant={'outline'}
                  size="sm"
                  onClick={() => { setShowAddDialog(false); setShowMultiChargeDialog(true); }}
                  className="flex-1"
                >
                  <Layers className="w-4 h-4 mr-1" />
                  Multi-charge
                </Button>
                <Button
                  variant={newRowType === 'expense' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNewRowType('expense')}
                  className="flex-1"
                >
                  <ArrowDownRight className="w-4 h-4 mr-1" />
                  Expense
                </Button>
                <Button
                  variant={'outline'}
                  size="sm"
                  onClick={() => { setShowAddDialog(false); setShowMultiExpenseDialog(true); }}
                  className="flex-1"
                >
                  <Layers className="w-4 h-4 mr-1" />
                  Multi-expense
                </Button>
                <Button
                  variant={newRowType === 'payment' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNewRowType('payment')}
                  className="flex-1"
                >
                  <DollarSign className="w-4 h-4 mr-1" />
                  Payment
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Date</Label>
              <DatePicker
                value={newRowData.date}
                onChange={(date) => setNewRowData({ ...newRowData, date })}
              />
            </div>

            {newRowType !== 'payment' && (
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={newRowData.category}
                  onValueChange={(v) => setNewRowData({ ...newRowData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(newRowType === 'charge' ? CHARGE_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {newRowType === 'charge'
                          ? CHARGE_CATEGORY_LABELS[cat as ChargeCategory]
                          : EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>{newRowType === 'payment' ? 'Memo' : 'Title'}</Label>
              <Input
                value={newRowType === 'payment' ? newRowData.memo : newRowData.description}
                onChange={(e) =>
                  setNewRowData({
                    ...newRowData,
                    [newRowType === 'payment' ? 'memo' : 'description']: e.target.value,
                  })
                }
                placeholder={newRowType === 'payment' ? 'Payment note' : 'Title'}
              />
            </div>

            {newRowType === 'charge' && (
              <div className="grid gap-2">
                <Label>Member</Label>
                <Select
                  value={newRowData.membershipId}
                  onValueChange={(v) => setNewRowData({ ...newRowData, membershipId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.filter((m) => m.id).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName || m.name || m.user?.name || 'Unknown'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newRowType === 'payment' && (
              <div className="grid gap-2">
                <Label>Member</Label>
                <Select
                  value={newRowData.membershipId}
                  onValueChange={(v) => setNewRowData({ ...newRowData, membershipId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.filter((m) => m.id).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName || m.name || m.user?.name || 'Unknown'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {newRowType === 'expense' && (
              <div className="grid gap-2">
                <Label>Vendor</Label>
                <Input
                  value={newRowData.vendor}
                  onChange={(e) => setNewRowData({ ...newRowData, vendor: e.target.value })}
                  placeholder="Vendor name"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={(newRowData.amountCents / 100).toFixed(2)}
                onChange={(e) =>
                  setNewRowData({
                    ...newRowData,
                    amountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                  })
                }
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddRow} disabled={createCharge.isPending || createExpense.isPending || createPayment.isPending}>
              {(createCharge.isPending || createExpense.isPending || createPayment.isPending) ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allocate Payments Dialog */}
      <AllocatePaymentsDialog
        open={showAllocateDialog}
        onOpenChange={setShowAllocateDialog}
        charges={selectedOutstandingCharges}
        chargesMap={chargesMap}
        payments={(paymentsData?.data || []).filter((p: any) => p.unallocatedCents > 0)}
        orgId={currentOrgId}
        allocatePayment={allocatePayment}
        autoAllocate={autoAllocate}
        onSuccess={() => {
          setSelectedRows(new Set());
          setShowAllocateDialog(false);
        }}
        toast={toast}
      />

      <CSVImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        title={`Import ${importType === 'charge' ? 'Charges' : importType === 'expense' ? 'Expenses' : 'Payments'}`}
        description={`Upload a CSV file to bulk import ${importType === 'charge' ? 'charges' : importType === 'expense' ? 'expenses' : 'payments'}.${importType === 'charge' ? ' Member names will be fuzzy-matched to existing members.' : importType === 'payment' ? ' Payer names will be matched to existing members.' : ''}`}
        fields={importFieldsByType[importType]}
        onImport={handleImportRecords}
      />

      {/* Multi-charge Create Dialog */}
      <ChargeCreateDialog
        open={showMultiChargeDialog}
        onClose={() => setShowMultiChargeDialog(false)}
        onCreate={async (data) => {
          if (!currentOrgId) return;
          try {
            await createMultiCharge.mutateAsync({
              orgId: currentOrgId,
              data: {
                membershipIds: data.membershipIds,
                category: data.category,
                title: data.title,
                amountCents: Math.round(parseFloat(data.amount) * 100),
                dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : undefined,
              },
            });
            toast({ title: 'Multi-charge created' });
            setShowMultiChargeDialog(false);
          } catch (error: any) {
            toast({ title: 'Error creating multi-charge', description: error.message, variant: 'destructive' });
          }
        }}
        members={members.filter(m => m.id).map(m => ({
          id: m.id,
          displayName: (m as any).displayName || (m as any).name || (m as any).user?.name || 'Unknown',
        }))}
        loadingMembers={!membersData}
        isPending={createMultiCharge.isPending}
        onAddMember={async (name) => {
          const id = await handleAddMember(name);
          return id ? { id, displayName: name } : null;
        }}
        isAddingMember={createMembers.isPending}
      />

      {/* Multi-expense Create Dialog */}
      <MultiExpenseCreateDialog
        open={showMultiExpenseDialog}
        onClose={() => setShowMultiExpenseDialog(false)}
        onCreate={async (data) => {
          if (!currentOrgId) return;
          try {
            await createMultiExpense.mutateAsync({
              orgId: currentOrgId,
              data: {
                category: data.category,
                title: data.title,
                date: data.date,
                vendor: data.vendor,
                children: data.children,
              },
            });
            toast({ title: 'Multi-expense created' });
            setShowMultiExpenseDialog(false);
          } catch (error: any) {
            toast({ title: 'Error creating multi-expense', description: error.message, variant: 'destructive' });
          }
        }}
        isPending={createMultiExpense.isPending}
      />
    </div>
  );
}

function AllocatePaymentsDialog({
  open,
  onOpenChange,
  charges,
  chargesMap,
  payments,
  orgId,
  allocatePayment,
  autoAllocate,
  onSuccess,
  toast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  charges: SpreadsheetRow[];
  chargesMap: Map<string, any>;
  payments: any[];
  orgId: string | null;
  allocatePayment: ReturnType<typeof useAllocatePayment>;
  autoAllocate: ReturnType<typeof useAutoAllocateToCharge>;
  onSuccess: () => void;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const [selectedPaymentId, setSelectedPaymentId] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [isAutoAllocating, setIsAutoAllocating] = useState(false);

  const filteredPayments = useMemo(() => {
    if (!paymentSearch.trim()) return payments;
    const q = paymentSearch.toLowerCase();
    return payments.filter(
      (p: any) =>
        p.rawPayerName?.toLowerCase().includes(q) ||
        p.memo?.toLowerCase().includes(q),
    );
  }, [payments, paymentSearch]);

  const selectedPayment = payments.find((p: any) => p.id === selectedPaymentId);

  // Compute allocation preview: distribute payment funds across charges in order
  const allocationPreview = useMemo(() => {
    if (!selectedPayment) return [];
    let remaining = selectedPayment.unallocatedCents;
    return charges.map((charge) => {
      const amount = Math.min(remaining, charge.outstandingCents);
      remaining -= amount;
      return { chargeId: charge.id, description: charge.description, member: charge.member, outstandingCents: charge.outstandingCents, allocateCents: amount };
    });
  }, [selectedPayment, charges]);

  const totalToAllocate = allocationPreview.reduce((sum, a) => sum + a.allocateCents, 0);
  const remainingAfter = selectedPayment ? selectedPayment.unallocatedCents - totalToAllocate : 0;

  const handleClose = () => {
    setSelectedPaymentId('');
    setPaymentSearch('');
    onOpenChange(false);
  };

  const handleManualAllocate = async () => {
    if (!orgId || !selectedPaymentId || totalToAllocate <= 0) return;
    const allocations = allocationPreview
      .filter((a) => a.allocateCents > 0)
      .map((a) => ({ chargeId: a.chargeId, amountCents: a.allocateCents }));
    try {
      await allocatePayment.mutateAsync({ orgId, paymentId: selectedPaymentId, allocations });
      toast({ title: `Allocated payment to ${allocations.length} charge${allocations.length !== 1 ? 's' : ''}` });
      setSelectedPaymentId('');
      setPaymentSearch('');
      onSuccess();
    } catch (error: any) {
      toast({ title: 'Allocation failed', description: error.message || 'Please try again', variant: 'destructive' });
    }
  };

  const handleAutoAllocateAll = async () => {
    if (!orgId) return;
    setIsAutoAllocating(true);
    let successCount = 0;
    for (const charge of charges) {
      try {
        await autoAllocate.mutateAsync({ orgId, chargeId: charge.id });
        successCount++;
      } catch {
        // continue with remaining charges
      }
    }
    setIsAutoAllocating(false);
    if (successCount > 0) {
      toast({ title: `Auto-allocated ${successCount} charge${successCount !== 1 ? 's' : ''}` });
      setSelectedPaymentId('');
      setPaymentSearch('');
      onSuccess();
    } else {
      toast({ title: 'No payments could be auto-allocated', description: 'No matching unallocated payments found for these members', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o ? handleClose() : onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Allocate Payments</DialogTitle>
          <DialogDescription>
            {charges.length} outstanding charge{charges.length !== 1 ? 's' : ''} selected
          </DialogDescription>
        </DialogHeader>

        {/* Selected charges summary */}
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {charges.map((charge) => (
            <div key={charge.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{charge.description}</p>
                <p className="text-xs text-muted-foreground">{charge.member || 'No member'}</p>
              </div>
              <Money cents={charge.outstandingCents} size="sm" className="text-warning shrink-0 ml-2" />
            </div>
          ))}
        </div>

        {/* Payment search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search payments..."
            aria-label="Search payments"
            value={paymentSearch}
            onChange={(e) => setPaymentSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Payment list */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-none" style={{ maxHeight: '30vh' }}>
          <div className="space-y-2 py-1">
            {filteredPayments.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {paymentSearch ? 'No matching payments found' : 'No unallocated payments available'}
                </p>
              </div>
            ) : (
              filteredPayments.map((payment: any) => (
                <button
                  key={payment.id}
                  type="button"
                  onClick={() => setSelectedPaymentId(payment.id)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
                    selectedPaymentId === payment.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border/50 hover:bg-secondary/50',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{payment.rawPayerName || 'Unknown Payer'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(payment.paidAt)}
                      {payment.memo && ` \u2022 "${payment.memo}"`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <Money cents={payment.unallocatedCents} size="sm" />
                    <p className="text-xs text-muted-foreground">available</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Allocation preview */}
        {selectedPayment && (
          <div className="space-y-2 pt-2 border-t border-border/30">
            <p className="text-xs font-medium text-muted-foreground">Allocation Preview</p>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {allocationPreview.map((a) => (
                <div key={a.chargeId} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-secondary/30">
                  <span className="truncate mr-2">{a.description}</span>
                  {a.allocateCents > 0 ? (
                    <Money cents={a.allocateCents} size="sm" className="text-success shrink-0" />
                  ) : (
                    <span className="text-muted-foreground shrink-0">$0.00</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
              <span>Remaining on payment after</span>
              <Money cents={remainingAfter} size="sm" />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoAllocateAll}
            disabled={isAutoAllocating || allocatePayment.isPending}
          >
            {isAutoAllocating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Auto-Allocating...
              </>
            ) : (
              'Auto-Allocate All'
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleManualAllocate}
              disabled={allocatePayment.isPending || !selectedPaymentId || totalToAllocate <= 0}
            >
              {allocatePayment.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Allocating...
                </>
              ) : (
                'Allocate'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
