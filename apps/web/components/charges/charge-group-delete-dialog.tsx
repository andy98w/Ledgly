'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChargeGroup } from '@/lib/utils/charge-grouping';

interface ChargeGroupDeleteDialogProps {
  group: ChargeGroup | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function ChargeGroupDeleteDialog({ group, onClose, onConfirm, isPending }: ChargeGroupDeleteDialogProps) {
  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete All Charges</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {group?.memberCount} charges? This will remove all charges in this group.
          </DialogDescription>
        </DialogHeader>
        {group && (
          <div className="py-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="font-medium">{group.title}</p>
              <p className="text-sm text-muted-foreground">
                {group.memberCount} members &bull; <Money cents={group.totalAmount} size="xs" inline /> total
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              `Delete ${group?.memberCount} Charges`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
