'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChargeGroup } from '@/lib/utils/charge-grouping';

interface GroupEditData {
  title: string;
  amountCents: number;
  dueDate: string | null;
}

interface ChargeGroupEditDialogProps {
  group: ChargeGroup | null;
  editData: GroupEditData;
  onEditDataChange: (data: GroupEditData) => void;
  onClose: () => void;
  onSave: () => void;
  isPending: boolean;
}

export function ChargeGroupEditDialog({
  group,
  editData,
  onEditDataChange,
  onClose,
  onSave,
  isPending,
}: ChargeGroupEditDialogProps) {
  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit All Charges</DialogTitle>
          <DialogDescription>
            Update {group?.memberCount} charges at once.
          </DialogDescription>
        </DialogHeader>
        {group && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-title">Title</Label>
              <Input
                id="group-title"
                value={editData.title}
                onChange={(e) => onEditDataChange({ ...editData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-amount">Amount ($)</Label>
              <Input
                id="group-amount"
                type="number"
                step="0.01"
                value={(editData.amountCents / 100).toFixed(2)}
                onChange={(e) => onEditDataChange({
                  ...editData,
                  amountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-dueDate">Due Date</Label>
              <Input
                id="group-dueDate"
                type="date"
                value={editData.dueDate || ''}
                onChange={(e) => onEditDataChange({ ...editData, dueDate: e.target.value || null })}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={isPending}
            className="bg-gradient-to-r from-primary to-blue-400"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              `Update ${group?.memberCount} Charges`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
