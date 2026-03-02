'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Receipt } from 'lucide-react';
import { useCreateExpense, useDeleteExpense, useRestoreExpense } from '@/lib/queries/expenses';
import { useAuthStore } from '@/lib/stores/auth';
import { parseCents } from '@/lib/utils';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@ledgly/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { FadeIn } from '@/components/ui/page-transition';
import { ToastUndoButton } from '@/components/ui/toast-undo-button';
import { Breadcrumb } from '@/components/ui/breadcrumb';

const schema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional(),
  amount: z.string().min(1, 'Amount is required'),
  date: z.string().min(1, 'Date is required'),
  vendor: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewExpensePage() {
  const router = useRouter();
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const restoreExpense = useRestoreExpense();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'OTHER',
      date: new Date().toISOString().split('T')[0],
    },
  });

  const category = watch('category');

  const onSubmit = async (data: FormData) => {
    if (!currentOrgId) return;

    try {
      const created = await createExpense.mutateAsync({
        orgId: currentOrgId,
        data: {
          category: data.category,
          title: data.title,
          description: data.description,
          amountCents: parseCents(data.amount),
          date: data.date,
          vendor: data.vendor,
        },
      });

      const createdId = (created as any)?.id;
      toast({
        title: 'Expense created',
        action: createdId ? (
          <ToastUndoButton
            onClick={() => deleteExpense.mutate(
              { orgId: currentOrgId!, expenseId: createdId },
              {
                onSuccess: () => toast({
                  title: 'Expense deleted',
                  action: (
                    <ToastUndoButton
                      onClick={() => restoreExpense.mutate(
                        { orgId: currentOrgId!, expenseId: createdId },
                        { onSuccess: () => toast({ title: 'Expense restored' }) },
                      )}
                      label="Redo"
                    />
                  ),
                }),
                onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
              },
            )}
          />
        ) : undefined,
      });
      router.push('/expenses');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create expense',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: 'Expenses', href: '/expenses' }, { label: 'New Expense' }]} />

      {/* Header */}
      <FadeIn>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="rounded-xl hover:bg-secondary/50"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-destructive to-red-400 flex items-center justify-center shadow-lg glow-sm">
              <Receipt className="h-6 w-6 text-destructive-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Add Expense</h1>
              <p className="text-muted-foreground">Record organization spending</p>
            </div>
          </div>
        </div>
      </FadeIn>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <FadeIn delay={0.1}>
          <MotionCard hover={false}>
            <MotionCardHeader>
              <MotionCardTitle>Expense Details</MotionCardTitle>
            </MotionCardHeader>
            <MotionCardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-medium">Category</Label>
                  <Select
                    value={category}
                    onValueChange={(value) => setValue('category', value as any)}
                  >
                    <SelectTrigger className="h-11 bg-secondary/30 border-border/50">
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
                  <Label htmlFor="title" className="text-sm font-medium">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Event decorations"
                    className="h-11 bg-secondary/30 border-border/50 focus:border-primary"
                    {...register('title')}
                  />
                  {errors.title && (
                    <p className="text-sm text-destructive">{errors.title.message}</p>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm font-medium">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                      $
                    </span>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="pl-7 h-11 bg-secondary/30 border-border/50 focus:border-primary"
                      {...register('amount')}
                    />
                  </div>
                  {errors.amount && (
                    <p className="text-sm text-destructive">{errors.amount.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-sm font-medium">Date</Label>
                  <DatePicker
                    value={watch('date')}
                    onChange={(date) => setValue('date', date)}
                    className="h-11"
                  />
                  {errors.date && (
                    <p className="text-sm text-destructive">{errors.date.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendor" className="text-sm font-medium">Vendor (optional)</Label>
                <Input
                  id="vendor"
                  placeholder="e.g., Party City"
                  className="h-11 bg-secondary/30 border-border/50 focus:border-primary"
                  {...register('vendor')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Additional details about this expense..."
                  className="bg-secondary/30 border-border/50 focus:border-primary min-h-[100px]"
                  {...register('description')}
                />
              </div>
            </MotionCardContent>
          </MotionCard>
        </FadeIn>

        {/* Submit */}
        <FadeIn delay={0.2}>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="border-border/50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createExpense.isPending}
              className="hover:opacity-90 transition-opacity"
            >
              {createExpense.isPending ? 'Creating...' : 'Add Expense'}
            </Button>
          </div>
        </FadeIn>
      </form>
    </div>
  );
}
