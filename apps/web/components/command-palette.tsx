'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  LayoutDashboard,
  Users,
  Receipt,
  CreditCard,
  Mail,
  Settings,
  TrendingDown,
  Table2,
  History,
  LogOut,
  Plus,
  Search,
} from 'lucide-react';
import { useCommandPaletteStore } from '@/lib/stores/command-palette';
import { useLogout } from '@/lib/queries/auth';

export function CommandPalette() {
  const router = useRouter();
  const logout = useLogout();
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const toggle = useCommandPaletteStore((s) => s.toggle);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  const runCommand = (command: () => void) => {
    close();
    command();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-150"
        onClick={close}
      />
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
        <Command
          className="rounded-xl border border-border/50 bg-card shadow-2xl overflow-hidden"
          loop
        >
          <div className="flex items-center gap-2 border-b border-border/50 px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Type a command or search..."
              className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border/50 bg-secondary/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group
              heading="Navigation"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              <CommandItem icon={LayoutDashboard} onSelect={() => runCommand(() => router.push('/dashboard'))}>
                Dashboard
              </CommandItem>
              <CommandItem icon={Users} onSelect={() => runCommand(() => router.push('/members'))}>
                Members
              </CommandItem>
              <CommandItem icon={Receipt} onSelect={() => runCommand(() => router.push('/charges'))}>
                Charges
              </CommandItem>
              <CommandItem icon={TrendingDown} onSelect={() => runCommand(() => router.push('/expenses'))}>
                Expenses
              </CommandItem>
              <CommandItem icon={CreditCard} onSelect={() => runCommand(() => router.push('/payments'))}>
                Payments
              </CommandItem>
              <CommandItem icon={Mail} onSelect={() => runCommand(() => router.push('/payments?tab=review'))}>
                Review Imports
              </CommandItem>
              <CommandItem icon={Table2} onSelect={() => runCommand(() => router.push('/spreadsheet'))}>
                Spreadsheet
              </CommandItem>
              <CommandItem icon={History} onSelect={() => runCommand(() => router.push('/audit'))}>
                Activity
              </CommandItem>
            </Command.Group>

            <Command.Separator className="mx-2 my-1 h-px bg-border/50" />

            <Command.Group
              heading="Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              <CommandItem icon={Plus} onSelect={() => runCommand(() => router.push('/members'))}>
                Create Member
              </CommandItem>
              <CommandItem icon={Plus} onSelect={() => runCommand(() => router.push('/charges/new'))}>
                Create Charge
              </CommandItem>
              <CommandItem icon={Plus} onSelect={() => runCommand(() => router.push('/expenses/new'))}>
                Create Expense
              </CommandItem>
              <CommandItem icon={Plus} onSelect={() => runCommand(() => router.push('/payments/new'))}>
                Create Payment
              </CommandItem>
            </Command.Group>

            <Command.Separator className="mx-2 my-1 h-px bg-border/50" />

            <Command.Group
              heading="Settings"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              <CommandItem icon={Settings} onSelect={() => runCommand(() => router.push('/settings'))}>
                Settings
              </CommandItem>
              <CommandItem
                icon={LogOut}
                onSelect={() =>
                  runCommand(() => {
                    logout();
                    window.location.href = '/login';
                  })
                }
              >
                Sign Out
              </CommandItem>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function CommandItem({
  children,
  icon: Icon,
  onSelect,
}: {
  children: React.ReactNode;
  icon: typeof LayoutDashboard;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer text-muted-foreground transition-colors data-[selected=true]:bg-secondary data-[selected=true]:text-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </Command.Item>
  );
}
