'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { useCreatePayment, useDeletePayment, useRestorePayment } from '@/lib/queries/payments';
import { useMembers } from '@/lib/queries/members';
import { useAuthStore } from '@/lib/stores/auth';
import { parseCents } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { FadeIn } from '@/components/ui/page-transition';

const schema = z.object({
  membershipId: z.string().optional(),
  amount: z.string().min(1, 'Amount is required'),
  paidAt: z.string().min(1, 'Date is required'),
  rawPayerName: z.string().optional(),
  memo: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewPaymentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const createPayment = useCreatePayment();
  const deletePayment = useDeletePayment();
  const restorePayment = useRestorePayment();
  const { data: membersData } = useMembers(currentOrgId, { status: 'ACTIVE', limit: 100 });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      paidAt: new Date().toISOString().split('T')[0],
    },
  });

  const membershipId = watch('membershipId');

  const onSubmit = async (data: FormData) => {
    if (!currentOrgId) return;

    try {
      const created: any = await createPayment.mutateAsync({
        orgId: currentOrgId,
        data: {
          membershipId: data.membershipId || undefined,
          amountCents: parseCents(data.amount),
          paidAt: new Date(data.paidAt).toISOString(),
          rawPayerName: data.rawPayerName || undefined,
          memo: data.memo || undefined,
        },
      });
      const createdId = created?.id;
      toast({
        title: 'Payment recorded',
        action: createdId ? (
          <button
            onClick={() => deletePayment.mutate(
              { orgId: currentOrgId!, paymentId: createdId },
              {
                onSuccess: () => toast({
                  title: 'Payment deleted',
                  action: (
                    <button
                      onClick={() => restorePayment.mutate(
                        { orgId: currentOrgId!, paymentId: createdId },
                        { onSuccess: () => toast({ title: 'Payment restored' }) },
                      )}
                      className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
                    >
                      Redo
                    </button>
                  ),
                }),
                onError: () => toast({ title: 'Failed to undo', variant: 'destructive' }),
              },
            )}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-border/50 bg-secondary/50 hover:bg-secondary transition-colors"
          >
            Undo
          </button>
        ) : undefined,
      });
      router.push('/payments');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to record payment',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-8">
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
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-success to-emerald-400 flex items-center justify-center shadow-lg">
              <CreditCard className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Record Payment</h1>
              <p className="text-muted-foreground">Manually record a payment received</p>
            </div>
          </div>
        </div>
      </FadeIn>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <FadeIn delay={0.1}>
          <MotionCard hover={false}>
            <MotionCardHeader>
              <MotionCardTitle>Payment Details</MotionCardTitle>
            </MotionCardHeader>
            <MotionCardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="membershipId" className="text-sm font-medium">Member (optional)</Label>
                <Select
                  value={membershipId || 'none'}
                  onValueChange={(value) => setValue('membershipId', value === 'none' ? undefined : value)}
                >
                  <SelectTrigger className="h-11 bg-secondary/30 border-border/50">
                    <SelectValue placeholder="Select member or leave blank" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unknown / Other</SelectItem>
                    {membersData?.data.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <AvatarGradient name={member.displayName} size="xs" />
                          {member.displayName}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  If you don't know the member yet, leave blank and allocate later
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm font-medium">Amount *</Label>
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
                  <Label htmlFor="paidAt" className="text-sm font-medium">Date *</Label>
                  <Input
                    id="paidAt"
                    type="date"
                    className="h-11 bg-secondary/30 border-border/50 focus:border-primary"
                    {...register('paidAt')}
                  />
                  {errors.paidAt && (
                    <p className="text-sm text-destructive">{errors.paidAt.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rawPayerName" className="text-sm font-medium">Payer Name</Label>
                <Input
                  id="rawPayerName"
                  placeholder="Name as shown on Venmo/Zelle"
                  className="h-11 bg-secondary/30 border-border/50 focus:border-primary"
                  {...register('rawPayerName')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="memo" className="text-sm font-medium">Memo / Note</Label>
                <Input
                  id="memo"
                  placeholder="e.g., Spring dues, Event ticket"
                  className="h-11 bg-secondary/30 border-border/50 focus:border-primary"
                  {...register('memo')}
                />
              </div>
            </MotionCardContent>
          </MotionCard>
        </FadeIn>

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
              disabled={createPayment.isPending}
              className="bg-gradient-to-r from-success to-emerald-400 hover:opacity-90 transition-opacity"
            >
              {createPayment.isPending ? 'Recording...' : 'Record Payment'}
            </Button>
          </div>
        </FadeIn>
      </form>
    </div>
  );
}
