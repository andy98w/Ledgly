'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Check, Receipt, Search } from 'lucide-react';
import { useCreateCharge } from '@/lib/queries/charges';
import { useMembers } from '@/lib/queries/members';
import { useAutoAllocateToCharge } from '@/lib/queries/payments';
import { formatCents } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth';
import { parseCents } from '@/lib/utils';
import { CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS } from '@ledgly/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { MotionCard, MotionCardContent, MotionCardHeader, MotionCardTitle } from '@/components/ui/motion-card';
import { FadeIn, StaggerChildren, StaggerItem } from '@/components/ui/page-transition';
import { Breadcrumb } from '@/components/ui/breadcrumb';

const schema = z.object({
  category: z.enum(CHARGE_CATEGORIES),
  title: z.string().min(1, 'Title is required').max(200),
  amount: z.string().min(1, 'Amount is required'),
  dueDate: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewChargePage() {
  const router = useRouter();
  const { toast } = useToast();
  const currentOrgId = useAuthStore((s) => s.currentOrgId);
  const createCharge = useCreateCharge();
  const autoAllocate = useAutoAllocateToCharge();
  const { data: membersData, isLoading: loadingMembers } = useMembers(currentOrgId, {
    status: 'ACTIVE',
    limit: 100,
  });

  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const isSubmittingRef = useRef(false);

  const filteredMembers = useMemo(() => {
    if (!membersData?.data) return [];
    if (!memberSearch.trim()) return membersData.data;
    const query = memberSearch.toLowerCase();
    return membersData.data.filter((m) =>
      m.displayName?.toLowerCase().includes(query)
    );
  }, [membersData?.data, memberSearch]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'DUES',
    },
  });

  const category = watch('category');

  const toggleMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
    setSelectAll(newSelected.size === (membersData?.data.length || 0));
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedMembers(new Set());
      setSelectAll(false);
    } else {
      setSelectedMembers(new Set(membersData?.data.map((m) => m.id) || []));
      setSelectAll(true);
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!currentOrgId) return;

    // Prevent double-click submissions
    if (isSubmittingRef.current || createCharge.isPending) return;

    if (selectedMembers.size === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one member',
        variant: 'destructive',
      });
      return;
    }

    isSubmittingRef.current = true;

    try {
      const charges = await createCharge.mutateAsync({
        orgId: currentOrgId,
        data: {
          membershipIds: Array.from(selectedMembers),
          category: data.category,
          title: data.title,
          amountCents: parseCents(data.amount),
          dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : undefined,
        },
      });

      // Try to auto-allocate for each charge
      let totalAllocated = 0;
      const chargeArray = Array.isArray(charges) ? charges : [charges];

      for (const charge of chargeArray) {
        try {
          const result = await autoAllocate.mutateAsync({
            orgId: currentOrgId,
            chargeId: charge.id,
          });
          totalAllocated += result.allocatedCents || 0;
        } catch {
          // Ignore allocation errors, just means no unallocated payments
        }
      }

      if (totalAllocated > 0) {
        toast({
          title: 'Charge created successfully',
          description: `Auto-allocated ${formatCents(totalAllocated)} from existing payments`,
        });
      } else {
        toast({ title: 'Charge created successfully' });
      }

      router.push('/charges');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create charge',
        variant: 'destructive',
      });
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: 'Charges', href: '/charges' }, { label: 'New Charge' }]} />

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
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
              <Receipt className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Create Charge</h1>
              <p className="text-muted-foreground">Charge dues, fees, or fines to members</p>
            </div>
          </div>
        </div>
      </FadeIn>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Charge Details */}
        <FadeIn delay={0.1}>
          <MotionCard hover={false}>
            <MotionCardHeader>
              <MotionCardTitle>Charge Details</MotionCardTitle>
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
                      {CHARGE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CHARGE_CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-medium">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Spring 2025 Dues"
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
                  <Label htmlFor="dueDate" className="text-sm font-medium">Due Date (optional)</Label>
                  <DatePicker
                    value={watch('dueDate')}
                    onChange={(date) => setValue('dueDate', date)}
                    className="h-11"
                  />
                </div>
              </div>
            </MotionCardContent>
          </MotionCard>
        </FadeIn>

        {/* Select Members */}
        <FadeIn delay={0.2}>
          <MotionCard hover={false}>
            <MotionCardHeader>
              <MotionCardTitle>
                Select Members
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({selectedMembers.size} selected)
                </span>
              </MotionCardTitle>
            </MotionCardHeader>
            <MotionCardContent className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9 h-10 bg-secondary/30 border-border/50"
                />
              </div>

              {loadingMembers ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : membersData?.data.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No active members. Add members first.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Select All Row */}
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full hover:scale-[1.005] active:scale-[0.995] transition-transform',
                      selectAll
                        ? 'border-primary bg-primary/10'
                        : 'border-border/50 hover:bg-secondary/50',
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                        selectAll
                          ? 'bg-primary border-transparent'
                          : 'border-muted-foreground/30',
                      )}
                    >
                      {selectAll && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className="font-medium text-muted-foreground">All Members</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {membersData?.data.length}
                    </span>
                  </button>

                  {/* Member Rows */}
                  <StaggerChildren className="space-y-1">
                    {filteredMembers.map((member) => {
                      const isSelected = selectedMembers.has(member.id);
                      return (
                        <StaggerItem key={member.id}>
                          <button
                            type="button"
                            onClick={() => toggleMember(member.id)}
                            className={cn(
                              'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full hover:scale-[1.005] active:scale-[0.995] transition-transform',
                              isSelected
                                ? 'border-primary bg-primary/10'
                                : 'border-border/50 hover:bg-secondary/50',
                            )}
                          >
                            <div
                              className={cn(
                                'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                                isSelected
                                  ? 'bg-primary border-transparent'
                                  : 'border-muted-foreground/30',
                              )}
                            >
                              {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                            <AvatarGradient name={member.displayName} size="sm" />
                            <span className="font-medium">{member.displayName}</span>
                          </button>
                        </StaggerItem>
                      );
                    })}
                  </StaggerChildren>

                  {filteredMembers.length === 0 && memberSearch && (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">
                        No members found matching "{memberSearch}"
                      </p>
                    </div>
                  )}
                </div>
              )}
            </MotionCardContent>
          </MotionCard>
        </FadeIn>

        {/* Submit */}
        <FadeIn delay={0.3}>
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
              disabled={createCharge.isPending || selectedMembers.size === 0}
              className="hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createCharge.isPending ? 'Creating...' : 'Create Charge'}
            </Button>
          </div>
        </FadeIn>
      </form>
    </div>
  );
}
