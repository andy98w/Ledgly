'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@ledgly/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Money } from '@/components/ui/money';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LineItem {
  title: string;
  amountCents: number;
  vendor?: string;
}

interface MultiExpenseCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    category: ExpenseCategory;
    title: string;
    date: string;
    vendor?: string;
    children: LineItem[];
  }) => void;
  isPending: boolean;
}

export function MultiExpenseCreateDialog({
  open,
  onClose,
  onCreate,
  isPending,
}: MultiExpenseCreateDialogProps) {
  const [formData, setFormData] = useState({
    category: 'OTHER' as ExpenseCategory,
    title: '',
    date: new Date().toISOString().split('T')[0],
    vendor: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { title: '', amountCents: 0 },
    { title: '', amountCents: 0 },
  ]);

  const totalCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

  const reset = () => {
    setFormData({ category: 'OTHER', title: '', date: new Date().toISOString().split('T')[0], vendor: '' });
    setLineItems([{ title: '', amountCents: 0 }, { title: '', amountCents: 0 }]);
    onClose();
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { title: '', amountCents: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 2) return;
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(lineItems.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleSubmit = () => {
    const validItems = lineItems.filter(item => item.title && item.amountCents > 0);
    if (validItems.length < 2) return;

    onCreate({
      category: formData.category,
      title: formData.title,
      date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString(),
      vendor: formData.vendor || undefined,
      children: validItems,
    });
    reset();
  };

  const validItemCount = lineItems.filter(item => item.title && item.amountCents > 0).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Multi-Expense</DialogTitle>
          <DialogDescription>
            Group multiple expense line items under one entry.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* Shared Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Expense Details</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v as ExpenseCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  placeholder="e.g., Event Supplies"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker
                  value={formData.date}
                  onChange={(date) => setFormData({ ...formData, date })}
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor (optional)</Label>
                <Input
                  placeholder="Vendor name"
                  value={formData.vendor}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                Line Items
                <span className="ml-2 text-muted-foreground font-normal">
                  ({validItemCount} items)
                </span>
              </h3>
              <div className="text-sm font-medium">
                Total: <Money cents={totalCents} size="sm" inline />
              </div>
            </div>

            <div className="space-y-2">
              {lineItems.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Item title"
                    value={item.title}
                    onChange={(e) => updateLineItem(index, 'title', e.target.value)}
                    className="flex-1"
                  />
                  <div className="relative w-28">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={item.amountCents ? (item.amountCents / 100).toFixed(2) : ''}
                      onChange={(e) => updateLineItem(index, 'amountCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                      className="pl-7"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => removeLineItem(index)}
                    disabled={lineItems.length <= 2}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={addLineItem} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Line Item
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={reset}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || validItemCount < 2 || !formData.title}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Multi-Expense'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
