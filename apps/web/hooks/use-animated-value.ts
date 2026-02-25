'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lightweight spring animation using requestAnimationFrame.
 * Mimics framer-motion useSpring with stiffness:100, damping:30.
 */
export function useAnimatedValue(target: number, enabled: boolean) {
  const [display, setDisplay] = useState(target);
  const current = useRef(target);
  const velocity = useRef(0);
  const raf = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      setDisplay(target);
      current.current = target;
      return;
    }

    // Spring parameters (matched to original framer-motion stiffness:100, damping:30)
    const stiffness = 100;
    const damping = 30;
    const precision = 0.5;

    let lastTime = performance.now();

    function step(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.064);
      lastTime = now;

      const displacement = current.current - target;
      const springForce = -stiffness * displacement - damping * velocity.current;
      velocity.current += springForce * dt;
      current.current += velocity.current * dt;

      if (Math.abs(displacement) < precision && Math.abs(velocity.current) < precision) {
        current.current = target;
        velocity.current = 0;
        setDisplay(target);
        return;
      }

      setDisplay(Math.round(current.current));
      raf.current = requestAnimationFrame(step);
    }

    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, enabled]);

  return display;
}
