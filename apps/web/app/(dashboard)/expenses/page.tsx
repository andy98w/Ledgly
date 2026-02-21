'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Receipt, TrendingDown, Pencil, Trash2, MoreHorizontal, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useExpenses, useExpenseSummary, useDeleteExpense, useCreateExpense } from '@/lib/queries/expenses';
import { useAuthStore } from '@/lib/stores/auth';
import { formatDate, parseCents } from '@/lib/utils';
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
import { Money } from '@/components/ui/money';
import { StatCard } from '@/components/ui/stat-card';
import { MotionCard, MotionCardContent } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';

const categoryColors: Record<string, string> = {
  EVENT: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  SUPPLIES: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  FOOD: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  VENUE: 'bg-green-500/10 text-green-400 border-green-500/30',
  MARKETING: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  SERVICES: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  OTHER: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

function ExpenseCard({
  expense,
  onDelete,
  isAdmin = false,
}: {
  expense: any;
  onDelete: (expense: any) => void;
  isAdmin?: boolean;
}) {
  return (
    <StaggerItem>
      <MotionCard>
        <MotionCardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-destructive" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{expense.title}</p>
                  <Badge
                    variant="outline"
                    className={categoryColors[expense.category] || categoryColors.OTHER}
                  >
                    {EXPENSE_CATEGORY_LABELS[expense.category as ExpenseCategory] || expense.category}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatDate(expense.date)}</span>
                  {expense.vendor && (
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
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/expenses/${expense.id}/edit`}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Link>
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
              )}
            </div>
          </div>
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
}

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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newExpenseData, setNewExpenseData] = useState({
    category: 'OTHER' as ExpenseCategory,
    title: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    vendor: '',
  });

  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const user = useAuthStore((s) => s.user);
  const currentMembership = user?.memberships.find((m) => m.orgId === currentOrgId);
  const isAdmin = currentMembership?.role === 'ADMIN' || currentMembership?.role === 'TREASURER';
  const { toast } = useToast();
  const { data, isLoading } = useExpenses(currentOrgId, {
    category: categoryFilter !== 'all' ? categoryFilter : undefined,
  });
  const { data: summary } = useExpenseSummary(currentOrgId);
  const deleteExpense = useDeleteExpense();
  const createExpense = useCreateExpense();

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
      await createExpense.mutateAsync({
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

      toast({ title: 'Expense created successfully' });
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

  const handleDelete = (expense: any) => {
    setDeletingExpense(expense);
  };

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <FadeIn>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
            <p className="text-muted-foreground mt-1">Track organization spending</p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-gradient-to-r from-primary to-blue-400 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Expense
          </Button>
        </div>
      </FadeIn>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Expenses"
          value={summary?.totalCents || 0}
          isMoney
          description={`${summary?.count || 0} expenses`}
          icon={TrendingDown}
          delay={0}
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
        />
        <StatCard
          title="This Month"
          value={summary?.totalCents || 0}
          isMoney
          description="Current period"
          icon={Receipt}
          delay={0.2}
        />
      </div>

      {/* Filter and Search */}
      <FadeIn delay={0.2}>
        <div className="flex items-center justify-between gap-4">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48 bg-secondary/30 border-border/50">
              <SelectValue placeholder="Filter by category" />
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
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-secondary/30 border-border/50"
            />
          </div>
        </div>
      </FadeIn>

      {/* Pagination Controls - Top */}
      {!isLoading && expenses.length > 0 && (
        <FadeIn delay={0.25}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show</span>
              <Select value={String(pageSize)} onValueChange={(v) => handlePageSizeChange(Number(v))}>
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
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
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
      )}

      {/* Expenses List */}
      {isLoading ? (
        <div className="space-y-3">
          <ExpenseCardSkeleton />
          <ExpenseCardSkeleton />
          <ExpenseCardSkeleton />
        </div>
      ) : expenses.length === 0 ? (
        <FadeIn delay={0.3}>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-border/50 bg-card/50 py-16 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Receipt className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No expenses yet</h3>
            <p className="text-muted-foreground mb-6">
              Start tracking your organization&apos;s spending
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-gradient-to-r from-primary to-blue-400"
            >
              Add your first expense
            </Button>
          </motion.div>
        </FadeIn>
      ) : (
        <>
          <StaggerChildren className="space-y-3">
            {paginatedExpenses.map((expense) => (
              <ExpenseCard key={expense.id} expense={expense} onDelete={handleDelete} isAdmin={isAdmin} />
            ))}
          </StaggerChildren>

          {/* Pagination Controls - Bottom */}
          {expenses.length > pageSize && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                {page} / {totalPages}
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
                <Input
                  type="date"
                  value={newExpenseData.date}
                  onChange={(e) => setNewExpenseData({ ...newExpenseData, date: e.target.value })}
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
              className="bg-gradient-to-r from-primary to-blue-400"
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
    </div>
  );
}
