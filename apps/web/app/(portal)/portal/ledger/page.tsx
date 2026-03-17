'use client';

import { useMemo } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useCharges } from '@/lib/queries/charges';
import { useExpenses } from '@/lib/queries/expenses';
import { usePayments } from '@/lib/queries/payments';
import { useAuthStore } from '@/lib/stores/auth';
import { formatDate, cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

type LedgerRow = {
  id: string;
  date: string;
  type: 'charge' | 'expense' | 'payment';
  description: string;
  memberOrVendor: string;
  amountCents: number;
};

export default function PortalLedgerPage() {
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const { data: chargesData, isLoading: loadingCharges } = useCharges(currentOrgId, { limit: 500 });
  const { data: expensesData, isLoading: loadingExpenses } = useExpenses(currentOrgId, { limit: 500 });
  const { data: paymentsData, isLoading: loadingPayments } = usePayments(currentOrgId, { limit: 500 });

  const isLoading = loadingCharges || loadingExpenses || loadingPayments;

  const rows = useMemo(() => {
    const result: LedgerRow[] = [];

    for (const c of chargesData?.data || []) {
      const memberName = c.membership?.name || c.membership?.user?.name || 'Unassigned';
      result.push({
        id: `charge-${c.id}`,
        date: c.createdAt as any,
        type: 'charge',
        description: c.title,
        memberOrVendor: memberName,
        amountCents: c.amountCents,
      });
    }

    for (const e of expensesData?.data || []) {
      result.push({
        id: `expense-${e.id}`,
        date: e.date,
        type: 'expense',
        description: e.title,
        memberOrVendor: e.vendor || '-',
        amountCents: e.amountCents,
      });
    }

    for (const p of paymentsData?.data || []) {
      result.push({
        id: `payment-${p.id}`,
        date: p.paidAt as any,
        type: 'payment',
        description: p.memo || 'Payment',
        memberOrVendor: p.rawPayerName || '-',
        amountCents: p.amountCents,
      });
    }

    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return result;
  }, [chargesData, expensesData, paymentsData]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const typeStyles = {
    charge: { label: 'Charge', bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
    expense: { label: 'Expense', bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400' },
    payment: { label: 'Payment', bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ledger</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {rows.length} transaction{rows.length !== 1 ? 's' : ''}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No transactions"
          description="No charges, expenses, or payments have been recorded yet."
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Date</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Type</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3">Description</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Member / Vendor</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const style = typeStyles[row.type];
                  return (
                    <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex px-2 py-0.5 rounded-md text-xs font-medium', style.bg, style.text)}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[200px] truncate">
                        {row.description}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell max-w-[150px] truncate">
                        {row.memberOrVendor}
                      </td>
                      <td className={cn('px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap', style.text)}>
                        {row.type === 'payment' ? '+' : '-'}${(row.amountCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
