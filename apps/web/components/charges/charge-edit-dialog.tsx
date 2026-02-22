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

export interface EditChargeData {
  id: string;
  title: string;
  amountCents: number;
  dueDate: string | null;
}

interface ChargeEditDialogProps {
  charge: EditChargeData | null;
  onChange: (charge: EditChargeData | null) => void;
  onSave: () => void;
  isPending: boolean;
}

export function ChargeEditDialog({ charge, onChange, onSave, isPending }: ChargeEditDialogProps) {
  return (
    <Dialog open={!!charge} onOpenChange={(open) => !open && onChange(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Charge</DialogTitle>
          <DialogDescription>
            Update the charge details below.
          </DialogDescription>
        </DialogHeader>
        {charge && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={charge.title}
                onChange={(e) => onChange({ ...charge, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={(charge.amountCents / 100).toFixed(2)}
                onChange={(e) => onChange({
                  ...charge,
                  amountCents: Math.round(parseFloat(e.target.value || '0') * 100),
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={charge.dueDate || ''}
                onChange={(e) => onChange({ ...charge, dueDate: e.target.value || null })}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onChange(null)}>
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
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
