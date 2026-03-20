'use client';

import { type ReactNode, type CSSProperties } from 'react';
import { useInView } from '@/hooks/use-in-view';
import { cn } from '@/lib/utils';

type Direction = 'up' | 'down' | 'left' | 'right' | 'scale';

interface ScrollRevealProps {
  children: ReactNode;
  delay?: number;
  direction?: Direction;
  duration?: number;
  className?: string;
}

const directionStyles: Record<Direction, CSSProperties> = {
  up: { transform: 'translateY(40px)' },
  down: { transform: 'translateY(-40px)' },
  left: { transform: 'translateX(40px)' },
  right: { transform: 'translateX(-40px)' },
  scale: { transform: 'scale(0.9)' },
};

export function ScrollReveal({
  children,
  delay = 0,
  direction = 'up',
  duration = 600,
  className,
}: ScrollRevealProps) {
  const { ref, isInView } = useInView({ threshold: 0.1, triggerOnce: true });

  const hiddenStyle: CSSProperties = {
    opacity: 0,
    ...directionStyles[direction],
    transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
  };

  const visibleStyle: CSSProperties = {
    opacity: 1,
    transform: 'translateY(0) translateX(0) scale(1)',
    transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
  };

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={cn(className)}
      style={isInView ? visibleStyle : hiddenStyle}
    >
      {children}
    </div>
  );
}
