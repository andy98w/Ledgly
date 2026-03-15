import { useMemo } from 'react';
import type { DashboardStats } from '@ledgly/shared';

export interface AISuggestion {
  type: string;
  message: string;
  action: string;
  count?: number;
  priority: 'high' | 'medium' | 'low';
}

export function useAISuggestions(stats: DashboardStats | undefined): AISuggestion[] {
  return useMemo(() => {
    if (!stats) return [];

    const suggestions: AISuggestion[] = [];

    if (stats.overdueCount > 0) {
      suggestions.push({
        type: 'overdue',
        message: `${stats.overdueCount} charge${stats.overdueCount !== 1 ? 's are' : ' is'} overdue`,
        action: 'Send reminders',
        count: stats.overdueCount,
        priority: 'high',
      });
    }

    const unmatched = stats.recentPayments.filter((p) => p.unallocatedCents > 0);
    if (unmatched.length > 0) {
      const totalUnmatchedCents = unmatched.reduce((sum, p) => sum + p.unallocatedCents, 0);
      suggestions.push({
        type: 'unmatched',
        message: `${unmatched.length} payment${unmatched.length !== 1 ? 's' : ''} need matching`,
        action: 'Auto-match',
        count: unmatched.length,
        priority: totalUnmatchedCents > 10000 ? 'high' : 'medium',
      });
    }

    if (stats.totalOutstandingCents > 10000) {
      const dollars = Math.round(stats.totalOutstandingCents / 100);
      suggestions.push({
        type: 'outstanding',
        message: `$${dollars.toLocaleString()} in unpaid charges`,
        action: 'View details',
        count: stats.openChargesCount,
        priority: stats.totalOutstandingCents > 50000 ? 'high' : 'medium',
      });
    }

    if (stats.openChargesCount > 0 && stats.memberCount > 0) {
      const avgPerMember = stats.totalOutstandingCents / stats.memberCount;
      if (avgPerMember > 10000) {
        suggestions.push({
          type: 'balance',
          message: `Members owe $${Math.round(avgPerMember / 100).toLocaleString()} on average`,
          action: 'View balances',
          priority: 'low',
        });
      }
    }

    return suggestions.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    });
  }, [stats]);
}
