'use client';

import { memo, useState } from 'react';
import { AlertCircle, Check, MoreHorizontal, Pencil, Trash2, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { CHARGE_CATEGORY_LABELS } from '@ledgly/shared';
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
import { StaggerItem } from '@/components/ui/page-transition';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChargeCard } from './charge-card';
import type { ChargeGroup } from '@/lib/utils/charge-grouping';

interface ChargeGroupCardProps {
  group: ChargeGroup;
  onEdit: (charge: any) => void;
  onDelete: (charge: any) => void;
  onEditGroup: (group: ChargeGroup) => void;
  onDeleteGroup: (group: ChargeGroup) => void;
  onUnallocate?: (allocation: { id: string; paymentId: string; amountCents: number }, chargeId: string) => void;
  onAllocatePayment?: (charge: any) => void;
  isAdmin?: boolean;
  selectedCharges?: Set<string>;
  onToggleSelect?: (chargeId: string) => void;
  onToggleSelectGroup?: (chargeIds: string[]) => void;
}

export const ChargeGroupCard = memo(function ChargeGroupCard({
  group,
  onEdit,
  onDelete,
  onEditGroup,
  onDeleteGroup,
  onUnallocate,
  onAllocatePayment,
  isAdmin = false,
  selectedCharges,
  onToggleSelect,
  onToggleSelectGroup,
}: ChargeGroupCardProps) {
  const [expanded, setExpanded] = useState(false);

  // If only one charge in group, render as single charge
  if (group.charges.length === 1) {
    return (
      <ChargeCard
        charge={group.charges[0]}
        onEdit={onEdit}
        onDelete={onDelete}
        onUnallocate={onUnallocate}
        onAllocatePayment={onAllocatePayment}
        isAdmin={isAdmin}
        isSelected={selectedCharges?.has(group.charges[0].id)}
        onToggleSelect={onToggleSelect ? () => onToggleSelect(group.charges[0].id) : undefined}
      />
    );
  }

  const isOverdue =
    group.dueDate && new Date(group.dueDate) < new Date();
  const paidCount = group.charges.filter(c => c.status === 'PAID').length;
  const allPaid = paidCount === group.charges.length;
  const balanceDue = group.totalAmount - group.totalPaid;
  const groupChargeIds = group.charges.map(c => c.id);
  const isGroupSelected = selectedCharges
    ? groupChargeIds.every(id => selectedCharges.has(id))
    : false;

  return (
    <StaggerItem>
      <MotionCard
        className={cn(
          onToggleSelectGroup && 'cursor-pointer transition-colors',
          isGroupSelected && 'ring-2 ring-primary/50 bg-primary/5',
        )}
        onClick={onToggleSelectGroup ? () => onToggleSelectGroup(groupChargeIds) : undefined}
      >
        <MotionCardContent className="p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="flex items-center gap-3 text-left flex-1 min-w-0"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-medium truncate" title={group.title}>{group.title}</p>
                  {group.isMultiCharge && (
                    <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                      Multi-charge
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {group.memberCount} members
                  </Badge>
                  {isOverdue && !allPaid && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Overdue
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {CHARGE_CATEGORY_LABELS[group.category as keyof typeof CHARGE_CATEGORY_LABELS]}
                  </Badge>
                  {group.dueDate && (
                    <>
                      <span className="opacity-30">&bull;</span>
                      <span>Due {formatDate(group.dueDate)}</span>
                    </>
                  )}
                  <span className="opacity-30">&bull;</span>
                  <span>{paidCount}/{group.memberCount} paid</span>
                </div>
              </div>
            </button>
            <div className="flex items-center gap-4">
              <div className="text-right space-y-1">
                <div className="flex items-center justify-end gap-2">
                  <Money cents={group.totalAmount} size="sm" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        {allPaid ? (
                          <Check className="w-4 h-4 text-success" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-warning" />
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{allPaid ? 'All Paid' : 'Open'}</TooltipContent>
                  </Tooltip>
                </div>
                {!allPaid && (
                  <p className="text-sm text-destructive">
                    <Money cents={balanceDue} size="xs" inline className="text-destructive" /> due
                  </p>
                )}
              </div>
              {isAdmin ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Group actions" onClick={(e) => e.stopPropagation()}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEditGroup(group)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit All ({group.memberCount})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDeleteGroup(group)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete All ({group.memberCount})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="w-8 h-8" />
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                aria-label={expanded ? 'Collapse group' : 'Expand group'}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
              {group.charges.map((charge) => (
                <ChargeCard
                  key={charge.id}
                  charge={charge}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onUnallocate={onUnallocate}
                  onAllocatePayment={onAllocatePayment}
                  nested
                  isAdmin={isAdmin}
                  isSelected={selectedCharges?.has(charge.id)}
                  onToggleSelect={onToggleSelect ? () => onToggleSelect(charge.id) : undefined}
                />
              ))}
            </div>
          )}
        </MotionCardContent>
      </MotionCard>
    </StaggerItem>
  );
});
