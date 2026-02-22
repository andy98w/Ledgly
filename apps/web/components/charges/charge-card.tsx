import { AlertCircle, MoreHorizontal, Pencil, Trash2, Circle, CheckCircle2 } from 'lucide-react';
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
import { StaggerItem } from '@/components/ui/page-transition';

interface ChargeCardProps {
  charge: any;
  onEdit: (charge: any) => void;
  onDelete: (charge: any) => void;
  nested?: boolean;
  isAdmin?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function ChargeCard({
  charge,
  onEdit,
  onDelete,
  nested = false,
  isAdmin = false,
  isSelected = false,
  onToggleSelect,
}: ChargeCardProps) {
  const isPaid = charge.status === 'PAID';
  const isOverdue =
    !isPaid && charge.dueDate && new Date(charge.dueDate) < new Date();

  const content = (
    <MotionCard className={nested ? 'border-border/30' : ''}>
      <MotionCardContent className="p-4">
        <div className="flex items-center justify-between">
          {isAdmin && onToggleSelect && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect();
              }}
              className="mr-3 flex items-center justify-center transition-colors"
              title={isSelected ? "Deselect" : "Select"}
            >
              {isSelected ? (
                <CheckCircle2 className="w-5 h-5 text-primary" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
              )}
            </button>
          )}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <AvatarGradient
              name={charge.membership?.displayName || 'Unknown'}
              size="sm"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{nested ? charge.membership?.displayName : charge.title}</p>
                {isOverdue && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Overdue
                  </Badge>
                )}
              </div>
              {!nested && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{charge.membership?.displayName}</span>
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
                {isPaid && (
                  <Badge variant="success" className="text-xs">Paid</Badge>
                )}
              </div>
              {!isPaid && (
                <p className="text-sm text-destructive">
                  <Money cents={charge.balanceDueCents} size="xs" inline className="text-destructive" /> due
                </p>
              )}
            </div>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
            )}
          </div>
        </div>
      </MotionCardContent>
    </MotionCard>
  );

  if (nested) {
    return content;
  }

  return <StaggerItem>{content}</StaggerItem>;
}
