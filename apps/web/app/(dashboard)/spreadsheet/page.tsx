'use client';

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { Table2, ArrowUpRight, ArrowDownRight, Download, Filter, Plus, DollarSign, Wallet, Search, Minus, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCharges, useUpdateCharge, useCreateCharge, useVoidCharge, useRestoreCharge } from '@/lib/queries/charges';
import { useExpenses, useUpdateExpense, useCreateExpense, useDeleteExpense } from '@/lib/queries/expenses';
import { usePayments, useUpdatePayment, useCreatePayment, useDeletePayment, useRestorePayment } from '@/lib/queries/payments';
import { useMembers } from '@/lib/queries/members';
import { useAuthStore } from '@/lib/stores/auth';
import { formatDate } from '@/lib/utils';
import {
  CHARGE_CATEGORIES,
  CHARGE_CATEGORY_LABELS,
  CHARGE_STATUS_LABELS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ChargeCategory,
  type ChargeStatus,
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
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface SpreadsheetRow {
  id: string;
  date: string;
  type: 'charge' | 'expense' | 'payment';
  category: string;
  description: string;
  member?: string;
  membershipId?: string;
  incomeCents: number;
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
  members?: Array<{ id: string; name: string | null; user?: { name: string | null } | null }>;
}) {
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

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

  if (isEditing) {
    if (type === 'category') {
      const categories = rowType === 'charge' ? CHARGE_CATEGORIES : EXPENSE_CATEGORIES;
      const labels = rowType === 'charge' ? CHARGE_CATEGORY_LABELS : EXPENSE_CATEGORY_LABELS;
      return (
        <Select
          value={editValue}
          onValueChange={(v) => {
            setEditValue(v);
            onSave(v);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-28 bg-transparent border-0 shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {labels[cat as keyof typeof labels]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (type === 'member' && members) {
      return (
        <Select
          value={editValue}
          onValueChange={(v) => {
            setEditValue(v);
            onSave(v);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-32 bg-transparent border-0 shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.displayName || m.name || m.user?.name || 'Unknown'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (type === 'date') {
      return (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="h-7 text-xs w-32 bg-transparent border-0 shadow-none focus-visible:ring-0"
          type="date"
        />
      );
    }

    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className={cn(
          'h-7 text-xs bg-transparent border-0 shadow-none focus-visible:ring-0',
          type === 'money' ? 'w-20 text-right' : 'w-full'
        )}
        type={type === 'money' ? 'number' : 'text'}
        step={type === 'money' ? '0.01' : undefined}
      />
    );
  }

  // Get display value for member type
  const getMemberDisplayValue = () => {
    if (type !== 'member' || !members || !value) return '-';
    const member = members.find((m) => m.id === value);
    return member?.displayName || member?.name || member?.user?.name || '-';
  };

  // Non-editing display
  if (!isAdmin) {
    if (type === 'date') {
      return <span className="text-muted-foreground">{formatDate(value as string)}</span>;
    }
    if (type === 'member') {
      return <span>{getMemberDisplayValue()}</span>;
    }
    return <span>{type === 'money' ? <Money cents={value as number} size="sm" /> : value}</span>;
  }

  return (
    <button
      onClick={onEdit}
      className="text-left hover:bg-secondary/50 px-1 py-0.5 rounded -mx-1 transition-colors cursor-pointer w-full"
      title="Click to edit"
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
        <span className="text-muted-foreground">{formatDate(value as string)}</span>
      ) : type === 'member' ? (
        <span className="font-medium">{getMemberDisplayValue()}</span>
      ) : (
        <span className="font-medium">{value || '-'}</span>
      )}
    </button>
  );
}

export default function SpreadsheetPage() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
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
  const deletePayment = useDeletePayment();
  const restorePayment = useRestorePayment();

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
        allRows.push({
          id: charge.id,
          date: typeof charge.createdAt === 'string' ? charge.createdAt : new Date(charge.createdAt).toISOString(),
          type: 'charge',
          category: charge.category,
          description: charge.title,
          member: charge.membership?.name || charge.membership?.user?.name || undefined,
          membershipId: charge.membershipId,
          incomeCents: charge.amountCents,
          expenseCents: 0,
          status: charge.status,
        });
      }
    }

    // Add expenses (outgoing)
    if (expensesData?.data) {
      for (const expense of expensesData.data) {
        if (typeFilter !== 'all' && typeFilter !== 'expense') continue;
        allRows.push({
          id: expense.id,
          date: typeof expense.date === 'string' ? expense.date : new Date(expense.date).toISOString(),
          type: 'expense',
          category: expense.category,
          description: expense.title,
          member: expense.vendor || undefined,
          incomeCents: 0,
          expenseCents: expense.amountCents,
        });
      }
    }

    // Add payments (income - actual money received)
    if (paymentsData?.data) {
      for (const payment of paymentsData.data) {
        if (typeFilter !== 'all' && typeFilter !== 'payment') continue;
        // Find member name from membershipId if available
        const paymentMember = payment.membershipId
          ? members.find(m => m.id === payment.membershipId)
          : null;
        const memberName = paymentMember?.name || paymentMember?.user?.name || payment.rawPayerName || undefined;
        allRows.push({
          id: payment.id,
          date: typeof payment.paidAt === 'string' ? payment.paidAt : new Date(payment.paidAt).toISOString(),
          type: 'payment',
          category: payment.source || 'manual',
          description: payment.memo || memberName || 'Payment',
          member: memberName,
          membershipId: payment.membershipId || undefined,
          incomeCents: payment.amountCents,
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
      if (sortBy === 'date') {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      } else {
        const amountA = a.incomeCents || a.expenseCents;
        const amountB = b.incomeCents || b.expenseCents;
        return sortOrder === 'asc' ? amountA - amountB : amountB - amountA;
      }
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
  }, [typeFilter, searchQuery, sortBy, sortOrder, pageSize]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalIncome = rows.reduce((sum, r) => sum + r.incomeCents, 0);
    const totalExpenses = rows.reduce((sum, r) => sum + r.expenseCents, 0);
    return {
      income: totalIncome,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
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
              onClick={() => restoreCharge.mutate({ orgId: currentOrgId, chargeId: row.id })}
              className="text-xs font-medium text-primary hover:underline"
            >
              Undo
            </button>
          ),
        });
      } else if (row.type === 'expense') {
        await deleteExpense.mutateAsync({ orgId: currentOrgId, expenseId: row.id });
        toast({ title: 'Expense deleted' });
      } else if (row.type === 'payment') {
        await deletePayment.mutateAsync({ orgId: currentOrgId, paymentId: row.id });
        toast({
          title: 'Payment deleted',
          action: (
            <button
              onClick={() => restorePayment.mutate({ orgId: currentOrgId, paymentId: row.id })}
              className="text-xs font-medium text-primary hover:underline"
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

  const handleExportCSV = () => {
    const headers = ['Date', 'Type', 'Category', 'Description', 'Member/Vendor', 'Income', 'Expense', 'Status'];
    const csvRows = [
      headers.join(','),
      ...rows.map((row) => [
        formatDate(row.date),
        row.type,
        row.type === 'charge'
          ? CHARGE_CATEGORY_LABELS[row.category as ChargeCategory] || row.category
          : EXPENSE_CATEGORY_LABELS[row.category as ExpenseCategory] || row.category,
        `"${row.description}"`,
        row.member || '',
        row.incomeCents ? (row.incomeCents / 100).toFixed(2) : '',
        row.expenseCents ? (row.expenseCents / 100).toFixed(2) : '',
        row.status || '',
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
    <div className="space-y-6">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shadow-lg">
              <Table2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Spreadsheet</h1>
              <p className="text-muted-foreground mt-1">
                Combined view of charges and expenses
                {isAdmin && <span className="text-primary ml-2">(Click cells to edit)</span>}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </FadeIn>

      {/* Summary Cards */}
      <FadeIn delay={0.1}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-success mb-2">
              <ArrowUpRight className="w-4 h-4" />
              <span className="text-sm font-medium">Total Income</span>
            </div>
            <Money cents={totals.income} size="lg" className="text-success" />
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
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-32 bg-secondary/30 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Sort by Date</SelectItem>
                <SelectItem value="amount">Sort by Amount</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {rows.length} total
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="w-20 h-8 bg-secondary/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
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
                  {isAdmin && <th className="w-10 px-2 py-3"></th>}
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Member/Vendor</th>
                  <th className="text-right px-4 py-3 pr-6 font-medium text-success">Income</th>
                  <th className="text-right px-4 py-3 pr-6 font-medium text-destructive">Expense</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Add Row */}
                {isAdmin && !isLoading && (
                  <tr className="border-b border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setShowAddDialog(true)}
                        className="w-7 h-7 flex items-center justify-center transition-colors hover:text-primary"
                        title="Add new row"
                      >
                        <Plus className="w-4 h-4 text-muted-foreground hover:text-primary" />
                      </button>
                    </td>
                    <td colSpan={8}></td>
                  </tr>
                )}
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {isAdmin && <td className="px-2 py-3"><Skeleton className="h-7 w-7" /></td>}
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                    </tr>
                  ))
                ) : paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 8} className="px-4 py-12 text-center text-muted-foreground">
                      No transactions found
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, index) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={cn(
                        'border-b border-border/50 hover:bg-secondary/30 transition-colors',
                        row.type === 'charge' && 'bg-success/5',
                        row.type === 'expense' && 'bg-destructive/5',
                        row.type === 'payment' && 'bg-success/5',
                      )}
                    >
                      {isAdmin && (
                        <td className="px-2 py-2">
                          <button
                            onClick={() => handleDeleteRow(row)}
                            className="w-7 h-7 flex items-center justify-center transition-colors hover:text-destructive"
                            title="Delete row"
                          >
                            <Minus className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </button>
                        </td>
                      )}
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            row.type === 'charge' && 'bg-success/10 text-success border-success/30',
                            row.type === 'expense' && 'bg-destructive/10 text-destructive border-destructive/30',
                            row.type === 'payment' && 'bg-success/10 text-success border-success/30',
                          )}
                        >
                          {row.type === 'charge' ? (
                            <ArrowUpRight className="w-3 h-3 mr-1" />
                          ) : row.type === 'expense' ? (
                            <ArrowDownRight className="w-3 h-3 mr-1" />
                          ) : (
                            <Wallet className="w-3 h-3 mr-1" />
                          )}
                          {row.type === 'charge' ? 'Charge' : row.type === 'expense' ? 'Expense' : 'Payment'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-right">
                        {row.incomeCents > 0 ? (
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
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
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
                      <td className="px-4 py-3">
                        {row.status && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              row.status === 'PAID' && 'bg-success/10 text-success border-success/30',
                              row.status === 'OPEN' && 'bg-warning/10 text-warning border-warning/30',
                              row.status === 'PARTIALLY_PAID' && 'bg-blue-500/10 text-blue-400 border-blue-500/30',
                              row.status === 'VOID' && 'bg-muted text-muted-foreground',
                            )}
                          >
                            {CHARGE_STATUS_LABELS[row.status as ChargeStatus] || row.status}
                          </Badge>
                        )}
                        {row.type === 'payment' && row.unallocatedCents !== undefined && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              row.unallocatedCents > 0 && 'bg-warning/10 text-warning border-warning/30',
                              row.unallocatedCents === 0 && 'bg-success/10 text-success border-success/30',
                            )}
                          >
                            {row.unallocatedCents > 0 ? 'Unallocated' : 'Allocated'}
                          </Badge>
                        )}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
              {/* Totals Row */}
              {!isLoading && rows.length > 0 && (
                <tfoot>
                  <tr className="bg-secondary/50 font-medium">
                    <td className="px-4 py-3" colSpan={isAdmin ? 6 : 5}>
                      <span className="text-muted-foreground">Total ({rows.length} transactions)</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money cents={totals.income} size="sm" className="text-success font-semibold" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Money cents={totals.expenses} size="sm" className="text-destructive font-semibold" />
                    </td>
                    <td className="px-4 py-3"></td>
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
                    {members.map((m) => (
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
                    {members.map((m) => (
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
    </div>
  );
}
