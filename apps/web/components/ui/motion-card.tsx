'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface MotionCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  delay?: number;
}

const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ className, hover = true, delay = 0, children, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl bg-card text-card-foreground shadow-layered-sm animate-in-up',
          hover && 'transition-all duration-200 hover:shadow-layered-md hover:-translate-y-0.5',
          className,
        )}
        style={delay ? { animationDelay: `${delay}s`, ...style } : style}
        {...props}
      >
        {children}
      </div>
    );
  },
);
MotionCard.displayName = 'MotionCard';

const MotionCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
MotionCardHeader.displayName = 'MotionCardHeader';

const MotionCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
MotionCardTitle.displayName = 'MotionCardTitle';

const MotionCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
MotionCardDescription.displayName = 'MotionCardDescription';

const MotionCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
MotionCardContent.displayName = 'MotionCardContent';

export {
  MotionCard,
  MotionCardHeader,
  MotionCardTitle,
  MotionCardDescription,
  MotionCardContent,
};
