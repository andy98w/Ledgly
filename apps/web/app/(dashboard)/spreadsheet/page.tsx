'use client';

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { ArrowUpRight, ArrowDownRight, Download, Filter, Plus, DollarSign, Wallet, Search, Minus, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Trash2, Circle, CheckCircle2, Link2, Loader2, CreditCard } from 'lucide-react';
import { useCharges, useUpdateCharge, useCreateCharge, useVoidCharge, useRestoreCharge } from '@/lib/queries/charges';
import { useExpenses, useUpdateExpense, useCreateExpense, useDeleteExpense, useRestoreExpense } from '@/lib/queries/expenses';
import { usePayments, useUpdatePayment, useCreatePayment, useDeletePayment, useRestorePayment, useAllocatePayment, useAutoAllocateToCharge } from '@/lib/queries/payments';
import { useMembers } from '@/lib/queries/members';
import { useAuthStore } from '@/lib/stores/auth';
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
import { FadeIn } from '@/components/ui/page-transition';
import { PageHeader } from '@/components/ui/page-header';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

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
    if (e.key === 'Enter') {
      handleSave();
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
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search members..."
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [newRowType, setNewRowType] = useState<'charge' | 'expense' | 'payment'>('charge');
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
  const user = useAuthStore((s) => s.user);
  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);
  const { toast } = useToast();

  const isAdmin = currentMembership?.role === 'ADMIN' || currentMembership?.role === 'TREASURER';

  const { data: chargesData, isLoading: chargesLoading } = useCharges(currentOrgId, { limit: 100 });
  const { data: expensesData, isLoading: expensesLoading } = useExpenses(currentOrgId, { limit: 100 });
  const { data: paymentsData, isLoading: paymentsLoading } = usePayments(currentOrgId, { limit: 100 });
  const { data: membersData } = useMembers(currentOrgId);
  const updateCharge = useUpdateCharge();
  const updateExpense = useUpdateExpense();
  const updatePayment = useUpdatePayment();
  const createCharge = useCreateCharge();
  const createExpense = useCreateExpense();
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
        allRows.push({
          id: charge.id,
          date: typeof charge.createdAt === 'string' ? charge.createdAt : new Date(charge.createdAt).toISOString(),
          type: 'charge',
          category: charge.category,
          description: charge.title,
          member: c.membership?.displayName || charge.membership?.name || charge.membership?.user?.name || undefined,
          membershipId: charge.membershipId,
          incomeCents: c.allocatedCents || 0,
          outstandingCents: c.balanceDueCents ?? charge.amountCents,
          expenseCents: 0,
          status: charge.status,
          allocatedCents: c.allocatedCents || 0,
        });
      }
    }

    // Add expenses (outgoing)
    if (expensesData?.data) {
      for (const expense of expensesData.data) {
        if (typeFilter !== 'all' && typeFilter !== 'expense') continue;
        const cleanedTitle = cleanExpenseTitle(expense.title);
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
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    setSelectedRows(new Set());
  }, [typeFilter, searchQuery, sortBy, sortOrder, pageSize]);

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
          <button
            onClick={() => deleteOneMember.mutate(
              { orgId: currentOrgId!, memberId: createdId },
              {
                onSuccess: () => toast({
                  title: `${name} removed`,
                  action: (
                    <button
                      onClick={() => restoreMember.mutate(
                        { orgId: currentOrgId!, memberId: createdId },
                        { onSuccess: () => toast({ title: `${name} restored` }) },
                      )}
                      className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      Redo
                    </button>
                  ),
                }),
                onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
              },
            )}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
          >
            Undo
          </button>
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

  const handleDeleteRow = async (row: SpreadsheetRow) => {
    if (!currentOrgId) return;

    try {
      if (row.type === 'charge') {
        await voidCharge.mutateAsync({ orgId: currentOrgId, chargeId: row.id });
        toast({
          title: 'Charge deleted',
          action: (
            <button
              onClick={() => restoreCharge.mutate(
                { orgId: currentOrgId, chargeId: row.id },
                {
                  onSuccess: () => toast({
                    title: 'Charge restored',
                    action: (
                      <button
                        onClick={() => voidCharge.mutate({ orgId: currentOrgId!, chargeId: row.id }, { onSuccess: () => toast({ title: 'Charge deleted' }) })}
                        className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        Redo
                      </button>
                    ),
                  }),
                },
              )}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
            >
              Undo
            </button>
          ),
        });
      } else if (row.type === 'expense') {
        await deleteExpense.mutateAsync({ orgId: currentOrgId, expenseId: row.id });
        toast({
          title: 'Expense deleted',
          action: (
            <button
              onClick={() => restoreExpense.mutate(
                { orgId: currentOrgId, expenseId: row.id },
                {
                  onSuccess: () => toast({
                    title: 'Expense restored',
                    action: (
                      <button
                        onClick={() => deleteExpense.mutate({ orgId: currentOrgId!, expenseId: row.id }, { onSuccess: () => toast({ title: 'Expense deleted' }) })}
                        className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        Redo
                      </button>
                    ),
                  }),
                },
              )}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
            >
              Undo
            </button>
          ),
        });
      } else if (row.type === 'payment') {
        await deletePayment.mutateAsync({ orgId: currentOrgId, paymentId: row.id });
        toast({
          title: 'Payment deleted',
          action: (
            <button
              onClick={() => restorePayment.mutate(
                { orgId: currentOrgId, paymentId: row.id },
                {
                  onSuccess: () => toast({
                    title: 'Payment restored',
                    action: (
                      <button
                        onClick={() => deletePayment.mutate({ orgId: currentOrgId!, paymentId: row.id }, { onSuccess: () => toast({ title: 'Payment deleted' }) })}
                        className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                      >
                        Redo
                      </button>
                    ),
                  }),
                },
              )}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
            >
              Undo
            </button>
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
          <button
            onClick={async () => {
              let redoneCount = 0;
              for (const item of deletedItems) {
                try {
                  if (item.type === 'charge') { await voidCharge.mutateAsync({ orgId: currentOrgId, chargeId: item.id }); redoneCount++; }
                  else if (item.type === 'expense') { await deleteExpense.mutateAsync({ orgId: currentOrgId, expenseId: item.id }); redoneCount++; }
                  else if (item.type === 'payment') { await deletePayment.mutateAsync({ orgId: currentOrgId, paymentId: item.id }); redoneCount++; }
                } catch { /* continue */ }
              }
              toast({ title: `Deleted ${redoneCount} item${redoneCount !== 1 ? 's' : ''}` });
            }}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
          >
            Redo
          </button>
        ),
      });
    };

    toast({
      title: `Deleted ${deletedItems.length} item${deletedItems.length !== 1 ? 's' : ''}`,
      action: (
        <button
          onClick={handleUndo}
          className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
        >
          Undo
        </button>
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
    const headers = ['Date', 'Type', 'Member/Vendor', 'Category', 'Description', 'Income', 'Outstanding', 'Expense'];
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

  return (
    <div className="space-y-6" data-tour="spreadsheet-view">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Spreadsheet"
          helpText={`Combined view of all charges, expenses, and payments in one place. ${isAdmin ? 'Click on any cell to edit values directly. Use the selection checkboxes to select multiple rows, then click the trash icon to delete. Sort by clicking column headers.' : 'View all your organization\'s financial transactions.'}`}
          actions={
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          }
        />
      </FadeIn>

      {/* Summary Cards */}
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

      {/* Filters */}
      <FadeIn delay={0.15}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40 bg-secondary/30 border-border/50">
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
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-secondary/30 border-border/50"
            />
          </div>
        </div>
      </FadeIn>

      {/* Pagination Controls - Top */}
      <FadeIn delay={0.2}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="w-[70px] h-8 bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {rows.length} total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[80px] text-center">
              {page} / {totalPages || 1}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
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
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground w-48 max-w-[12rem]">Description</th>
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
                {/* Add Row */}
                {isAdmin && !isLoading && (
                  <tr className="border-b border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <td className="pl-5 pr-2 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setShowAddDialog(true)}
                          className="w-7 h-7 flex items-center justify-center transition-colors hover:text-primary"
                          title="Add new row"
                        >
                          <Plus className="w-4 h-4 text-muted-foreground hover:text-primary" />
                        </button>
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
                      )}
                    >
                      {isAdmin && (
                        <td className="pl-5 pr-2 py-2">
                          <div className="flex items-center gap-1">
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
                          </div>
                        </td>
                      )}
                      <td className="px-5 py-3 w-28">
                        <EditableCell
                          value={row.date}
                          type="date"
                          isEditing={editingCell?.rowId === row.id && editingCell?.column === 'date'}
                          onEdit={() => setEditingCell({ rowId: row.id, column: 'date' })}
                          onSave={(v) => handleSaveCell(row, 'date', v)}
                          onCancel={() => setEditingCell(null)}
                          isAdmin={isAdmin}
                          rowType={row.type}
                          column="date"
                        />
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
                            isAdmin={isAdmin}
                            rowType={row.type}
                            column="category"
                          />
                        )}
                      </td>
                      <td className="px-5 py-3 w-48 max-w-[12rem]">
                        <EditableCell
                          value={row.description}
                          type="text"
                          isEditing={editingCell?.rowId === row.id && editingCell?.column === 'description'}
                          onEdit={() => setEditingCell({ rowId: row.id, column: 'description' })}
                          onSave={(v) => handleSaveCell(row, 'description', v)}
                          onCancel={() => setEditingCell(null)}
                          isAdmin={isAdmin}
                          rowType={row.type}
                          column="description"
                        />
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
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[80px] text-center">
              {page} of {totalPages || 1}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
              <div className="flex gap-2">
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
                  variant={newRowType === 'expense' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setNewRowType('expense')}
                  className="flex-1"
                >
                  <ArrowDownRight className="w-4 h-4 mr-1" />
                  Expense
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
              <Input
                type="date"
                value={newRowData.date}
                onChange={(e) => setNewRowData({ ...newRowData, date: e.target.value })}
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
              <Label>{newRowType === 'payment' ? 'Memo' : 'Description'}</Label>
              <Input
                value={newRowType === 'payment' ? newRowData.memo : newRowData.description}
                onChange={(e) =>
                  setNewRowData({
                    ...newRowData,
                    [newRowType === 'payment' ? 'memo' : 'description']: e.target.value,
                  })
                }
                placeholder={newRowType === 'payment' ? 'Payment note' : 'Description'}
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search payments..."
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
