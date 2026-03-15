'use client';

import { useState, useMemo } from 'react';
import { Search, Loader2, Check, Plus, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHARGE_CATEGORIES, CHARGE_CATEGORY_LABELS, type ChargeCategory } from '@ledgly/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { ChargeTemplates, type ChargeTemplate } from '@/components/charges/charge-templates';

interface ChargeCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    category: ChargeCategory;
    title: string;
    amount: string;
    dueDate: string;
    membershipIds: string[];
  }) => void;
  members: Array<{ id: string; displayName: string }>;
  loadingMembers: boolean;
  isPending: boolean;
  onAddMember?: (name: string) => Promise<{ id: string; displayName: string } | null>;
  isAddingMember?: boolean;
  recentCharges?: Array<{ category: string; amountCents: number; title: string }>;
}

export function ChargeCreateDialog({
  open,
  onClose,
  onCreate,
  members,
  loadingMembers,
  isPending,
  onAddMember,
  isAddingMember,
  recentCharges,
}: ChargeCreateDialogProps) {
  const [step, setStep] = useState<'template' | 'form'>('template');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [formData, setFormData] = useState({
    category: 'DUES' as ChargeCategory,
    title: '',
    amount: '',
    dueDate: '',
  });

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const query = memberSearch.toLowerCase();
    return members.filter((m) => m.displayName?.toLowerCase().includes(query));
  }, [members, memberSearch]);

  const toggleMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
    setSelectAll(newSelected.size === members.length);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedMembers(new Set());
      setSelectAll(false);
    } else {
      setSelectedMembers(new Set(members.map((m) => m.id)));
      setSelectAll(true);
    }
  };

  const reset = () => {
    setStep('template');
    setSelectedMembers(new Set());
    setSelectAll(false);
    setMemberSearch('');
    setShowAddMember(false);
    setNewMemberName('');
    setFormData({ category: 'DUES', title: '', amount: '', dueDate: '' });
    onClose();
  };

  const handleSelectTemplate = (template: ChargeTemplate) => {
    setFormData({
      category: template.category,
      title: template.title,
      amount: template.suggestedAmountCents
        ? (template.suggestedAmountCents / 100).toFixed(2)
        : '',
      dueDate: '',
    });
    setStep('form');
  };

  const handleCustom = () => {
    setFormData({ category: 'DUES', title: '', amount: '', dueDate: '' });
    setStep('form');
  };

  const handleAddMember = async () => {
    if (!onAddMember || !newMemberName.trim()) return;
    const result = await onAddMember(newMemberName.trim());
    if (result) {
      setSelectedMembers((prev) => { const next = new Set(Array.from(prev)); next.add(result.id); return next; });
      setNewMemberName('');
      setShowAddMember(false);
    }
  };

  const handleSubmit = () => {
    onCreate({
      ...formData,
      membershipIds: Array.from(selectedMembers),
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && reset()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'form' && (
              <button
                type="button"
                onClick={() => setStep('template')}
                className="rounded-lg p-1 -ml-1 hover:bg-secondary/50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            Create Charge
          </DialogTitle>
          <DialogDescription>
            {step === 'template'
              ? 'Choose a template or start from scratch'
              : 'Charge dues, fees, or fines to members'}
          </DialogDescription>
        </DialogHeader>

        {step === 'template' ? (
          <div className="py-4">
            <ChargeTemplates
              charges={recentCharges}
              onSelect={handleSelectTemplate}
              onCustom={handleCustom}
            />
          </div>
        ) : (
          <>
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="text-sm font-medium">Charge Details</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="charge-category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(v) => setFormData({ ...formData, category: v as ChargeCategory })}
                    >
                      <SelectTrigger id="charge-category">
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
                    <Label htmlFor="charge-title">Title</Label>
                    <Input
                      id="charge-title"
                      placeholder="e.g., Spring 2025 Dues"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="charge-amount">Amount ($)</Label>
                    <Input
                      id="charge-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date (optional)</Label>
                    <DatePicker
                      value={formData.dueDate}
                      onChange={(date) => setFormData({ ...formData, dueDate: date })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium">
                  Select Members
                  <span className="ml-2 text-muted-foreground font-normal">
                    ({selectedMembers.size} selected)
                  </span>
                </h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    placeholder="Search members..."
                    aria-label="Search members"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {onAddMember && (
                  showAddMember ? (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="New member name"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                        autoFocus
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddMember}
                        disabled={!newMemberName.trim() || isAddingMember}
                      >
                        {isAddingMember ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Add'
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowAddMember(false); setNewMemberName(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddMember(true)}
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add new member
                    </button>
                  )
                )}

                {loadingMembers ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No active members. Add members first.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto px-0.5 -mx-0.5">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      aria-pressed={selectAll}
                      aria-label={selectAll ? 'Deselect all members' : 'Select all members'}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
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
                      <span className="text-xs text-muted-foreground ml-auto">{members.length}</span>
                    </button>

                    {filteredMembers.map((member) => {
                      const isSelected = selectedMembers.has(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => toggleMember(member.id)}
                          aria-pressed={isSelected}
                          aria-label={`${isSelected ? 'Deselect' : 'Select'} ${member.displayName}`}
                          className={cn(
                            'flex items-center gap-3 p-3 rounded-xl border text-left transition-all w-full',
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
                      );
                    })}

                    {filteredMembers.length === 0 && memberSearch && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No members found matching &ldquo;{memberSearch}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isPending || selectedMembers.size === 0}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Charge'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
