'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const shortcuts = [
  {
    group: 'General',
    items: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
  {
    group: 'Navigation',
    items: [
      { keys: ['g', 'd'], description: 'Go to Dashboard' },
      { keys: ['g', 'm'], description: 'Go to Members' },
      { keys: ['g', 'c'], description: 'Go to Charges' },
      { keys: ['g', 'p'], description: 'Go to Payments' },
      { keys: ['g', 'e'], description: 'Go to Expenses' },
      { keys: ['g', 'r'], description: 'Go to Review' },
      { keys: ['g', 's'], description: 'Go to Spreadsheet' },
      { keys: ['g', 'a'], description: 'Go to Activity' },
    ],
  },
];

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur-xl max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>Navigate quickly with these shortcuts</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {shortcuts.map((group) => (
            <div key={group.group}>
              <h4 className="text-xs font-medium text-muted-foreground mb-2.5 px-1">
                {group.group}
              </h4>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-secondary/50 transition-colors"
                  >
                    <span className="text-foreground">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && (
                            <span className="text-muted-foreground mx-0.5 text-xs">then</span>
                          )}
                          <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border/50 bg-secondary/50 px-1.5 font-mono text-[11px] font-medium text-muted-foreground">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
