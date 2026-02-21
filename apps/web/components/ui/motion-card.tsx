'use client';

import * as React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MotionCardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
  hover?: boolean;
  delay?: number;
}

const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ className, hover = true, delay = 0, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay }}
        whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
        whileTap={hover ? { scale: 0.98 } : undefined}
        className={cn(
          'rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md',
          className,
        )}
        {...props}
      >
        {children}
      </motion.div>
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
    className={cn('flex flex-col space-y-1.5 p-5', className)}
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
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
));
MotionCardContent.displayName = 'MotionCardContent';

export {
  MotionCard,
  MotionCardHeader,
  MotionCardTitle,
  MotionCardDescription,
  MotionCardContent,
};
