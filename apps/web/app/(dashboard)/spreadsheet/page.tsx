'use client';

import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { ArrowUpRight, ArrowDownRight, Download, Upload, Filter, Plus, DollarSign, AlertCircle, Search, Minus, ArrowUp, ArrowDown, Trash2, Check, Link2, Loader2, CreditCard, MoreVertical, FileSpreadsheet, ChevronDown, ChevronRight, Layers, Sparkles, Ban, Zap, Columns3, Copy, Calendar, Tag } from 'lucide-react';
import { useCharges, useUpdateCharge, useCreateCharge, useCreateMultiCharge, useVoidCharge, useRestoreCharge, useBulkCreateCharges } from '@/lib/queries/charges';
import { useExpenses, useUpdateExpense, useCreateExpense, useCreateMultiExpense, useDeleteExpense, useRestoreExpense } from '@/lib/queries/expenses';
import { usePayments, useUpdatePayment, useCreatePayment, useDeletePayment, useRestorePayment, useAllocatePayment, useAutoAllocateToCharge, useBulkAutoAllocate, useBulkCreatePayments } from '@/lib/queries/payments';
import { useMembers } from '@/lib/queries/members';
import { useAuthStore, useIsAdminOrTreasurer, useCurrentMembership } from '@/lib/stores/auth';
import { formatDate } from '@/lib/utils';
import { useColumnConfig, COLUMN_DEFS } from '@/hooks/use-column-config';
import { useColumnResize } from '@/hooks/use-column-resize';
import { useColumnReorder } from '@/hooks/use-column-reorder';
import { useSpreadsheetKeyboard } from '@/hooks/use-spreadsheet-keyboard';
import { useSpreadsheetSort } from '@/hooks/use-spreadsheet-sort';
import { useColumnFilters, type ColumnFilter } from '@/hooks/use-column-filters';
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
import { usePageKeyboard } from '@/hooks/use-page-keyboard';
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useSpreadsheetContextStore } from '@/lib/stores/spreadsheet-context';
import { useAISidebarStore } from '@/lib/stores/ai-sidebar';
import { computeInsights, type RowInsight } from '@/lib/utils/spreadsheet-insights';
import { getRowActions, type RowAction } from '@/lib/utils/row-actions';
import { InsightsBanner } from '@/components/spreadsheet/insights-banner';
import { FormulaBar } from '@/components/spreadsheet/formula-bar';
import { AllocatePaymentsDialog } from '@/components/spreadsheet/allocate-dialog';
import { EditableCell, formatShortDate } from '@/components/spreadsheet/editable-cell';
import { parseNaturalAmount } from '@/lib/utils/natural-language';
import type { SpreadsheetQueryResult } from '@/lib/queries/agent';

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
  dueCents: number;
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
  isUnallocated?: boolean;
}

type EditingCell = {
  rowId: string;
  column: 'description' | 'category' | 'amount' | 'date' | 'member';
} | null;

function ColumnFilterPopover({ columnId, filter, onSetFilter, allCategories }: {
  columnId: string;
  filter: ColumnFilter | null;
  onSetFilter: (f: ColumnFilter | null) => void;
  allCategories?: string[];
}) {
  const hasFilter = filter !== null;

  const renderFilterUI = () => {
    switch (columnId) {
      case 'date': {
        const current = filter?.type === 'text' ? filter.value : '';
        const [from, to] = current.includes('|') ? current.split('|') : ['', ''];
        return (
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">From</label>
            <input type="date" value={from} onChange={(e) => {
              const nf = e.target.value;
              const val = [nf, to].filter(Boolean).join('|');
              onSetFilter(val ? { type: 'text', value: val } : null);
            }} className="w-full h-7 text-xs bg-secondary/30 border border-border/50 rounded px-2" />
            <label className="text-[11px] font-medium text-muted-foreground">To</label>
            <input type="date" value={to} onChange={(e) => {
              const nt = e.target.value;
              const val = [from, nt].filter(Boolean).join('|');
              onSetFilter(val ? { type: 'text', value: val } : null);
            }} className="w-full h-7 text-xs bg-secondary/30 border border-border/50 rounded px-2" />
          </div>
        );
      }
      case 'member':
      case 'description':
        return (
          <Input placeholder={`Filter ${columnId}...`} value={filter?.type === 'text' ? filter.value : ''} onChange={(e) => {
            const v = e.target.value;
            onSetFilter(v ? { type: 'text', value: v } : null);
          }} className="h-7 text-xs" autoFocus />
        );
      case 'category': {
        const selected = filter?.type === 'select' ? filter.values : [];
        return (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {(allCategories || []).map((cat) => {
              const isChecked = selected.includes(cat);
              const label = CHARGE_CATEGORY_LABELS[cat as ChargeCategory] || EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] || cat;
              return (
                <label key={cat} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-secondary/50 cursor-pointer text-xs">
                  <input type="checkbox" checked={isChecked} onChange={() => {
                    const next = isChecked ? selected.filter((s) => s !== cat) : [...selected, cat];
                    onSetFilter(next.length > 0 ? { type: 'select', values: next } : null);
                  }} className="rounded border-border" />
                  {label}
                </label>
              );
            })}
          </div>
        );
      }
      case 'income':
      case 'expense': {
        const min = filter?.type === 'range' ? filter.min : undefined;
        const max = filter?.type === 'range' ? filter.max : undefined;
        return (
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">Min ($)</label>
            <input type="number" step="0.01" placeholder="0.00" value={min !== undefined ? min / 100 : ''} onChange={(e) => {
              const v = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined;
              if (v === undefined && max === undefined) { onSetFilter(null); return; }
              onSetFilter({ type: 'range', min: v, max });
            }} className="w-full h-7 text-xs bg-secondary/30 border border-border/50 rounded px-2" />
            <label className="text-[11px] font-medium text-muted-foreground">Max ($)</label>
            <input type="number" step="0.01" placeholder="0.00" value={max !== undefined ? max / 100 : ''} onChange={(e) => {
              const v = e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined;
              if (v === undefined && min === undefined) { onSetFilter(null); return; }
              onSetFilter({ type: 'range', min, max: v });
            }} className="w-full h-7 text-xs bg-secondary/30 border border-border/50 rounded px-2" />
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} className={cn(
          'p-0.5 rounded transition-colors',
          hasFilter ? 'text-primary' : 'text-muted-foreground/0 group-hover/header:text-muted-foreground/50 hover:text-muted-foreground',
        )}>
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Filter</span>
            {hasFilter && (
              <button onClick={() => onSetFilter(null)} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Clear
              </button>
            )}
          </div>
          {renderFilterUI()}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function SpreadsheetPage() {
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set(['charge', 'expense']));
  const [searchQuery, setSearchQuery] = useState('');
  const { sortSpecs, toggleSort, getSortIndex, getSortDirection } = useSpreadsheetSort();
  const { filters: columnFilters, setFilter: setColumnFilter, clearAll: clearAllFilters, activeFilterCount, matchesFilters } = useColumnFilters();
  const [formulaCategories, setFormulaCategories] = useState<string[] | null>(null);
  const [formulaStatuses, setFormulaStatuses] = useState<string[] | null>(null);
  const [formulaAmountMin, setFormulaAmountMin] = useState<number | null>(null);
  const [formulaAmountMax, setFormulaAmountMax] = useState<number | null>(null);
  const [formulaDateFrom, setFormulaDateFrom] = useState<string | null>(null);
  const [formulaDateTo, setFormulaDateTo] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [activeCell, setActiveCell] = useState<{ rowId: string; column: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartRowId, setDragStartRowId] = useState<string | null>(null);
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
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextCategorySubmenu, setContextCategorySubmenu] = useState(false);
  const [contextDatePicker, setContextDatePicker] = useState(false);
  const [insightFilter, setInsightFilter] = useState<'overdue' | 'unmatched' | 'duplicate' | null>(null);
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

  const columnConfig = useColumnConfig();
  const { onResizeStart } = useColumnResize({ onResize: columnConfig.resizeColumn });
  const { dragColumnId, dropTargetId, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd } = useColumnReorder({
    onReorder: columnConfig.reorderColumn,
    frozenColumns: ['date'],
  });

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
  const bulkAutoAllocate = useBulkAutoAllocate();
  const bulkCreateCharges = useBulkCreateCharges();
  const bulkCreatePayments = useBulkCreatePayments();

  const setSpreadsheetSelectedRows = useSpreadsheetContextStore((s) => s.setSelectedRows);
  const openAISidebar = useAISidebarStore((s) => s.open);

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

    // Add charges (amount due — not income until paid)
    if (chargesData?.data) {
      for (const charge of chargesData.data) {
        if (!typeFilters.has('charge')) continue;
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
              incomeCents: 0,
              dueCents: child.amountCents,
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
          incomeCents: 0,
          dueCents: hasChildren
            ? c.children.reduce((sum: number, child: any) => sum + child.amountCents, 0)
            : charge.amountCents,
          outstandingCents: hasChildren
            ? c.children.reduce((sum: number, child: any) => sum + (child.balanceDueCents ?? child.amountCents), 0)
            : (c.balanceDueCents ?? charge.amountCents),
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
        if (!typeFilters.has('expense')) continue;
        const e = expense as any;
        const hasChildren = e.children && e.children.length > 0;
        const cleanedTitle = cleanExpenseTitle(expense.title);

        const childRows: SpreadsheetRow[] = hasChildren
          ? e.children.map((child: any) => ({
              id: child.id,
              date: typeof child.date === 'string' ? child.date : new Date(child.date).toISOString(),
              type: 'expense' as const,
              category: child.category,
              description: child.description || (child.title ? cleanExpenseTitle(child.title) : 'Expense'),
              member: child.vendor || undefined,
              incomeCents: 0,
              dueCents: 0,
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
          dueCents: 0,
          outstandingCents: 0,
          expenseCents: hasChildren
            ? e.children.reduce((sum: number, child: any) => sum + child.amountCents, 0)
            : expense.amountCents,
          isParent: hasChildren,
          childCount: hasChildren ? e.children.length : undefined,
          children: hasChildren ? childRows : undefined,
        });
      }
    }

    // Add payments (income - actual money received)
    if (paymentsData?.data) {
      for (const payment of paymentsData.data) {
        if (!typeFilters.has('payment')) continue;
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
          dueCents: 0,
          outstandingCents: 0,
          expenseCents: 0,
          allocatedCents: payment.allocatedCents,
          unallocatedCents: payment.unallocatedCents,
          isUnallocated: payment.unallocatedCents === payment.amountCents,
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

    // Formula bar filters
    if (formulaCategories) {
      const cats = formulaCategories.map((c) => c.toLowerCase());
      filteredRows = filteredRows.filter((row) => cats.includes(row.category.toLowerCase()));
    }
    if (formulaStatuses) {
      const stats = formulaStatuses.map((s) => s.toLowerCase());
      filteredRows = filteredRows.filter((row) => row.status && stats.includes(row.status.toLowerCase()));
    }
    if (formulaAmountMin !== null) {
      const minCents = formulaAmountMin * 100;
      filteredRows = filteredRows.filter((row) => {
        const amt = row.type === 'expense' ? row.expenseCents : (row.outstandingCents || row.incomeCents);
        return amt >= minCents;
      });
    }
    if (formulaAmountMax !== null) {
      const maxCents = formulaAmountMax * 100;
      filteredRows = filteredRows.filter((row) => {
        const amt = row.type === 'expense' ? row.expenseCents : (row.outstandingCents || row.incomeCents);
        return amt <= maxCents;
      });
    }
    if (formulaDateFrom) {
      const from = new Date(formulaDateFrom).getTime();
      filteredRows = filteredRows.filter((row) => new Date(row.date).getTime() >= from);
    }
    if (formulaDateTo) {
      const to = new Date(formulaDateTo).getTime();
      filteredRows = filteredRows.filter((row) => new Date(row.date).getTime() <= to);
    }

    // Column filters (date handled as range, rest via matchesFilters)
    const dateFilter = columnFilters['date'];
    if (dateFilter && dateFilter.type === 'text' && dateFilter.value) {
      const parts = dateFilter.value.split('|');
      const fromStr = parts[0] || '';
      const toStr = parts[1] || '';
      if (fromStr) {
        const fromTime = new Date(fromStr).getTime();
        filteredRows = filteredRows.filter((row) => new Date(row.date).getTime() >= fromTime);
      }
      if (toStr) {
        const toTime = new Date(toStr).getTime();
        filteredRows = filteredRows.filter((row) => new Date(row.date).getTime() <= toTime);
      }
    }
    filteredRows = filteredRows.filter((row) => matchesFilters({
      member: row.member || '', category: row.category,
      description: row.description, income: row.incomeCents, expense: row.expenseCents,
    }));

    // Multi-column sort
    const compareByKey = (a: SpreadsheetRow, b: SpreadsheetRow, key: string): number => {
      switch (key) {
        case 'date': return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount': return (a.incomeCents || a.expenseCents) - (b.incomeCents || b.expenseCents);
        case 'income': { const c = (b.incomeCents > 0 ? 1 : 0) - (a.incomeCents > 0 ? 1 : 0); return c !== 0 ? c : a.incomeCents - b.incomeCents; }
        case 'expense': { const c = (b.expenseCents > 0 ? 1 : 0) - (a.expenseCents > 0 ? 1 : 0); return c !== 0 ? c : a.expenseCents - b.expenseCents; }
        case 'type': return a.type.localeCompare(b.type);
        case 'category': return (a.category || '').localeCompare(b.category || '');
        case 'member': return (a.member || '').localeCompare(b.member || '');
        case 'status': return (a.status || '').localeCompare(b.status || '');
        default: return 0;
      }
    };
    filteredRows.sort((a, b) => {
      for (const spec of sortSpecs) {
        const cmp = compareByKey(a, b, spec.key);
        if (cmp !== 0) return spec.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });

    return filteredRows;
  }, [chargesData, expensesData, paymentsData, members, typeFilters, searchQuery, sortSpecs, formulaCategories, formulaStatuses, formulaAmountMin, formulaAmountMax, formulaDateFrom, formulaDateTo, matchesFilters, columnFilters]);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    chargesData?.data.forEach((c) => { if (c.category) cats.add(c.category); });
    expensesData?.data.forEach((e) => { if (e.category) cats.add(e.category); });
    return Array.from(cats).sort();
  }, [chargesData, expensesData]);

  // Phase 2: Anomaly detection (computed from rows before insight filtering)
  const insights = useMemo(() => computeInsights(rows), [rows]);
  const insightsMap = useMemo(() => {
    const map = new Map<string, RowInsight>();
    for (const insight of insights) {
      if (!map.has(insight.rowId)) map.set(insight.rowId, insight);
    }
    return map;
  }, [insights]);

  // Apply insight filter to narrow down to matching rows only
  const displayRows = useMemo(() => {
    if (!insightFilter) return rows;
    const insightRowIds = new Set(
      insights.filter((i) => i.type === insightFilter).map((i) => i.rowId)
    );
    return rows.filter((row) => insightRowIds.has(row.id));
  }, [rows, insights, insightFilter]);

  const INSIGHT_DOT_COLORS: Record<RowInsight['type'], string> = {
    overdue: 'bg-destructive',
    unmatched: 'bg-warning',
    duplicate: 'bg-blue-500',
  };

  // Pagination
  const totalPages = Math.ceil(displayRows.length / pageSize);
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    const sliced = displayRows.slice(start, start + pageSize);
    // Inject child rows after expanded parents
    const result: SpreadsheetRow[] = [];
    for (const row of sliced) {
      result.push(row);
      if (row.isParent && row.children && expandedParents.has(row.id)) {
        result.push(...row.children);
      }
    }
    return result;
  }, [displayRows, page, pageSize, expandedParents]);

  const rowIds = useMemo(() => paginatedRows.map(r => r.id), [paginatedRows]);

  usePageKeyboard(page, totalPages, setPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    setSelectedRows(new Set());
  }, [typeFilters, searchQuery, sortSpecs, pageSize, insightFilter, columnFilters]);

  const toggleParentExpand = (parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  // Calculate totals
  const totals = useMemo(() => {
    let income = 0;
    let outstanding = 0;
    let expenses = 0;
    for (const r of displayRows) {
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
  }, [displayRows]);

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

        if (row.isParent && row.children && (column === 'category' || column === 'date')) {
          await Promise.all(
            row.children.map((child) =>
              updateCharge.mutateAsync({
                orgId: currentOrgId!,
                chargeId: child.id,
                data: updateData,
              })
            )
          );
        }
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

        if (row.isParent && row.children && (column === 'category' || column === 'date')) {
          await Promise.all(
            row.children.map((child) =>
              updateExpense.mutateAsync({
                orgId: currentOrgId!,
                expenseId: child.id,
                data: updateData,
              })
            )
          );
        }
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

  useSpreadsheetKeyboard({
    activeCell,
    setActiveCell,
    editingCell,
    setEditingCell: (cell) => setEditingCell(cell as EditingCell),
    rowIds,
    selectedRowIds: selectedRows,
    visibleColumns: columnConfig.visibleColumns,
    isAdmin,
    getCellValue: (rowId, column) => {
      const row = paginatedRows.find(r => r.id === rowId);
      if (!row) return '';
      if (column === 'date') return formatShortDate(row.date);
      if (column === 'member') return row.member || '-';
      if (column === 'category') return row.category;
      if (column === 'description') return row.description;
      if (column === 'income') return (row.incomeCents || row.dueCents) > 0 ? ((row.incomeCents || row.dueCents) / 100).toFixed(2) : '';
      if (column === 'expense') return row.expenseCents > 0 ? (row.expenseCents / 100).toFixed(2) : '';
      return '';
    },
    onSaveCell: (rowId, column, value) => {
      const row = paginatedRows.find(r => r.id === rowId);
      if (row) handleSaveCell(row, column as any, value);
    },
  });

  const handleAddMember = async (name: string): Promise<string | null> => {
    if (!currentOrgId) return null;
    try {
      const result = await createMembers.mutateAsync({
        orgId: currentOrgId,
        members: [{ name }],
      });
      const createdId = result.created?.length > 0 ? result.created[0].id : null;
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

  const handleRowMouseDown = useCallback((rowId: string, column: string, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (editingCell) return;

    // Double-click: enter edit mode instead of selecting
    if (e.detail === 2) return;

    setActiveCell({ rowId, column });

    if (e.shiftKey && selectedRows.size > 0) {
      const lastSelectedId = Array.from(selectedRows).pop();
      if (lastSelectedId) {
        const startIdx = paginatedRows.findIndex((r) => r.id === lastSelectedId);
        const endIdx = paginatedRows.findIndex((r) => r.id === rowId);
        if (startIdx !== -1 && endIdx !== -1) {
          const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const rangeIds = paginatedRows.slice(lo, hi + 1).filter((r) => !r.isChild).map((r) => r.id);
          setSelectedRows(new Set([...Array.from(selectedRows), ...rangeIds]));
        }
      }
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      toggleRowSelection(rowId);
      return;
    }

    // Only update selection if this isn't already the sole selected row
    if (!(selectedRows.size === 1 && selectedRows.has(rowId))) {
      setSelectedRows(new Set([rowId]));
    }
    setIsDragging(true);
    setDragStartRowId(rowId);
  }, [editingCell, selectedRows, paginatedRows, toggleRowSelection]);

  const handleRowMouseEnter = useCallback((rowId: string) => {
    if (!isDragging || !dragStartRowId) return;
    const startIdx = paginatedRows.findIndex((r) => r.id === dragStartRowId);
    const endIdx = paginatedRows.findIndex((r) => r.id === rowId);
    if (startIdx === -1 || endIdx === -1) return;
    const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
    const rangeIds = paginatedRows.slice(lo, hi + 1).filter((r) => !r.isChild).map((r) => r.id);
    setSelectedRows(new Set(rangeIds));
  }, [isDragging, dragStartRowId, paginatedRows]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStartRowId(null);
  }, []);

  // Global mouseup to end drag even if mouse leaves table
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDragging, handleMouseUp]);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => {
      setContextMenu(null);
      setContextCategorySubmenu(false);
      setContextDatePicker(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) dismiss();
    };
    const handleScroll = () => dismiss();
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  // Clear selection when clicking outside the table
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(e.target as Node)) {
        if (!editingCell) {
          setActiveCell(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editingCell]);

  const selectedOutstandingCharges = useMemo(
    () => paginatedRows.filter((r) => selectedRows.has(r.id) && r.type === 'charge' && r.outstandingCents > 0),
    [paginatedRows, selectedRows],
  );

  // Sync selected rows to context store for AI sidebar
  useEffect(() => {
    if (selectedRows.size === 0) {
      setSpreadsheetSelectedRows([]);
      return;
    }
    const contextRows = paginatedRows
      .filter((r) => selectedRows.has(r.id))
      .map((r) => ({
        id: r.id,
        type: r.type,
        description: r.description,
        member: r.member,
        membershipId: r.membershipId,
        category: r.category,
        date: r.date,
        incomeCents: r.incomeCents,
        dueCents: r.dueCents,
        outstandingCents: r.outstandingCents,
        expenseCents: r.expenseCents,
        status: r.status,
        allocatedCents: r.allocatedCents,
        unallocatedCents: r.unallocatedCents,
      }));
    setSpreadsheetSelectedRows(contextRows);
  }, [selectedRows, paginatedRows, setSpreadsheetSelectedRows]);

  // Clear context store on unmount
  useEffect(() => {
    return () => setSpreadsheetSelectedRows([]);
  }, [setSpreadsheetSelectedRows]);

  const handleAskAI = useCallback(() => {
    openAISidebar();
  }, [openAISidebar]);

  const handleBulkSetCategory = useCallback(async (category: string) => {
    if (!currentOrgId) return;
    const updates = paginatedRows
      .filter(r => selectedRows.has(r.id) && r.type !== 'payment')
      .map(r => {
        if (r.type === 'charge') return updateCharge.mutateAsync({ orgId: currentOrgId!, chargeId: r.id, data: { category } });
        if (r.type === 'expense') return updateExpense.mutateAsync({ orgId: currentOrgId!, expenseId: r.id, data: { category } });
        return null;
      }).filter(Boolean);
    await Promise.all(updates);
    toast({ title: `Updated ${updates.length} row${updates.length !== 1 ? 's' : ''}` });
    setContextMenu(null);
    setContextCategorySubmenu(false);
  }, [currentOrgId, paginatedRows, selectedRows, updateCharge, updateExpense, toast]);

  const handleBulkSetDate = useCallback(async (date: string) => {
    if (!currentOrgId) return;
    const updates = paginatedRows
      .filter(r => selectedRows.has(r.id))
      .map(r => {
        if (r.type === 'charge') return updateCharge.mutateAsync({ orgId: currentOrgId!, chargeId: r.id, data: { dueDate: date } });
        if (r.type === 'expense') return updateExpense.mutateAsync({ orgId: currentOrgId!, expenseId: r.id, data: { date } });
        if (r.type === 'payment') return updatePayment.mutateAsync({ orgId: currentOrgId!, paymentId: r.id, data: { paidAt: date } });
        return null;
      }).filter(Boolean);
    await Promise.all(updates);
    toast({ title: `Updated ${updates.length} row${updates.length !== 1 ? 's' : ''}` });
    setContextMenu(null);
    setContextDatePicker(false);
  }, [currentOrgId, paginatedRows, selectedRows, updateCharge, updateExpense, updatePayment, toast]);

  const handleCopyRows = useCallback(async () => {
    const rowsToCopy = paginatedRows.filter(r => selectedRows.has(r.id));
    const headers = ['Date', 'Type', 'Member/Vendor', 'Category', 'Description', 'Income', 'Expense'];
    const lines = rowsToCopy.map(r => [
      formatShortDate(r.date),
      r.type,
      r.member || '',
      r.category,
      r.description,
      r.incomeCents ? (r.incomeCents / 100).toFixed(2) : '',
      r.expenseCents ? (r.expenseCents / 100).toFixed(2) : '',
    ].join('\t'));
    await navigator.clipboard.writeText([headers.join('\t'), ...lines].join('\n'));
    toast({ title: `Copied ${rowsToCopy.length} row${rowsToCopy.length !== 1 ? 's' : ''}` });
    setContextMenu(null);
  }, [paginatedRows, selectedRows, toast]);

  // Phase 4: Row action handlers
  const handleRowAction = useCallback(async (row: SpreadsheetRow, action: RowAction) => {
    if (action.type === 'ai') {
      setSpreadsheetSelectedRows([{
        id: row.id,
        type: row.type,
        description: row.description,
        member: row.member,
        membershipId: row.membershipId,
        category: row.category,
        date: row.date,
        incomeCents: row.incomeCents,
        dueCents: row.dueCents,
        outstandingCents: row.outstandingCents,
        expenseCents: row.expenseCents,
        status: row.status,
        allocatedCents: row.allocatedCents,
        unallocatedCents: row.unallocatedCents,
      }]);
      openAISidebar();
      return;
    }

    if (!currentOrgId) return;

    if (action.action === 'auto-allocate' && row.type === 'charge') {
      try {
        await autoAllocate.mutateAsync({ orgId: currentOrgId, chargeId: row.id });
        toast({ title: 'Auto-matched payment' });
      } catch {
        toast({ title: 'No matching payment found', variant: 'destructive' });
      }
    } else if (action.action === 'void') {
      try {
        await voidCharge.mutateAsync({ orgId: currentOrgId, chargeId: row.id });
        toast({
          title: 'Charge voided',
          action: <ToastUndoButton onClick={() => restoreCharge.mutate({ orgId: currentOrgId!, chargeId: row.id })} />,
        });
      } catch (e: any) {
        toast({ title: 'Failed to void', description: e.message, variant: 'destructive' });
      }
    } else if (action.action === 'delete' && row.type === 'expense') {
      try {
        await deleteExpense.mutateAsync({ orgId: currentOrgId, expenseId: row.id });
        toast({
          title: 'Expense deleted',
          action: <ToastUndoButton onClick={() => restoreExpense.mutate({ orgId: currentOrgId!, expenseId: row.id })} />,
        });
      } catch (e: any) {
        toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' });
      }
    } else if (action.action === 'delete' && row.type === 'payment') {
      try {
        await deletePayment.mutateAsync({ orgId: currentOrgId, paymentId: row.id });
        toast({
          title: 'Payment deleted',
          action: <ToastUndoButton onClick={() => restorePayment.mutate({ orgId: currentOrgId!, paymentId: row.id })} />,
        });
      } catch (e: any) {
        toast({ title: 'Failed to delete', description: e.message, variant: 'destructive' });
      }
    } else if (action.action === 'auto-allocate' && row.type === 'payment') {
      try {
        await bulkAutoAllocate.mutateAsync({ orgId: currentOrgId, paymentIds: [row.id] });
        toast({ title: 'Payment auto-allocated' });
      } catch {
        toast({ title: 'No matching charge found', variant: 'destructive' });
      }
    }
  }, [currentOrgId, autoAllocate, bulkAutoAllocate, voidCharge, restoreCharge, deleteExpense, restoreExpense, deletePayment, restorePayment, openAISidebar, setSpreadsheetSelectedRows, toast]);

  // Phase 3: Formula bar handlers
  const handleFormulaFilter = useCallback((result: SpreadsheetQueryResult & { type: 'filter' }) => {
    if (result.typeFilter) setTypeFilters(new Set([result.typeFilter]));
    if (result.search !== undefined) setSearchQuery(result.search || '');
    setFormulaCategories(result.categories?.length ? result.categories : null);
    setFormulaStatuses(result.statuses?.length ? result.statuses : null);
    setFormulaAmountMin(result.amountMin ?? null);
    setFormulaAmountMax(result.amountMax ?? null);
    setFormulaDateFrom(result.dateFrom ?? null);
    setFormulaDateTo(result.dateTo ?? null);
  }, []);

  const handleFormulaSort = useCallback((result: SpreadsheetQueryResult & { type: 'sort' }) => {
    if (result.sortBy) {
      toggleSort(result.sortBy, false);
      if (result.sortOrder && getSortDirection(result.sortBy) !== result.sortOrder) {
        toggleSort(result.sortBy, false);
      }
    }
  }, [toggleSort, getSortDirection]);

  const handleExportCSV = () => {
    const headers = ['Date', 'Type', 'Member/Vendor', 'Category', 'Title', 'Income', 'Unpaid', 'Expense'];
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
        (row.incomeCents || row.dueCents) ? ((row.incomeCents || row.dueCents) / 100).toFixed(2) : '',
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

  const renderCellContent = (row: SpreadsheetRow, colId: string) => {
    switch (colId) {
      case 'date':
        return (
          <div className="flex items-center gap-1">
            {!isAdmin && row.isParent && (
              <button onClick={() => toggleParentExpand(row.id)} className="shrink-0 p-0.5 hover:text-primary transition-colors">
                {expandedParents.has(row.id) ? <ChevronDown className="w-3.5 h-3.5 text-primary" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            )}
            <EditableCell value={row.date} type="date" isEditing={editingCell?.rowId === row.id && editingCell?.column === 'date'} onEdit={() => setEditingCell({ rowId: row.id, column: 'date' })} onSave={(v) => handleSaveCell(row, 'date', v)} onCancel={() => setEditingCell(null)} onNavigate={(dir) => handleCellNavigate(row.id, 'date', dir)} isAdmin={isAdmin} rowType={row.type} column="date" />
          </div>
        );
      case 'member':
        return row.type === 'charge' || row.type === 'payment' ? (
          <EditableCell value={row.membershipId || ''} type="member" isEditing={editingCell?.rowId === row.id && editingCell?.column === 'member'} onEdit={() => setEditingCell({ rowId: row.id, column: 'member' })} onSave={(v) => handleSaveCell(row, 'member', v)} onCancel={() => setEditingCell(null)} onNavigate={(dir) => handleCellNavigate(row.id, 'member', dir)} isAdmin={isAdmin} rowType={row.type} column="member" members={members} onAddMember={handleAddMember} />
        ) : (
          <EditableCell value={row.member || ''} type="text" isEditing={editingCell?.rowId === row.id && editingCell?.column === 'member'} onEdit={() => setEditingCell({ rowId: row.id, column: 'member' })} onSave={(v) => handleSaveCell(row, 'member', v)} onCancel={() => setEditingCell(null)} onNavigate={(dir) => handleCellNavigate(row.id, 'member', dir)} isAdmin={isAdmin} rowType={row.type} column="member" />
        );
      case 'category':
        return row.type === 'payment' ? (
          <Badge variant="outline" className="text-[10px] capitalize">{row.category}</Badge>
        ) : (
          <EditableCell value={row.category} type="category" isEditing={editingCell?.rowId === row.id && editingCell?.column === 'category'} onEdit={() => setEditingCell({ rowId: row.id, column: 'category' })} onSave={(v) => handleSaveCell(row, 'category', v)} onCancel={() => setEditingCell(null)} onNavigate={(dir) => handleCellNavigate(row.id, 'category', dir)} isAdmin={isAdmin} rowType={row.type} column="category" />
        );
      case 'description':
        return (
          <div className="flex items-center gap-2 min-w-0">
            {row.isParent && (<Badge variant="outline" className="text-[10px] shrink-0 bg-primary/10 text-primary border-primary/30">Multi</Badge>)}
            {row.isChild && !isAdmin && (<span className="text-muted-foreground/50 shrink-0">&mdash;</span>)}
            <div className="min-w-0 flex-1">
              <EditableCell value={row.description} type="text" isEditing={editingCell?.rowId === row.id && editingCell?.column === 'description'} onEdit={() => setEditingCell({ rowId: row.id, column: 'description' })} onSave={(v) => handleSaveCell(row, 'description', v)} onCancel={() => setEditingCell(null)} onNavigate={(dir) => handleCellNavigate(row.id, 'description', dir)} isAdmin={isAdmin} rowType={row.type} column="description" />
            </div>
          </div>
        );
      case 'income':
        if (row.type === 'charge' && row.dueCents > 0) {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Money cents={row.dueCents} size="sm" className="text-muted-foreground" />
              {row.outstandingCents > 0 ? (
                <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild><AlertCircle className="w-3 h-3 text-warning shrink-0" /></TooltipTrigger><TooltipContent side="top"><Money cents={row.outstandingCents} size="xs" inline className="text-warning" /> unpaid</TooltipContent></Tooltip></TooltipProvider>
              ) : (<Check className="w-3 h-3 text-success shrink-0" />)}
            </div>
          );
        }
        return row.incomeCents > 0 ? (
          <EditableCell value={row.incomeCents} type="money" isEditing={editingCell?.rowId === row.id && editingCell?.column === 'amount'} onEdit={() => setEditingCell({ rowId: row.id, column: 'amount' })} onSave={(v) => handleSaveCell(row, 'amount', v)} onCancel={() => setEditingCell(null)} onNavigate={(dir) => handleCellNavigate(row.id, 'amount', dir)} isAdmin={isAdmin} rowType={row.type} column="income" />
        ) : (<span className="text-muted-foreground/30">-</span>);
      case 'expense':
        return row.expenseCents > 0 ? (
          <EditableCell value={row.expenseCents} type="money" isEditing={editingCell?.rowId === row.id && editingCell?.column === 'amount'} onEdit={() => setEditingCell({ rowId: row.id, column: 'amount' })} onSave={(v) => handleSaveCell(row, 'amount', v)} onCancel={() => setEditingCell(null)} onNavigate={(dir) => handleCellNavigate(row.id, 'amount', dir)} isAdmin={isAdmin} rowType={row.type} column="expense" />
        ) : (<span className="text-muted-foreground/30">-</span>);
      default:
        return null;
    }
  };

  const stickyDateBg = (row: SpreadsheetRow) =>
    selectedRows.has(row.id) ? 'bg-primary/10' : row.type === 'charge' ? 'bg-warning/5' : row.type === 'expense' ? 'bg-destructive/5' : row.type === 'payment' ? 'bg-success/5' : 'bg-card';

  return (
    <div className="space-y-6" data-tour="spreadsheet-view">
      {/* Header */}
      <FadeIn>
        <PageHeader
          title="Spreadsheet"
          helpText={`Combined view of all charges, expenses, and payments in one place. ${isAdmin ? 'Click any cell to edit. Sort by clicking column headers.' : 'View all financial transactions.'}`}
          actions={
            <div className="flex items-center gap-2">
              {isAdmin && selectedRows.size > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAskAI}
                  className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ask AI about {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''}
                </Button>
              )}
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
      {displayRows.length > 0 && (
        <FadeIn delay={0.1}>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-success mb-2">
                <ArrowUpRight className="w-4 h-4" />
                <span className="text-sm font-medium">Income</span>
              </div>
              <Money cents={totals.income} size="lg" className="text-success" />
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <ArrowDownRight className="w-4 h-4" />
                <span className="text-sm font-medium">Expenses</span>
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

      {/* Phase 2: Insights Banner */}
      {insights.length > 0 && (
        <FadeIn delay={0.12}>
          <InsightsBanner
            insights={insights}
            activeFilter={insightFilter}
            onFilterByType={(type) => {
              if (insightFilter === type) {
                setInsightFilter(null);
              } else {
                setInsightFilter(type);
              }
            }}
          />
        </FadeIn>
      )}

      {/* Phase 3: Formula Bar + Filters */}
      <FadeIn delay={0.15}>
        <div className="space-y-3">
          {currentOrgId && isAdmin ? (
            <FormulaBar
              orgId={currentOrgId}
              rows={rows}
              viewMetadata={{
                typeFilter: typeFilters.size === 3 ? 'all' : Array.from(typeFilters)[0] || 'all',
                rowCount: rows.length,
                columns: ['date', 'type', 'category', 'description', 'member', 'income', 'expense'],
              }}
              onFilter={handleFormulaFilter}
              onSort={handleFormulaSort}
              onSearchFallback={(q) => {
                setSearchQuery(q);
                if (!q) {
                  setFormulaCategories(null);
                  setFormulaStatuses(null);
                  setFormulaAmountMin(null);
                  setFormulaAmountMax(null);
                  setFormulaDateFrom(null);
                  setFormulaDateTo(null);
                }
              }}
            />
          ) : (
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
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              {(['charge', 'expense', 'payment'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilters(prev => {
                    const next = new Set(prev);
                    if (next.has(t)) {
                      next.delete(t);
                      if (next.size === 0) return new Set(['charge', 'expense', 'payment']);
                    } else {
                      next.add(t);
                    }
                    return next;
                  })}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    typeFilters.has(t)
                      ? t === 'charge' ? 'bg-warning/15 text-warning' : t === 'expense' ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'
                      : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'charge' ? 'Charges' : t === 'expense' ? 'Expenses' : 'Payments'}
                </button>
              ))}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-1"
                >
                  <Filter className="h-3 w-3" />
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
                  <span className="text-primary/60 ml-0.5">&times;</span>
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <Columns3 className="h-3.5 w-3.5" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {COLUMN_DEFS.filter(c => c.hideable).map(col => (
                    <DropdownMenuItem
                      key={col.id}
                      onClick={() => columnConfig.toggleVisibility(col.id)}
                      className="text-xs gap-2"
                    >
                      {columnConfig.state.hidden.includes(col.id) ? (
                        <div className="w-4 h-4" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {col.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={columnConfig.resetColumns} className="text-xs">
                    Reset to default
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Spreadsheet Table */}
      <FadeIn delay={0.25}>
        {!isLoading && displayRows.length > 0 && (
          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
            <span>Showing {displayRows.length} items</span>
            {((chargesData?.data?.length ?? 0) >= 100 || (expensesData?.data?.length ?? 0) >= 100 || (paymentsData?.data?.length ?? 0) >= 100) && (
              <span>(limited to 100 per type)</span>
            )}
          </div>
        )}
        <div ref={tableRef} className="rounded-xl border bg-card overflow-hidden" data-spreadsheet>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {isAdmin && (
                    <th className="w-14 pl-3 pr-0 py-2 sticky left-0 z-20 bg-secondary/30">
                      <div className="flex items-center gap-0.5">
                        {selectedRows.size > 0 && (
                          <button
                            onClick={() => setShowBulkDeleteConfirm(true)}
                            className="w-6 h-6 shrink-0 flex items-center justify-center transition-colors hover:text-destructive"
                            title={`Delete ${selectedRows.size} selected`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                        {selectedOutstandingCharges.length > 0 && (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setShowAllocateDialog(true)}
                                  className="w-6 h-6 shrink-0 flex items-center justify-center transition-colors hover:text-primary"
                                >
                                  <Link2 className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                Match {selectedOutstandingCharges.length} charge{selectedOutstandingCharges.length !== 1 ? 's' : ''}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </th>
                  )}
                  {columnConfig.visibleColumns.map((colId, colIdx) => {
                    const def = columnConfig.getColumnDef(colId);
                    const width = colId === 'description' ? undefined : columnConfig.getWidth(colId);
                    return (
                      <th
                        key={colId}
                        className={cn(
                          'px-2 py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none relative',
                          def.align === 'right' ? 'text-right' : 'text-left',
                          colIdx % 2 === 0 && 'bg-black/[0.015] dark:bg-white/[0.015]',
                          colId === 'date' && (isAdmin ? 'sticky left-14 z-20 bg-secondary/30' : 'sticky left-0 z-20 bg-secondary/30'),
                          dropTargetId === colId && 'border-l-2 border-primary',
                          dragColumnId === colId && 'opacity-50',
                        )}
                        style={width ? { width } : undefined}
                        draggable={colId !== 'date'}
                        onDragStart={(e) => onDragStart(colId, e)}
                        onDragOver={(e) => onDragOver(colId, e)}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(colId, e)}
                        onDragEnd={onDragEnd}
                        onClick={(e) => {
                          if (def.sortKey) {
                            toggleSort(def.sortKey, e.shiftKey);
                          }
                        }}
                      >
                        <span className="group/header flex items-center gap-1" style={{ justifyContent: def.align === 'right' ? 'flex-end' : 'flex-start' }}>
                          {(colId === 'income' || colId === 'expense') && <DollarSign className="h-3 w-3" />}
                          {def.label}
                          {def.sortKey && getSortDirection(def.sortKey) && (
                            <span className="flex items-center gap-0.5">
                              {getSortDirection(def.sortKey) === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {sortSpecs.length > 1 && getSortIndex(def.sortKey) !== null && (
                                <span className="text-[10px] bg-primary/20 text-primary rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                  {(getSortIndex(def.sortKey)! + 1)}
                                </span>
                              )}
                            </span>
                          )}
                          {def.filterable && (
                            <ColumnFilterPopover
                              columnId={colId}
                              filter={columnFilters[colId] || null}
                              onSetFilter={(f) => setColumnFilter(colId, f)}
                              allCategories={colId === 'category' ? allCategories : undefined}
                            />
                          )}
                        </span>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors"
                          onMouseDown={(e) => onResizeStart(colId, columnConfig.getWidth(colId), e)}
                        />
                      </th>
                    );
                  })}
                  {isAdmin && <th className="w-8 px-1" />}
                </tr>
              </thead>
              <tbody>
                {/* Select All / Add Row */}
                {isAdmin && !isLoading && (
                  <tr className="border-b border-border/50 bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <td className="pl-3 pr-0 py-2">
                      <div className="flex items-center gap-1">
                        <div className="w-6 h-6" />
                        {!inlineNewRow && (
                          <button
                            onClick={handleStartInlineRow}
                            className="w-6 h-6 flex items-center justify-center transition-colors hover:text-primary"
                            title="Add new row"
                          >
                            <Plus className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td colSpan={columnConfig.visibleColumns.length}>
                      {selectedRows.size > 0 && (
                        <button
                          onClick={() => setSelectedRows(new Set())}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {selectedRows.size} selected — click to clear
                        </button>
                      )}
                    </td>
                    <td />
                  </tr>
                )}
                {/* Inline New Row — fixed layout, unaffected by column visibility */}
                {isAdmin && inlineNewRow && (
                  <tr className="border-b border-border/50 bg-primary/5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <td className="pl-3 pr-0 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleSaveInlineRow}
                          className="w-6 h-6 flex items-center justify-center transition-colors hover:text-success text-success/70"
                          title="Save row"
                          disabled={createCharge.isPending || createExpense.isPending || createPayment.isPending}
                        >
                          {(createCharge.isPending || createExpense.isPending || createPayment.isPending) ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={handleCancelInlineRow}
                          className="w-6 h-6 flex items-center justify-center transition-colors text-muted-foreground hover:text-destructive"
                          title="Cancel"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td colSpan={columnConfig.visibleColumns.length} className="px-2 py-2">
                      <div className="flex items-center gap-3">
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
                          setInlineNewRowField('member');
                        }}>
                          <SelectTrigger className="h-7 text-xs bg-transparent border-border/50 w-28 shrink-0">
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
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="mm/dd/yy"
                          value={newRowData.date ? (() => {
                            const d = new Date(newRowData.date);
                            if (isNaN(d.getTime())) return newRowData.date;
                            return `${d.getMonth() + 1}/${d.getDate()}/${(d.getFullYear() % 100).toString().padStart(2, '0')}`;
                          })() : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
                            let masked = raw;
                            if (raw.length > 2) masked = raw.slice(0, 2) + '/' + raw.slice(2);
                            if (raw.length > 4) masked = raw.slice(0, 2) + '/' + raw.slice(2, 4) + '/' + raw.slice(4);
                            const match = masked.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
                            if (match) {
                              const fullYear = 2000 + parseInt(match[3]);
                              const date = new Date(fullYear, parseInt(match[1]) - 1, parseInt(match[2]));
                              if (!isNaN(date.getTime())) {
                                setNewRowData(d => ({ ...d, date: date.toISOString().split('T')[0] }));
                                return;
                              }
                            }
                            setNewRowData(d => ({ ...d, date: masked }));
                          }}
                          className="h-7 w-20 shrink-0 text-xs bg-transparent border border-border/50 rounded px-2 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        {newRowType === 'expense' ? (
                          <input
                            placeholder="Vendor..."
                            value={newRowData.vendor}
                            onChange={(e) => setNewRowData(d => ({ ...d, vendor: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') handleCancelInlineRow();
                              if (e.key === 'Enter') handleSaveInlineRow();
                            }}
                            autoFocus={inlineNewRowField === 'member'}
                            maxLength={200}
                            className="h-7 w-28 shrink-0 text-xs bg-transparent border border-border/50 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        ) : (
                          <Select value={newRowData.membershipId || 'none'} onValueChange={(v) => setNewRowData(d => ({ ...d, membershipId: v === 'none' ? '' : v }))}>
                            <SelectTrigger className="h-7 text-xs bg-transparent border-border/50 w-32 shrink-0">
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
                        {newRowType !== 'payment' && (
                          <Select value={newRowData.category || 'none'} onValueChange={(v) => setNewRowData(d => ({ ...d, category: v === 'none' ? '' : v }))}>
                            <SelectTrigger className="h-7 text-xs bg-transparent border-border/50 w-28 shrink-0">
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
                        <input
                          placeholder={newRowType === 'payment' ? 'Memo...' : 'Title...'}
                          value={newRowType === 'payment' ? newRowData.memo : newRowData.description}
                          onChange={(e) => newRowType === 'payment'
                            ? setNewRowData(d => ({ ...d, memo: e.target.value }))
                            : setNewRowData(d => ({ ...d, description: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') handleCancelInlineRow();
                            if (e.key === 'Enter') handleSaveInlineRow();
                          }}
                          autoFocus={inlineNewRowField === 'description'}
                          maxLength={newRowType === 'payment' ? 500 : 200}
                          className="h-7 flex-1 min-w-0 text-xs bg-transparent border border-border/50 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground">$</span>
                          <input
                            placeholder="0.00"
                            value={newRowData.amountCents ? (newRowData.amountCents / 100).toFixed(2) : ''}
                            onChange={(e) => {
                              const cents = Math.round(parseFloat(e.target.value || '0') * 100);
                              setNewRowData(d => ({ ...d, amountCents: isNaN(cents) ? 0 : cents }));
                            }}
                            onBlur={(e) => {
                              const raw = e.target.value;
                              if (raw && isNaN(parseFloat(raw))) {
                                const cents = parseNaturalAmount(raw);
                                if (cents !== null) {
                                  setNewRowData(d => ({ ...d, amountCents: cents }));
                                }
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') handleCancelInlineRow();
                              if (e.key === 'Enter') handleSaveInlineRow();
                            }}
                            autoFocus={inlineNewRowField === 'amount'}
                            type="text"
                            inputMode="decimal"
                            className="h-7 w-20 text-xs bg-transparent border border-border/50 rounded px-2 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {isAdmin && <td className="pl-3 pr-1 py-3"><Skeleton className="h-7 w-14" /></td>}
                      {columnConfig.visibleColumns.map((colId) => (
                        <td key={colId} className="px-2 py-2">
                          <Skeleton className={cn('h-4', colId === 'description' ? 'w-40' : colId === 'member' ? 'w-20' : 'w-16', (colId === 'income' || colId === 'expense') && 'ml-auto')} />
                        </td>
                      ))}
                      {isAdmin && <td />}
                    </tr>
                  ))
                ) : paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? columnConfig.visibleColumns.length + 2 : columnConfig.visibleColumns.length}>
                      <div className="flex flex-col items-center justify-center text-center py-12">
                        <Search className="h-6 w-6 text-muted-foreground mb-2" />
                        <p className="font-semibold">No results</p>
                        <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, index) => (
                    <tr
                      key={row.id}
                      onMouseEnter={() => handleRowMouseEnter(row.id)}
                      onContextMenu={(e) => {
                        if (selectedRows.size > 0 && isAdmin) {
                          e.preventDefault();
                          setContextCategorySubmenu(false);
                          setContextDatePicker(false);
                          setContextMenu({ x: e.clientX, y: e.clientY });
                        }
                      }}
                      className={cn(
                        'animate-in-up group/row',
                        'border-b border-border/50 transition-colors',
                        selectedRows.has(row.id)
                          ? 'bg-primary/10 hover:bg-primary/15'
                          : cn(
                              'hover:bg-secondary/30',
                              row.type === 'charge' && 'bg-warning/5',
                              row.type === 'expense' && 'bg-destructive/5',
                              row.type === 'payment' && (row.isUnallocated ? 'bg-success/3 opacity-60' : 'bg-success/5'),
                            ),
                        row.isChild && !selectedRows.has(row.id) && 'bg-secondary/20',
                        isDragging && 'select-none',
                      )}
                    >
                      {isAdmin && (
                        <td className={cn("pl-3 pr-0 py-2 sticky left-0 z-10", stickyDateBg(row))}>
                          <div className="flex items-center gap-1">
                            {row.isParent ? (
                              <button
                                onClick={() => toggleParentExpand(row.id)}
                                className="relative w-6 h-6 flex items-center justify-center transition-colors hover:text-primary"
                                title={expandedParents.has(row.id) ? 'Collapse' : 'Expand'}
                              >
                                {expandedParents.has(row.id) ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-primary" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                                {insightsMap.has(row.id) && (
                                  <div className={cn('absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full', INSIGHT_DOT_COLORS[insightsMap.get(row.id)!.type])} />
                                )}
                              </button>
                            ) : !row.isChild ? (
                              <div className="relative w-6 h-6 flex items-center justify-center">
                                {insightsMap.has(row.id) && (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className={cn('w-2 h-2 rounded-full', INSIGHT_DOT_COLORS[insightsMap.get(row.id)!.type])} />
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="max-w-[200px] text-xs">
                                        {insightsMap.get(row.id)!.message}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            ) : (
                              <div className="w-6 h-6" />
                            )}
                            {!row.isChild && (
                              <button
                                onClick={() => handleDeleteRow(row)}
                                className="w-6 h-6 flex items-center justify-center transition-colors hover:text-destructive"
                                title="Delete row"
                              >
                                <Minus className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {columnConfig.visibleColumns.map((colId, colIdx) => {
                        const def = columnConfig.getColumnDef(colId);
                        const width = colId === 'description' ? undefined : columnConfig.getWidth(colId);
                        const isActive = activeCell?.rowId === row.id && activeCell?.column === colId;
                        return (
                          <td
                            key={colId}
                            className={cn(
                              'px-2 py-2 cursor-default',
                              def.align === 'right' && 'text-right',
                              isActive && 'ring-2 ring-inset ring-primary/50',
                              colIdx % 2 === 0 && 'bg-black/[0.02] dark:bg-white/[0.02]',
                              colId === 'date' && (isAdmin ? 'sticky left-14 z-10' : 'sticky left-0 z-10'),
                              colId === 'date' && stickyDateBg(row),
                              colId === 'description' && row.isChild && 'pl-10',
                            )}
                            style={width ? { width } : undefined}
                            onMouseDown={(e) => handleRowMouseDown(row.id, colId, e)}
                            onDoubleClick={() => {
                              if (!isAdmin) return;
                              if (row.isParent && (colId === 'member' || colId === 'income' || colId === 'expense')) return;
                              setEditingCell({ rowId: row.id, column: colId as any });
                            }}
                          >
                            {renderCellContent(row, colId)}
                          </td>
                        );
                      })}
                      {isAdmin && (
                        <td className="w-8 px-1 py-2">
                          {!row.isChild && (() => {
                            const actions = getRowActions(row);
                            if (actions.length === 0) return null;
                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="w-6 h-6 flex items-center justify-center rounded transition-colors opacity-0 group-hover/row:opacity-100 hover:bg-secondary">
                                    <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  {actions.map((action, i) => (
                                    <DropdownMenuItem
                                      key={i}
                                      onClick={() => handleRowAction(row, action)}
                                      className={cn('cursor-pointer text-xs gap-2', action.destructive && 'text-destructive focus:text-destructive')}
                                    >
                                      {action.type === 'ai' && <Sparkles className="h-3.5 w-3.5" />}
                                      {action.icon === 'match' && <Link2 className="h-3.5 w-3.5" />}
                                      {action.icon === 'void' && <Ban className="h-3.5 w-3.5" />}
                                      {action.icon === 'delete' && <Trash2 className="h-3.5 w-3.5" />}
                                      {action.icon === 'allocate' && <Zap className="h-3.5 w-3.5" />}
                                      {action.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            );
                          })()}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {/* Totals Row */}
              {!isLoading && displayRows.length > 0 && (
                <tfoot>
                  <tr className="bg-secondary/50 font-medium">
                    <td className="px-2 py-2" colSpan={(isAdmin ? 1 : 0) + columnConfig.visibleColumns.filter(c => c !== 'income' && c !== 'expense').length}>
                      <span className="text-muted-foreground">Total ({displayRows.length} transactions)</span>
                    </td>
                    {columnConfig.visibleColumns.includes('income') && (
                      <td className="px-2 py-2 text-right">
                        <Money cents={totals.income} size="sm" className="text-success font-semibold" />
                      </td>
                    )}
                    {columnConfig.visibleColumns.includes('expense') && (
                      <td className="px-2 py-2 text-right">
                        <Money cents={totals.expenses} size="sm" className="text-destructive font-semibold" />
                      </td>
                    )}
                    {isAdmin && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </FadeIn>

      {/* Pagination Controls - Bottom */}
      {displayRows.length > 0 && (
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
                maxLength={newRowType === 'payment' ? 500 : 200}
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
                  maxLength={200}
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label>Amount</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={(newRowData.amountCents / 100).toFixed(2)}
                onChange={(e) =>
                  setNewRowData({
                    ...newRowData,
                    amountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                  })
                }
                onBlur={(e) => {
                  const raw = e.target.value;
                  if (raw && isNaN(parseFloat(raw))) {
                    const cents = parseNaturalAmount(raw);
                    if (cents !== null) {
                      setNewRowData({ ...newRowData, amountCents: cents });
                    }
                  }
                }}
                placeholder="0.00 or 'fifty dollars'"
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
        recentCharges={chargesData?.data}
      />

      {/* Multi-expense Create Dialog */}
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        title={`Delete ${selectedRows.size} selected row${selectedRows.size !== 1 ? 's' : ''}?`}
        description="The selected charges, expenses, and payments will be deleted. This can be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          handleDeleteSelected();
          setShowBulkDeleteConfirm(false);
        }}
      />

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

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[200px] rounded-xl border bg-card shadow-lg py-1 animate-in fade-in zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2"
            onClick={() => {
              setShowBulkDeleteConfirm(true);
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
            <span className="text-destructive">Delete {selectedRows.size} selected</span>
          </button>
          <div className="h-px bg-border my-1" />
          <div className="relative">
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2 justify-between"
              onClick={() => {
                setContextCategorySubmenu(!contextCategorySubmenu);
                setContextDatePicker(false);
              }}
            >
              <span className="flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                Set Category...
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {contextCategorySubmenu && (
              <div className="absolute left-full top-0 ml-1 min-w-[160px] rounded-xl border bg-card shadow-lg py-1 animate-in fade-in zoom-in-95 max-h-[300px] overflow-y-auto">
                {(() => {
                  const selectedTypes = new Set(
                    paginatedRows.filter(r => selectedRows.has(r.id)).map(r => r.type)
                  );
                  const hasCharges = selectedTypes.has('charge');
                  const hasExpenses = selectedTypes.has('expense');
                  const categories: Array<{ value: string; label: string }> = [];
                  if (hasCharges) {
                    CHARGE_CATEGORIES.forEach(cat => {
                      if (!categories.find(c => c.value === cat)) {
                        categories.push({ value: cat, label: CHARGE_CATEGORY_LABELS[cat] });
                      }
                    });
                  }
                  if (hasExpenses) {
                    EXPENSE_CATEGORIES.forEach(cat => {
                      if (!categories.find(c => c.value === cat)) {
                        categories.push({ value: cat, label: EXPENSE_CATEGORY_LABELS[cat] });
                      }
                    });
                  }
                  return categories.map(cat => (
                    <button
                      key={cat.value}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary transition-colors"
                      onClick={() => handleBulkSetCategory(cat.value)}
                    >
                      {cat.label}
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2 justify-between"
              onClick={() => {
                setContextDatePicker(!contextDatePicker);
                setContextCategorySubmenu(false);
              }}
            >
              <span className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                Set Date...
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {contextDatePicker && (
              <div className="absolute left-full top-0 ml-1 rounded-xl border bg-card shadow-lg p-2 animate-in fade-in zoom-in-95">
                <DatePicker
                  value=""
                  onChange={(date) => {
                    if (date) handleBulkSetDate(new Date(date).toISOString());
                  }}
                />
              </div>
            )}
          </div>
          <div className="h-px bg-border my-1" />
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2"
            onClick={handleCopyRows}
          >
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            Copy {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''}
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2"
            onClick={() => {
              handleAskAI();
              setContextMenu(null);
            }}
          >
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
            Ask AI about {selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}
