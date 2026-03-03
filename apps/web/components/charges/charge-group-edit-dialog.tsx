'use client';

import { useState, useMemo, useEffect } from 'react';
import { Loader2, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { AvatarGradient } from '@/components/ui/avatar-gradient';
import { Badge } from '@/components/ui/badge';
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
  onSave: (addedMemberIds: string[], removedMemberIds: string[]) => void;
  isPending: boolean;
  members?: Array<{ id: string; displayName: string }>;
  currentMemberIds?: string[];
}

export function ChargeGroupEditDialog({
  group,
  editData,
  onEditDataChange,
  onClose,
  onSave,
  isPending,
  members = [],
  currentMemberIds = [],
}: ChargeGroupEditDialogProps) {
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState('');

  // Reset selected members when dialog opens with a new group
  useEffect(() => {
    if (group) {
      setSelectedMembers(new Set(currentMemberIds));
      setMemberSearch('');
    }
  }, [group, currentMemberIds]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const query = memberSearch.toLowerCase();
    return members.filter((m) => m.displayName?.toLowerCase().includes(query));
  }, [members, memberSearch]);

  const toggleMember = (memberId: string) => {
    const next = new Set(selectedMembers);
    if (next.has(memberId)) {
      next.delete(memberId);
    } else {
      next.add(memberId);
    }
    setSelectedMembers(next);
  };

  const addedMemberIds = useMemo(() => {
    const currentSet = new Set(currentMemberIds);
    return Array.from(selectedMembers).filter((id) => !currentSet.has(id));
  }, [selectedMembers, currentMemberIds]);

  const removedMemberIds = useMemo(() => {
    return currentMemberIds.filter((id) => !selectedMembers.has(id));
  }, [selectedMembers, currentMemberIds]);

  const hasMemberChanges = addedMemberIds.length > 0 || removedMemberIds.length > 0;
  const showMemberSection = members.length > 0;

  return (
    <Dialog open={!!group} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={showMemberSection ? 'max-w-2xl max-h-[90vh] overflow-y-auto' : ''}>
        <DialogHeader>
          <DialogTitle>Edit All Charges</DialogTitle>
          <DialogDescription>
            Update {group?.memberCount} charges at once.
          </DialogDescription>
        </DialogHeader>
        {group && (
          <div className="space-y-6 py-4">
            {/* Charge Details */}
            <div className="space-y-4">
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
                <DatePicker
                  value={editData.dueDate || ''}
                  onChange={(date) => onEditDataChange({ ...editData, dueDate: date || null })}
                />
              </div>
            </div>

            {/* Member Selection */}
            {showMemberSection && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium">
                  Members
                  <span className="ml-2 text-muted-foreground font-normal">
                    ({selectedMembers.size} selected)
                  </span>
                  {hasMemberChanges && (
                    <span className="ml-2">
                      {addedMemberIds.length > 0 && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                          +{addedMemberIds.length} new
                        </Badge>
                      )}
                      {removedMemberIds.length > 0 && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs ml-1">
                          -{removedMemberIds.length} removed
                        </Badge>
                      )}
                    </span>
                  )}
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
                <div className="space-y-1 max-h-[250px] overflow-y-auto px-0.5 -mx-0.5">
                  {filteredMembers.map((member) => {
                    const isSelected = selectedMembers.has(member.id);
                    const isExisting = currentMemberIds.includes(member.id);
                    const isNew = isSelected && !isExisting;
                    const isRemoved = !isSelected && isExisting;

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
                          isRemoved && 'border-destructive/30 bg-destructive/5',
                        )}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0',
                            isSelected
                              ? 'bg-primary border-transparent'
                              : 'border-muted-foreground/30',
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <AvatarGradient name={member.displayName} size="sm" />
                        <span className="font-medium flex-1">{member.displayName}</span>
                        {isNew && (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                            New
                          </Badge>
                        )}
                        {isExisting && isSelected && (
                          <span className="text-xs text-muted-foreground">Existing</span>
                        )}
                        {isRemoved && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                            Will remove
                          </Badge>
                        )}
                      </button>
                    );
                  })}

                  {filteredMembers.length === 0 && memberSearch && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No members found matching &ldquo;{memberSearch}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(addedMemberIds, removedMemberIds)}
            disabled={isPending || selectedMembers.size === 0}
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
