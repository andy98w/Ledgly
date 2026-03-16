import { memo } from 'react';
import { AlertCircle, Check, MoreHorizontal, Pencil, Trash2, X, Link2 } from 'lucide-react';
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
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardContent } from '@/components/ui/motion-card';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StaggerItem } from '@/components/ui/page-transition';

interface ChargeCardProps {
  charge: any;
  onEdit: (charge: any) => void;
  onDelete: (charge: any) => void;
  onUnallocate?: (allocation: { id: string; paymentId: string; amountCents: number }, chargeId: string) => void;
  onAllocatePayment?: (charge: any) => void;
  nested?: boolean;
  isAdmin?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const ChargeCard = memo(function ChargeCard({
  charge,
  onEdit,
  onDelete,
  onUnallocate,
  onAllocatePayment,
  nested = false,
  isAdmin = false,
  isSelected = false,
  onToggleSelect,
}: ChargeCardProps) {
  const isPaid = charge.status === 'PAID';
  const isOverdue =
    !isPaid && charge.dueDate && new Date(charge.dueDate) < new Date();
  const allocations = charge.allocations || [];

  const content = (
    <MotionCard
      className={cn(
        nested ? 'border-border/30' : '',
        onToggleSelect && 'cursor-pointer transition-colors',
        isSelected && 'ring-2 ring-primary/50 bg-primary/5',
      )}
      onClick={onToggleSelect ? () => onToggleSelect() : undefined}
    >
      <MotionCardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <AvatarGradient
              name={charge.membership?.displayName || charge.title || 'Unknown'}
              size="sm"
            />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-medium truncate" title={nested ? (charge.membership?.displayName || charge.title) : charge.title}>{nested ? (charge.membership?.displayName || charge.title) : charge.title}</p>
                {isOverdue && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Overdue
                  </Badge>
                )}
              </div>
              {!nested && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                  <span className="truncate" title={charge.membership?.displayName || charge.title}>{charge.membership?.displayName || charge.title}</span>
                  <span className="opacity-30">&bull;</span>
                  <Badge variant="outline" className="text-xs">
                    {CHARGE_CATEGORY_LABELS[charge.category as keyof typeof CHARGE_CATEGORY_LABELS]}
                  </Badge>
                  {charge.dueDate && (
                    <>
                      <span className="opacity-30">&bull;</span>
                      <span>Due {formatDate(charge.dueDate)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right space-y-1">
              <div className="flex items-center justify-end gap-2">
                <Money cents={charge.amountCents} size="sm" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      {isPaid ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-warning" />
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{isPaid ? 'Paid' : 'Open'}</TooltipContent>
                </Tooltip>
              </div>
              {!isPaid && (
                <p className={cn("text-sm", isOverdue ? "text-destructive" : "text-warning")}>
                  <Money cents={charge.balanceDueCents} size="xs" inline className={isOverdue ? "text-destructive" : "text-warning"} /> due
                </p>
              )}
            </div>
            {isAdmin ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Charge actions" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!isPaid && onAllocatePayment && (
                    <DropdownMenuItem onClick={() => onAllocatePayment(charge)}>
                      <Link2 className="h-4 w-4 mr-2" />
                      Match Payment
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onEdit(charge)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(charge)}
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
        {isAdmin && allocations.length > 0 && onUnallocate && (
          <div className="mt-3 pt-3 border-t border-border/30">
            <p className="text-xs text-muted-foreground mb-2">Payments applied:</p>
            <div className="flex flex-wrap gap-1">
              {allocations.map((a: any) => (
                <Badge key={a.id} variant="secondary" className="text-xs gap-1 pr-1 max-w-[50vw]">
                  <span className="truncate">{a.payerName || 'Payment'}</span>: <Money cents={a.amountCents} size="xs" inline />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnallocate({ id: a.id, paymentId: a.paymentId, amountCents: a.amountCents }, charge.id);
                    }}
                    className="ml-0.5 rounded-full p-1.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                    aria-label="Remove allocation"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </MotionCardContent>
    </MotionCard>
  );

  if (nested) {
    return content;
  }

  return <StaggerItem>{content}</StaggerItem>;
});
