'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BatchActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}

export function BatchActionsBar({ selectedCount, onClear, children }: BatchActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 fade-in-0 duration-200" role="toolbar" aria-label={`${selectedCount} items selected`}>
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/90 backdrop-blur-xl px-4 py-2.5 shadow-lg max-w-[calc(100vw-2rem)]">
        <span className="text-sm font-medium whitespace-nowrap">
          {selectedCount} selected
        </span>
        <div className="h-4 w-px bg-border/50" />
        <div className="flex items-center gap-2">
          {children}
        </div>
        <div className="h-4 w-px bg-border/50" />
        <Button variant="ghost" size="sm" onClick={onClear} className="h-9 px-2" aria-label="Clear selection">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
