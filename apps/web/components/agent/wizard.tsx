'use client';

import { ChevronLeft, Plus, Eye, Trash2, Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// ── Types ────────────────────────────────────────────────────

export type WizardActionId = 'create' | 'view' | 'edit' | 'remove';
export type WizardEntityId = 'members' | 'charges' | 'expenses' | 'payments' | 'balances';

// ── Config ───────────────────────────────────────────────────

export const WIZARD_ACTIONS: { id: WizardActionId; label: string; icon: typeof Plus }[] = [
  { id: 'create', label: 'Create', icon: Plus },
  { id: 'view', label: 'View', icon: Eye },
  { id: 'edit', label: 'Edit', icon: Pencil },
  { id: 'remove', label: 'Remove / Void', icon: Trash2 },
];

export const WIZARD_ENTITIES: { id: WizardEntityId; label: string; actions: WizardActionId[] }[] = [
  { id: 'members', label: 'Members', actions: ['create', 'view', 'edit', 'remove'] },
  { id: 'charges', label: 'Dues & Fees', actions: ['create', 'view', 'edit', 'remove'] },
  { id: 'expenses', label: 'Expenses', actions: ['create', 'edit'] },
  { id: 'payments', label: 'Payments', actions: ['create', 'view'] },
  { id: 'balances', label: 'Balances', actions: ['view'] },
];

export const WIZARD_TEMPLATES: Record<string, string> = {
  'create-members': `Add members:\n- \n(e.g. "John Smith, john@email.com, Treasurer")`,
  'create-charges': `Charge members:\n- \n(e.g. "Spring Dues, $50, all active members, due Apr 1")`,
  'create-expenses': `Record expenses:\n- \n(e.g. "Office supplies, $120, Operations, Mar 1"\nor multi-expense: "Party Supplies: cups $15, plates $20, napkins $8")`,
  'create-payments': `Record payments:\n- \n(e.g. "John Smith, $50, Mar 1, Venmo")`,
  'view-members': 'Show me all active members and their current balances',
  'view-charges': 'Show me all unpaid charges',
  'view-payments': 'Show me recent payments',
  'view-balances': 'Give me a summary of all member balances',
  'edit-members': `Edit member:\n[member details]`,
  'edit-charges': `Edit charge:\n[charge details]`,
  'edit-expenses': `Edit expense:\n[expense details]`,
  'remove-members': `Remove members:\n[member names]`,
  'remove-charges': `Delete charges:\n[charge titles]`,
};

// ── QuickActionPopover ───────────────────────────────────────

export function QuickActionPopover({
  wizardAction,
  open,
  onOpenChange,
  onSelectAction,
  onSelectEntity,
  onBack,
  children,
}: {
  wizardAction: WizardActionId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAction: (action: WizardActionId) => void;
  onSelectEntity: (entity: WizardEntityId) => void;
  onBack: () => void;
  children: React.ReactNode;
}) {
  const filteredEntities = wizardAction
    ? WIZARD_ENTITIES.filter((e) => e.actions.includes(wizardAction))
    : [];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-auto p-2 z-[60]" sideOffset={8}>
        <div className="flex items-center gap-1.5">
          {!wizardAction ? (
            WIZARD_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => onSelectAction(action.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              );
            })
          ) : (
            <>
              {filteredEntities.map((entity) => (
                <button
                  key={entity.id}
                  onClick={() => onSelectEntity(entity.id)}
                  className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  {entity.label}
                </button>
              ))}
              <button
                onClick={onBack}
                className="inline-flex items-center rounded-lg p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors ml-0.5"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
