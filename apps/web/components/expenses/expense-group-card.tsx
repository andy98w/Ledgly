'use client';

import { memo, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2, ChevronDown, ChevronRight, Layers, Circle, CheckCircle2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@ledgly/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Money } from '@/components/ui/money';
import { MotionCard, MotionCardContent } from '@/components/ui/motion-card';
import { AvatarGradient } from '@/components/ui/avatar-gradient';

const categoryColors: Record<string, string> = {
  EVENT: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  SUPPLIES: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  FOOD: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  VENUE: 'bg-green-500/10 text-green-400 border-green-500/30',
  MARKETING: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  SERVICES: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  OTHER: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

interface ExpenseGroupCardProps {
  expense: any;
  onEdit: (expense: any) => void;
  onDelete: (expense: any) => void;
  isAdmin?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const ExpenseGroupCard = memo(function ExpenseGroupCard({
  expense,
  onEdit,
  onDelete,
  isAdmin = false,
  isSelected = false,
  onToggleSelect,
}: ExpenseGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const children = expense.children || [];

  return (
    <MotionCard>
      <MotionCardContent className="p-4">
        <div className="flex items-center justify-between">
          {isAdmin && onToggleSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
              className="mr-3 flex items-center justify-center transition-colors shrink-0"
              aria-label={isSelected ? 'Deselect expense group' : 'Select expense group'}
              aria-pressed={isSelected}
            >
              {isSelected ? (
                <CheckCircle2 className="w-5 h-5 text-primary" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
              )}
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-4 text-left flex-1 min-w-0"
          >
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 space-y-1 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-medium truncate" title={expense.title}>{expense.title}</p>
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                  Multi-expense
                </Badge>
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
                    <span className="opacity-30">&bull;</span>
                    <span>{expense.vendor}</span>
                  </>
                )}
                <span className="opacity-30">&bull;</span>
                <span>{children.length} items</span>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-3">
            <Money cents={expense.amountCents} size="sm" className="text-destructive" />
            {isAdmin ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Group actions">
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
                    Delete All
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="w-8 h-8" />
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
            {children.map((child: any) => (
              <div
                key={child.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/20"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarGradient name={child.vendor || child.title} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{child.title}</p>
                    {child.vendor && child.vendor !== child.title && (
                      <p className="text-xs text-muted-foreground">{child.vendor}</p>
                    )}
                  </div>
                </div>
                <Money cents={child.amountCents} size="xs" className="text-destructive" />
              </div>
            ))}
          </div>
        )}
      </MotionCardContent>
    </MotionCard>
  );
});
