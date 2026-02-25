'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTutorialStore } from '@/lib/stores/tutorial';
import { tourSteps } from '@/lib/tour-steps';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 12;
const POPOVER_WIDTH = 340;
const POPOVER_HEIGHT_ESTIMATE = 230;
const VIEWPORT_MARGIN = 12;
const GAP = 16;

/**
 * Clip spotlight rect to viewport bounds.
 * Elements that extend beyond the viewport are simply cut off at the edge.
 */
function clipToViewport(rect: SpotlightRect): SpotlightRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const top = Math.max(0, rect.top);
  const left = Math.max(0, rect.left);
  const right = Math.min(vw, rect.left + rect.width);
  const bottom = Math.min(vh, rect.top + rect.height);

  return {
    top,
    left,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  };
}

export function TourOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const { isActive, currentStep, next, prev, stop, markComplete } =
    useTutorialStore();

  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(
    null,
  );
  const [isNavigating, setIsNavigating] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const rafRef = useRef<number>(0);

  const step = tourSteps[currentStep];
  const isLastStep = currentStep === tourSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const measureAndSet = useCallback(
    (el: Element) => {
      const rect = el.getBoundingClientRect();
      // Reduce padding on edges that touch the viewport boundary
      const padLeft = rect.left < SPOTLIGHT_PADDING ? 0 : SPOTLIGHT_PADDING;
      const padTop = rect.top < SPOTLIGHT_PADDING ? 0 : SPOTLIGHT_PADDING;
      const raw: SpotlightRect = {
        top: rect.top - padTop,
        left: rect.left - padLeft,
        width: rect.width + padLeft + SPOTLIGHT_PADDING,
        height: rect.height + padTop + SPOTLIGHT_PADDING,
      };
      setSpotlightRect(clipToViewport(raw));
      setIsNavigating(false);
    },
    [],
  );

  const updateSpotlight = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) {
      setSpotlightRect(null);
      return;
    }

    // Scroll element into view if it's off-screen, then measure
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

    // Small delay for scroll to settle
    setTimeout(() => measureAndSet(el), 80);
  }, [step, measureAndSet]);

  // Navigate + find target element
  useEffect(() => {
    if (!isActive || !step) return;

    if (step.page && pathname !== step.page) {
      setIsNavigating(true);
      setSpotlightRect(null);
      router.push(step.page);
      return;
    }

    const el = document.querySelector(step.target);
    if (el) {
      updateSpotlight();
    } else {
      setIsNavigating(true);
    }

    observerRef.current?.disconnect();
    observerRef.current = new MutationObserver(() => {
      const target = document.querySelector(step.target);
      if (target) {
        setTimeout(updateSpotlight, 150);
        observerRef.current?.disconnect();
      }
    });
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [isActive, step, pathname, router, updateSpotlight]);

  // Recalculate on resize / scroll
  useEffect(() => {
    if (!isActive || !step) return;

    const handleUpdate = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const el = document.querySelector(step.target);
        if (el) measureAndSet(el);
      });
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, step, measureAndSet]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        if (!isFirstStep) prev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isFirstStep, isLastStep, currentStep]);

  const handleNext = () => {
    if (isLastStep) {
      markComplete();
    } else {
      next();
    }
  };

  const handleSkip = () => {
    markComplete();
  };

  if (!isActive || !step) return null;

  // --- Popover position (pure math, no transforms) ---
  const getPopoverPos = (): { top: number; left: number } => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!spotlightRect) {
      return {
        top: vh / 2 - POPOVER_HEIGHT_ESTIMATE / 2,
        left: vw / 2 - POPOVER_WIDTH / 2,
      };
    }

    const sr = spotlightRect;
    let top: number;
    let left: number;

    switch (step.placement) {
      case 'right':
        top = sr.top + sr.height / 2 - POPOVER_HEIGHT_ESTIMATE / 2;
        left = sr.left + sr.width + GAP;
        break;
      case 'left':
        top = sr.top + sr.height / 2 - POPOVER_HEIGHT_ESTIMATE / 2;
        left = sr.left - GAP - POPOVER_WIDTH;
        break;
      case 'bottom':
        top = sr.top + sr.height + GAP;
        left = sr.left + sr.width / 2 - POPOVER_WIDTH / 2;
        break;
      case 'top':
      default:
        top = sr.top - GAP - POPOVER_HEIGHT_ESTIMATE;
        left = sr.left + sr.width / 2 - POPOVER_WIDTH / 2;
        break;
    }

    // If preferred placement puts the popover off-screen, flip it
    if (step.placement === 'top' && top < VIEWPORT_MARGIN) {
      // Flip to bottom
      top = sr.top + sr.height + GAP;
    } else if (step.placement === 'bottom' && top + POPOVER_HEIGHT_ESTIMATE > vh - VIEWPORT_MARGIN) {
      // Flip to top
      top = sr.top - GAP - POPOVER_HEIGHT_ESTIMATE;
    } else if (step.placement === 'right' && left + POPOVER_WIDTH > vw - VIEWPORT_MARGIN) {
      // Flip to left
      left = sr.left - GAP - POPOVER_WIDTH;
    } else if (step.placement === 'left' && left < VIEWPORT_MARGIN) {
      // Flip to right
      left = sr.left + sr.width + GAP;
    }

    // Final clamp to viewport
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - POPOVER_WIDTH - VIEWPORT_MARGIN));
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - POPOVER_HEIGHT_ESTIMATE - VIEWPORT_MARGIN));

    return { top, left };
  };

  const popoverPos = getPopoverPos();

  return (
    <>
      {/* Backdrop with spotlight cutout via box-shadow */}
      <div
        className="fixed z-[60] pointer-events-none transition-all duration-300"
        style={
          spotlightRect
            ? {
                top: spotlightRect.top,
                left: spotlightRect.left,
                width: spotlightRect.width,
                height: spotlightRect.height,
                borderRadius: 12,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
              }
            : {
                inset: 0,
                background: 'rgba(0, 0, 0, 0.6)',
              }
        }
      />

      {/* Click-capture layer */}
      <div className="fixed inset-0 z-[60]" onClick={handleSkip} />

      {/* Spotlight border ring (clamped to viewport) */}
      {spotlightRect && (
        <div
          className="fixed z-[61] pointer-events-none transition-all duration-300"
          style={{
            top: Math.max(0, spotlightRect.top - 2),
            left: Math.max(0, spotlightRect.left - 2),
            width: spotlightRect.width + 4 - Math.max(0, -(spotlightRect.left - 2)),
            height: spotlightRect.height + 4 - Math.max(0, -(spotlightRect.top - 2)),
            borderRadius: 14,
            border: '2px solid hsl(var(--primary) / 0.6)',
          }}
        />
      )}

      {/* Popover card */}
      <div
        className={cn(
          'fixed z-[62] rounded-xl bg-card border border-border/50 shadow-layered-lg p-5 animate-in-scale',
        )}
        style={{
          top: popoverPos.top,
          left: popoverPos.left,
          width: POPOVER_WIDTH,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step counter */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-muted-foreground">
            {currentStep + 1} of {tourSteps.length}
          </span>
          <button
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-secondary rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{
              width: `${((currentStep + 1) / tourSteps.length) * 100}%`,
            }}
          />
        </div>

        {/* Content */}
        <h3 className="text-base font-semibold mb-1.5">{step.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {step.description}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <Button variant="outline" size="sm" onClick={prev}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              className="bg-gradient-to-r from-primary to-blue-400 hover:opacity-90"
              disabled={isNavigating}
            >
              {isLastStep ? (
                'Finish'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
