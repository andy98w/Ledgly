'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TOUR_STORAGE_KEY = 'ledgly-tour-completed';

interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const DASHBOARD_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar-nav"]',
    title: 'Navigation',
    content: 'Navigate between pages — Members, Charges, Payments, Spreadsheet, AI Agent, and more.',
    placement: 'right',
  },
  {
    target: '[data-tour="dashboard-stats"]',
    title: 'Financial overview',
    content: 'Your key metrics at a glance — unpaid dues, collections, member count, and overdue items.',
    placement: 'bottom',
  },
];

const PAGE_STEPS: Record<string, TourStep[]> = {
  '/members': [{
    target: '[data-tour="members-list"]',
    title: 'Members',
    content: 'Manage your organization members. Add individually, import from CSV, or use LedgelyAI.',
    placement: 'top',
  }],
  '/charges': [{
    target: '[data-tour="charges-list"]',
    title: 'Charges',
    content: 'Create and track dues, fees, and charges. Assign to individuals or the whole org.',
    placement: 'top',
  }],
  '/payments': [{
    target: '[data-tour="payments-list"]',
    title: 'Payments',
    content: 'Track payments from Venmo, Zelle, bank sync, or manual entry. Auto-matched to members.',
    placement: 'top',
  }],
  '/spreadsheet': [{
    target: '[data-tour="spreadsheet-view"]',
    title: 'Spreadsheet',
    content: 'Your full ledger in one view. Sort, filter, inline-edit, and export to CSV.',
    placement: 'top',
  }],
  '/agent': [{
    target: '[data-tour="agent-chat"]',
    title: 'LedgelyAI',
    content: 'Manage finances with natural language. Try "charge everyone $50 for dues" or "who hasn\'t paid?"',
    placement: 'left',
  }],
};

function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.querySelector(step.target);
    if (!target || !ref.current) return;

    const rect = target.getBoundingClientRect();
    const tooltip = ref.current;
    const placement = step.placement || 'bottom';

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'bottom':
        top = rect.bottom + 12;
        left = rect.left + rect.width / 2;
        break;
      case 'top':
        top = rect.top - 12;
        left = rect.left + rect.width / 2;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + 12;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - 12;
        break;
    }

    tooltip.style.position = 'fixed';
    tooltip.style.zIndex = '10001';

    if (placement === 'top') {
      tooltip.style.top = 'auto';
      tooltip.style.bottom = `${window.innerHeight - top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.style.transform = 'translateX(-50%)';
    } else if (placement === 'bottom') {
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.style.transform = 'translateX(-50%)';
    } else if (placement === 'right') {
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.style.transform = 'translateY(-50%)';
    } else {
      tooltip.style.top = `${top}px`;
      tooltip.style.left = 'auto';
      tooltip.style.right = `${window.innerWidth - left}px`;
      tooltip.style.transform = 'translateY(-50%)';
    }

    // Highlight target
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    (target as HTMLElement).style.position = 'relative';
    (target as HTMLElement).style.zIndex = '10000';

    return () => {
      (target as HTMLElement).style.position = '';
      (target as HTMLElement).style.zIndex = '';
    };
  }, [step]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[9999]" onClick={onSkip} />
      <div
        ref={ref}
        className="bg-card border rounded-xl shadow-lg p-4 max-w-xs z-[10001] animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-sm">{step.title}</h3>
          <button onClick={onSkip} className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{step.content}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{stepIndex + 1} of {totalSteps}</span>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <Button size="sm" variant="ghost" onClick={onPrev} className="h-7 text-xs">
                <ChevronLeft className="h-3 w-3 mr-1" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={onNext} className="h-7 text-xs">
              {stepIndex === totalSteps - 1 ? 'Done' : 'Next'}
              {stepIndex < totalSteps - 1 && <ChevronRight className="h-3 w-3 ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export function FeatureTour() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (completed) return;

    const timeout = setTimeout(() => {
      const pageSteps = pathname === '/dashboard'
        ? DASHBOARD_STEPS
        : PAGE_STEPS[pathname] || [];

      if (pageSteps.length > 0) {
        const hasTargets = pageSteps.every(s => document.querySelector(s.target));
        if (hasTargets) {
          setSteps(pageSteps);
          setStepIndex(0);
          setActive(true);
        }
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [pathname]);

  const dismiss = useCallback(() => {
    setActive(false);
    if (pathname === '/dashboard') {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    }
  }, [pathname]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      dismiss();
    } else {
      setStepIndex(i => i + 1);
    }
  }, [stepIndex, steps.length, dismiss]);

  const prev = useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  if (!active || steps.length === 0) return null;

  return (
    <TourTooltip
      step={steps[stepIndex]}
      stepIndex={stepIndex}
      totalSteps={steps.length}
      onNext={next}
      onPrev={prev}
      onSkip={dismiss}
    />
  );
}
