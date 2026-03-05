'use client';

import { useState, useMemo, useEffect, useCallback, memo } from 'react';

import { Plus, Receipt, TrendingDown, Trash2, MoreHorizontal, Loader2, Search, Pencil, Circle, CheckCircle2, Upload, MoreVertical, FileSpreadsheet, FileText } from 'lucide-react';
import { useExpenses, useExpenseSummary, useDeleteExpense, useCreateExpense, useUpdateExpense, useRestoreExpense, useBulkDeleteExpenses } from '@/lib/queries/expenses';

/** Strip "VENMO payment to " etc. prefixes from Gmail-imported expense titles */
function cleanExpenseTitle(title: string): string {
  const match = title.match(/^[A-Z]+ payment to (.+)$/);
  return match ? match[1] : title;
}
import { useAuthStore, useIsAdminOrTreasurer } from '@/lib/stores/auth';
import { cn, formatDate, parseCents } from '@/lib/utils';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@ledgly/shared';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Money } from '@/components/ui/money';
import { StatCard } from '@/components/ui/stat-card';
import { MotionCard, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn } from '@/components/ui/page-transition';
import { AnimatedList } from '@/components/ui/animated-list';
import { PageHeader } from '@/components/ui/page-header';
import { ToastUndoButton } from '@/components/ui/toast-undo-button';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { BatchActionsBar } from '@/components/ui/batch-actions-bar';
import { ExportDropdown } from '@/components/export-dropdown';
import { CSVImportDialog, type ImportField } from '@/components/import/csv-import-dialog';
import { exportCSV, exportPDF } from '@/lib/export';
import { ExpenseGroupCard } from '@/components/expenses/expense-group-card';

const EXPENSE_IMPORT_FIELDS: ImportField[] = [
  { key: 'title', label: 'Title', required: true, aliases: ['name', 'expense', 'description'] },
  { key: 'amount', label: 'Amount', required: true, aliases: ['cost', 'price', 'total'] },
  { key: 'date', label: 'Date', required: true, aliases: ['expense date', 'paid date'] },
  { key: 'category', label: 'Category', required: false, aliases: ['type', 'expense type'] },
  { key: 'vendor', label: 'Vendor', required: false, aliases: ['payee', 'paid to', 'store'] },
  { key: 'description', label: 'Description', required: false, aliases: ['notes', 'memo', 'details'] },
];

const categoryColors: Record<string, string> = {
  EVENT: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  SUPPLIES: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  FOOD: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  VENUE: 'bg-green-500/10 text-green-400 border-green-500/30',
  MARKETING: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  SERVICES: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  OTHER: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

const ExpenseCard = memo(function ExpenseCard({
  expense,
  onEdit,
  onDelete,
  isAdmin = false,
  isSelected = false,
  onToggleSelect,
}: {
  expense: any;
  onEdit: (expense: any) => void;
  onDelete: (expense: any) => void;
  isAdmin?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  return (
    <MotionCard>
      <MotionCardContent className="p-4">
        <div className="flex items-center justify-between">
          {isAdmin && onToggleSelect && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect();
                }}
                className="mr-3 flex items-center justify-center transition-colors"
                aria-label={isSelected ? "Deselect expense" : "Select expense"}
                aria-pressed={isSelected}
              >
                {isSelected ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                )}
              </button>
            )}
            <div className="flex items-center gap-4 flex-1">
              <AvatarGradient
                name={expense.vendor || cleanExpenseTitle(expense.title)}
                size="sm"
              />
              <div className="min-w-0 space-y-1 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-medium truncate" title={cleanExpenseTitle(expense.title)}>{cleanExpenseTitle(expense.title)}</p>
                  <Badge
                    variant="outline"
                    className={categoryColors[expense.category] || categoryColors.OTHER}
                  >
                    {EXPENSE_CATEGORY_LABELS[expense.category as ExpenseCategory] || expense.category}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatDate(expense.date)}</span>
                  {expense.vendor && expense.vendor !== cleanExpenseTitle(expense.title) && expense.vendor !== expense.title && (
                    <>
                      <span className="opacity-30">•</span>
                      <span>{expense.vendor}</span>
                    </>
                  )}
                  {expense.description && (
                    <>
                      <span className="opacity-30">•</span>
                      <span className="truncate max-w-[200px]">{expense.description}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Money cents={expense.amountCents} size="sm" className="text-destructive" />
              {isAdmin ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Expense actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(expense)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(expense)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="w-8 h-8" />
              )}
            </div>
          </div>
        </MotionCardContent>
      </MotionCard>
  );
});

function ExpenseCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
    </div>
  );
}

export default function ExpensesPage() {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [deletingExpense, setDeletingExpense] = useState<any | null>(null);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newExpenseData, setNewExpenseData] = useState({
    category: 'OTHER' as ExpenseCategory,
    title: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    vendor: '',
  });
  const [editExpenseData, setEditExpenseData] = useState({
    category: 'OTHER' as ExpenseCategory,
    title: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    vendor: '',
  });

  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const isAdmin = useIsAdminOrTreasurer();
  const { toast } = useToast();
  const { data, isLoading } = useExpenses(currentOrgId, {
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
  });
  const { data: summary } = useExpenseSummary(currentOrgId);
  const startOfMonth = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  }, []);
  const { data: monthlySummary } = useExpenseSummary(currentOrgId, startOfMonth);
  const deleteExpense = useDeleteExpense();
  const restoreExpense = useRestoreExpense();
  const bulkDeleteExpenses = useBulkDeleteExpenses();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);

  const handleImportExpenses = async (records: Record<string, string>[]) => {
    if (!currentOrgId) throw new Error('No org selected');
    let success = 0;
    let errors = 0;
    for (const record of records) {
      if (!record.title?.trim() || !record.amount?.trim()) { errors++; continue; }
      const amountStr = record.amount.replace(/[$,]/g, '');
      const amountCents = Math.round(parseFloat(amountStr) * 100);
      if (isNaN(amountCents) || amountCents <= 0) { errors++; continue; }
      const validCategories = ['EVENT', 'SUPPLIES', 'FOOD', 'VENUE', 'MARKETING', 'SERVICES', 'OTHER'];
      const category = validCategories.includes(record.category?.toUpperCase() || '') ? record.category!.toUpperCase() : 'OTHER';
      try {
        await createExpense.mutateAsync({
          orgId: currentOrgId,
          data: {
            title: record.title.trim(),
            category,
            amountCents,
            date: record.date?.trim() || new Date().toISOString().split('T')[0],
            vendor: record.vendor?.trim() || undefined,
            description: record.description?.trim() || undefined,
          },
        });
        success++;
      } catch { errors++; }
    }
    return { success, errors };
  };

  const resetCreateDialog = () => {
    setShowCreateDialog(false);
    setNewExpenseData({
      category: 'OTHER',
      title: '',
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      vendor: '',
    });
  };

  const handleEdit = useCallback((expense: any) => {
    setEditingExpense(expense);
    setEditExpenseData({
      category: expense.category,
      title: expense.title,
      description: expense.description || '',
      amount: (expense.amountCents / 100).toFixed(2),
      date: expense.date.split('T')[0],
      vendor: expense.vendor || '',
    });
  }, []);

  const resetEditDialog = () => {
    setEditingExpense(null);
    setEditExpenseData({
      category: 'OTHER',
      title: '',
      description: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      vendor: '',
    });
  };

  const handleUpdateExpense = async () => {
    if (!currentOrgId || !editingExpense) return;

    if (!editExpenseData.title.trim()) {
      toast({ title: 'Please enter a title', variant: 'destructive' });
      return;
    }
    if (!editExpenseData.amount) {
      toast({ title: 'Please enter an amount', variant: 'destructive' });
      return;
    }

    // Store original data for undo
    const originalExpense = { ...editingExpense };

    try {
      await updateExpense.mutateAsync({
        orgId: currentOrgId,
        expenseId: editingExpense.id,
        data: {
          category: editExpenseData.category,
          title: editExpenseData.title,
          description: editExpenseData.description || undefined,
          amountCents: parseCents(editExpenseData.amount),
          date: editExpenseData.date,
          vendor: editExpenseData.vendor || undefined,
        },
      });

      toast({
        title: 'Expense updated',
        action: (
          <ToastUndoButton
            onClick={async () => {
              const redoData = {
                category: editExpenseData.category,
                title: editExpenseData.title,
                description: editExpenseData.description || undefined,
                amountCents: parseCents(editExpenseData.amount),
                date: editExpenseData.date,
                vendor: editExpenseData.vendor || undefined,
              };
              try {
                await updateExpense.mutateAsync({
                  orgId: currentOrgId,
                  expenseId: originalExpense.id,
                  data: {
                    category: originalExpense.category,
                    title: originalExpense.title,
                    description: originalExpense.description || undefined,
                    amountCents: originalExpense.amountCents,
                    date: originalExpense.date.split('T')[0],
                    vendor: originalExpense.vendor || undefined,
                  },
                });
                toast({
                  title: 'Expense restored',
                  action: (
                    <ToastUndoButton
                      onClick={() => updateExpense.mutate(
                        { orgId: currentOrgId!, expenseId: originalExpense.id, data: redoData },
                        { onSuccess: () => toast({ title: 'Expense updated' }) },
                      )}
                      label="Redo"
                    />
                  ),
                });
              } catch (error) {
                toast({ title: 'Failed to restore', variant: 'destructive' });
              }
            }}
          />
        ),
      });
      resetEditDialog();
    } catch (error: any) {
      toast({
        title: 'Error updating expense',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const handleCreateExpense = async () => {
    if (!currentOrgId) return;

    if (!newExpenseData.title.trim()) {
      toast({ title: 'Please enter a title', variant: 'destructive' });
      return;
    }
    if (!newExpenseData.amount) {
      toast({ title: 'Please enter an amount', variant: 'destructive' });
      return;
    }

    try {
      const created: any = await createExpense.mutateAsync({
        orgId: currentOrgId,
        data: {
          category: newExpenseData.category,
          title: newExpenseData.title,
          description: newExpenseData.description || undefined,
          amountCents: parseCents(newExpenseData.amount),
          date: newExpenseData.date,
          vendor: newExpenseData.vendor || undefined,
        },
      });

      const createdId = created?.id;
      toast({
        title: 'Expense created',
        action: createdId ? (
          <ToastUndoButton
            onClick={() => deleteExpense.mutate(
              { orgId: currentOrgId!, expenseId: createdId },
              {
                onSuccess: () => toast({
                  title: 'Expense deleted',
                  action: (
                    <ToastUndoButton
                      onClick={() => restoreExpense.mutate(
                        { orgId: currentOrgId!, expenseId: createdId },
                        { onSuccess: () => toast({ title: 'Expense restored' }) },
                      )}
                      label="Redo"
                    />
                  ),
                }),
                onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
              },
            )}
          />
        ) : undefined,
      });
      resetCreateDialog();
    } catch (error: any) {
      toast({
        title: 'Error creating expense',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    }
  };

  const expenses = useMemo(() => {
    const allExpenses = data?.data || [];
    if (!searchQuery.trim()) return allExpenses;

    const query = searchQuery.toLowerCase();
    return allExpenses.filter((expense) =>
      expense.title?.toLowerCase().includes(query) ||
      expense.vendor?.toLowerCase().includes(query) ||
      expense.description?.toLowerCase().includes(query)
    );
  }, [data?.data, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(expenses.length / pageSize);
  const paginatedExpenses = useMemo(() => {
    const start = (page - 1) * pageSize;
    return expenses.slice(start, start + pageSize);
  }, [expenses, page, pageSize]);

  // Reset to page 1 when filters change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  // Reset page when filters or search changes
  useEffect(() => {
    setPage(1);
  }, [categoryFilter, searchQuery]);

  const handleDelete = useCallback((expense: any) => {
    setDeletingExpense(expense);
  }, []);

  const handleConfirmDelete = () => {
    if (!deletingExpense || !currentOrgId) return;

    deleteExpense.mutate(
      { orgId: currentOrgId, expenseId: deletingExpense.id },
      {
        onSuccess: () => {
          toast({ title: 'Expense deleted' });
          setDeletingExpense(null);
        },
        onError: (error: any) => {
          toast({
            title: 'Error deleting expense',
            description: error.message || 'Please try again',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const toggleExpenseSelection = (expenseId: string) => {
    setSelectedExpenses((prev) => {
      const next = new Set(prev);
      if (next.has(expenseId)) {
        next.delete(expenseId);
      } else {
        next.add(expenseId);
      }
      return next;
    });
  };

  const toggleSelectAllExpenses = () => {
    if (selectedExpenses.size === paginatedExpenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(paginatedExpenses.map((e) => e.id)));
    }
  };

  const isAllExpensesSelected = paginatedExpenses.length > 0 && selectedExpenses.size === paginatedExpenses.length;

  const handleBulkDeleteExpenses = async () => {
    if (!currentOrgId || selectedExpenses.size === 0) return;

    const expenseIds = Array.from(selectedExpenses);

    try {
      const result = await bulkDeleteExpenses.mutateAsync({ orgId: currentOrgId, expenseIds });
      const deletedCount = result.deletedCount;
      setSelectedExpenses(new Set());

      toast({
        title: `Deleted ${deletedCount} expense${deletedCount !== 1 ? 's' : ''}`,
        action: (
          <ToastUndoButton
            onClick={async () => {
              let restoredCount = 0;
              for (const expenseId of expenseIds) {
                try { await restoreExpense.mutateAsync({ orgId: currentOrgId, expenseId }); restoredCount++; } catch { /* continue */ }
              }
              toast({
                title: `Restored ${restoredCount} expense${restoredCount !== 1 ? 's' : ''}`,
                action: (
                  <ToastUndoButton
                    onClick={async () => {
                      const redoResult = await bulkDeleteExpenses.mutateAsync({ orgId: currentOrgId, expenseIds });
                      toast({ title: `Deleted ${redoResult.deletedCount} expense${redoResult.deletedCount !== 1 ? 's' : ''}` });
                    }}
                    label="Redo"
                  />
                ),
              });
            }}
          />
        ),
      });
    } catch {
      setSelectedExpenses(new Set());
    }
  };

  // Reset selection when filters change
  useEffect(() => {
    setSelectedExpenses(new Set());
  }, [categoryFilter, searchQuery, page]);

  const handleExportExpenses = (format: 'csv' | 'pdf') => {
    const headers = ['Title', 'Category', 'Amount', 'Date', 'Vendor', 'Description'];
    const rows = expenses.map((e: any) => [
      e.title,
      EXPENSE_CATEGORY_LABELS[e.category as ExpenseCategory] || e.category,
      `$${(e.amountCents / 100).toFixed(2)}`,
      e.date ? new Date(e.date).toLocaleDateString() : '',
      e.vendor || '',
      e.description || '',
    ]);
    const filename = `expenses-${new Date().toISOString().split('T')[0]}`;
    if (format === 'csv') exportCSV(headers, rows, filename);
    else exportPDF('Expenses', headers, rows, filename);
  };

  return (
    <div className="space-y-8" data-tour="expenses-list">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Expenses"
          helpText="Track organization spending by category. Expenses are automatically imported from outgoing Venmo/Zelle payments."
          actions={
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={() => setShowCreateDialog(true)}
                  className="hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add Expense
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
                    <DropdownMenuItem onClick={() => setShowImport(true)} className="cursor-pointer">
                      <Upload className="w-4 h-4 mr-2" />
                      Import CSV
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => handleExportExpenses('csv')} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportExpenses('pdf')} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Export PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />
      </FadeIn>

      {/* Stats */}
      {(summary?.count || 0) > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            title="Total Expenses"
            value={summary?.totalCents || 0}
            isMoney
            description={`${summary?.count || 0} expenses`}
            icon={TrendingDown}
            delay={0}
            color="rose"
          />
          <StatCard
            title="Largest Category"
            value={
              summary?.byCategory
                ? Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1])[0]?.[1] || 0
                : 0
            }
            isMoney
            description={
              summary?.byCategory
                ? EXPENSE_CATEGORY_LABELS[
                    Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] as ExpenseCategory
                  ] || 'None'
                : 'None'
            }
            icon={Receipt}
            delay={0.1}
            color="amber"
          />
          <StatCard
            title="This Month"
            value={monthlySummary?.totalCents || 0}
            isMoney
            description="Current period"
            icon={Receipt}
            delay={0.2}
            color="violet"
          />
        </div>
      )}

      {/* Search + Filter */}
      <FadeIn delay={0.2}>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search expenses..."
              aria-label="Search expenses"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-secondary/30 border-border/50"
            />
          </div>
          <div className="flex gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px] h-8 bg-secondary/30 border-border/50 text-xs">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="EVENT">Event</SelectItem>
                <SelectItem value="SUPPLIES">Supplies</SelectItem>
                <SelectItem value="FOOD">Food & Drinks</SelectItem>
                <SelectItem value="VENUE">Venue</SelectItem>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="SERVICES">Services</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FadeIn>

      {/* Expenses List */}
      {isLoading ? (
        <div className="space-y-3">
          <ExpenseCardSkeleton />
          <ExpenseCardSkeleton />
          <ExpenseCardSkeleton />
        </div>
      ) : expenses.length === 0 ? (
        <FadeIn delay={0.3}>
          <EmptyState
            icon={Receipt}
            title="No expenses found"
            description="Start tracking your organization's spending"
            action={isAdmin && (
              <Button onClick={() => setShowCreateDialog(true)}>
                Add your first expense
              </Button>
            )}
            className="rounded-xl border border-border/50 bg-card/50"
          />
        </FadeIn>
      ) : (
        <>
          <div className="space-y-3">
            {/* Select All Row */}
            {isAdmin && paginatedExpenses.length > 0 && (
              <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 flex items-center justify-between">
                <button
                  onClick={toggleSelectAllExpenses}
                  className="flex items-center gap-3 transition-colors"
                  title={isAllExpensesSelected ? "Deselect all" : "Select all"}
                >
                  {isAllExpensesSelected ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {isAllExpensesSelected ? 'Deselect all' : 'Select all'}
                  </span>
                </button>
                <button
                  onClick={handleBulkDeleteExpenses}
                  className={cn(
                    "w-7 h-7 flex items-center justify-center transition-all hover:text-destructive",
                    selectedExpenses.size === 0 && "invisible"
                  )}
                  title={`Delete ${selectedExpenses.size} selected`}
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            )}
            <AnimatedList
              items={paginatedExpenses}
              getKey={(e) => e.id}
              className="space-y-3"
              renderItem={(expense) =>
                expense.children && expense.children.length > 0 ? (
                  <ExpenseGroupCard
                    expense={expense}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    isAdmin={isAdmin}
                    isSelected={selectedExpenses.has(expense.id)}
                    onToggleSelect={() => toggleExpenseSelection(expense.id)}
                  />
                ) : (
                  <ExpenseCard
                    expense={expense}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    isAdmin={isAdmin}
                    isSelected={selectedExpenses.has(expense.id)}
                    onToggleSelect={() => toggleExpenseSelection(expense.id)}
                  />
                )
              }
            />
          </div>

          {/* Pagination Controls - Bottom */}
          {expenses.length > pageSize && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="justify-center pt-4" />
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingExpense} onOpenChange={(open) => !open && setDeletingExpense(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingExpense && (
            <div className="py-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="font-medium">{deletingExpense.title}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(deletingExpense.date)} •{' '}
                  <Money cents={deletingExpense.amountCents} size="xs" inline />
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingExpense(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteExpense.isPending}
            >
              {deleteExpense.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Expense'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Expense Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => !open && resetCreateDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>
              Track organization spending
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={newExpenseData.category}
                  onValueChange={(v) => setNewExpenseData({ ...newExpenseData, category: v as ExpenseCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker
                  value={newExpenseData.date}
                  onChange={(date) => setNewExpenseData({ ...newExpenseData, date })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., Event supplies"
                value={newExpenseData.title}
                onChange={(e) => setNewExpenseData({ ...newExpenseData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Additional details..."
                value={newExpenseData.description}
                onChange={(e) => setNewExpenseData({ ...newExpenseData, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={newExpenseData.amount}
                  onChange={(e) => setNewExpenseData({ ...newExpenseData, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor (optional)</Label>
                <Input
                  placeholder="e.g., Amazon"
                  value={newExpenseData.vendor}
                  onChange={(e) => setNewExpenseData({ ...newExpenseData, vendor: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetCreateDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateExpense}
              disabled={createExpense.isPending}
             
            >
              {createExpense.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Add Expense'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && resetEditDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
            <DialogDescription>
              Update expense details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editExpenseData.category}
                  onValueChange={(v) => setEditExpenseData({ ...editExpenseData, category: v as ExpenseCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker
                  value={editExpenseData.date}
                  onChange={(date) => setEditExpenseData({ ...editExpenseData, date })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., Event supplies"
                value={editExpenseData.title}
                onChange={(e) => setEditExpenseData({ ...editExpenseData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Additional details..."
                value={editExpenseData.description}
                onChange={(e) => setEditExpenseData({ ...editExpenseData, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={editExpenseData.amount}
                  onChange={(e) => setEditExpenseData({ ...editExpenseData, amount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor (optional)</Label>
                <Input
                  placeholder="e.g., Amazon"
                  value={editExpenseData.vendor}
                  onChange={(e) => setEditExpenseData({ ...editExpenseData, vendor: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetEditDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateExpense}
              disabled={updateExpense.isPending}
             
            >
              {updateExpense.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BatchActionsBar selectedCount={selectedExpenses.size} onClear={() => setSelectedExpenses(new Set())}>
        <Button variant="destructive" size="sm" onClick={handleBulkDeleteExpenses} className="h-8">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
          Delete
        </Button>
      </BatchActionsBar>

      <CSVImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        title="Import Expenses"
        description="Upload a CSV file to bulk import expenses"
        fields={EXPENSE_IMPORT_FIELDS}
        onImport={handleImportExpenses}
      />
    </div>
  );
}
