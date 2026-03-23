'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TOUR_STORAGE_KEY = 'ledgly-tour-completed';
const TOUR_START_EVENT = 'ledgly-tour-start';

interface TourStep {
  path: string;
  target: string;
  title: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    path: '/dashboard',
    target: '[data-tour="dashboard-stats"]',
    title: 'Welcome to Ledgly',
    content: 'This is your financial dashboard — unpaid dues, total collected, member count, and overdue charges at a glance.',
    placement: 'bottom',
  },
  {
    path: '/members',
    target: '[data-tour="members-list"]',
    title: 'Members',
    content: 'Add your organization\'s members here. Import from CSV, add manually, or paste a list into the AI assistant.',
    placement: 'top',
  },
  {
    path: '/charges',
    target: '[data-tour="charges-list"]',
    title: 'Charges (Dues & Fees)',
    content: 'Create charges to track what members owe — dues, event fees, T-shirts, etc. Members get notified by email.',
    placement: 'top',
  },
  {
    path: '/payments',
    target: '[data-tour="payments-list"]',
    title: 'Payments',
    content: 'Track incoming payments. Import from Venmo, Zelle, bank sync, or add manually. Payments auto-match to members.',
    placement: 'top',
  },
  {
    path: '/spreadsheet',
    target: '[data-tour="spreadsheet-view"]',
    title: 'Ledger',
    content: 'Your full financial ledger in a spreadsheet view. See charges, payments, and expenses together. Sort, filter, and export to CSV.',
    placement: 'top',
  },
  {
    path: '/agent',
    target: '[data-tour="agent-chat"]',
    title: 'AI Assistant',
    content: 'Manage everything with natural language. Try "charge everyone $50 for dues" or "who hasn\'t paid?" — LedgelyAI handles the rest.',
    placement: 'left',
  },
  {
    path: '/settings',
    target: '[data-tour="nav-settings"]',
    title: 'Settings',
    content: 'Set up payment methods (Venmo, Zelle, CashApp), connect chat channels (GroupMe, Discord, Slack), and configure your org.',
    placement: 'right',
  },
];

export function startTour() {
  window.dispatchEvent(new CustomEvent(TOUR_START_EVENT));
}

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
  const [positioned, setPositioned] = useState(false);

  useEffect(() => {
    setPositioned(false);
    const position = () => {
      const target = document.querySelector(step.target);
      if (!target || !ref.current) return false;

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;

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

      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      (target as HTMLElement).style.position = 'relative';
      (target as HTMLElement).style.zIndex = '10000';
      setPositioned(true);
      return true;
    };

    // Retry positioning until target is rendered (page may still be loading)
    if (position()) return;
    const interval = setInterval(() => {
      if (position()) clearInterval(interval);
    }, 200);
    const timeout = setTimeout(() => clearInterval(interval), 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      const target = document.querySelector(step.target);
      if (target) {
        (target as HTMLElement).style.position = '';
        (target as HTMLElement).style.zIndex = '';
      }
    };
  }, [step]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[9999]" onClick={onSkip} />
      <div
        ref={ref}
        className="bg-card border rounded-xl shadow-lg p-4 max-w-xs z-[10001] animate-in fade-in zoom-in-95 duration-200"
        style={{ visibility: positioned ? 'visible' : 'hidden' }}
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
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Navigate to the step's page when stepIndex changes
  useEffect(() => {
    if (!active) return;
    const step = TOUR_STEPS[stepIndex];
    if (!step) return;
    if (pathname !== step.path) {
      router.push(step.path);
    }
  }, [active, stepIndex, pathname, router]);

  const launch = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    const firstStep = TOUR_STEPS[0];
    if (pathname !== firstStep.path) {
      router.push(firstStep.path);
    }
  }, [pathname, router]);

  // Auto-start on first dashboard visit
  useEffect(() => {
    if (pathname !== '/dashboard') return;
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (completed) return;

    const timeout = setTimeout(() => {
      setStepIndex(0);
      setActive(true);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [pathname]);

  // Listen for manual start (from settings button)
  useEffect(() => {
    const handler = () => launch();
    window.addEventListener(TOUR_START_EVENT, handler);
    return () => window.removeEventListener(TOUR_START_EVENT, handler);
  }, [launch]);

  const dismiss = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
  }, []);

  const next = useCallback(() => {
    if (stepIndex >= TOUR_STEPS.length - 1) {
      dismiss();
    } else {
      setStepIndex(i => i + 1);
    }
  }, [stepIndex, dismiss]);

  const prev = useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  if (!active) return null;

  const step = TOUR_STEPS[stepIndex];
  if (!step) return null;

  // Only render tooltip when we're on the correct page
  if (pathname !== step.path) return null;

  return (
    <TourTooltip
      step={step}
      stepIndex={stepIndex}
      totalSteps={TOUR_STEPS.length}
      onNext={next}
      onPrev={prev}
      onSkip={dismiss}
    />
  );
}
