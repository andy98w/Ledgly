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

interface ChargeDeleteDialogProps {
  charge: any | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function ChargeDeleteDialog({ charge, onClose, onConfirm, isPending }: ChargeDeleteDialogProps) {
  return (
    <Dialog open={!!charge} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Charge</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this charge? This will remove the charge and any payment matches.
          </DialogDescription>
        </DialogHeader>
        {charge && (
          <div className="py-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="font-medium">{charge.title}</p>
              <p className="text-sm text-muted-foreground">
                {charge.membership?.displayName} &bull; <Money cents={charge.amountCents} size="xs" inline />
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
              'Delete Charge'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
