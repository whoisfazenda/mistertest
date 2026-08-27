import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const TRIGGER = 72;

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

/** Custom pull-to-refresh with a lavender spinner (no native indicator). */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armedRef = useRef(false);
  const rawPull = useMotionValue(0);
  const pull = useSpring(rawPull, { stiffness: 420, damping: 38 });

  useEffect(() => {
    const onStart = (e: TouchEvent): void => {
      if (window.scrollY > 2 || refreshing) return;
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent): void => {
      if (startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) {
        rawPull.set(0);
        return;
      }
      // Rubber-band easing
      rawPull.set(Math.min(Math.pow(delta, 0.82), TRIGGER * 1.3));
    };
    const onEnd = (): void => {
      if (startY.current === null) return;
      startY.current = null;
      if (rawPull.get() >= TRIGGER && !refreshing) {
        armedRef.current = true;
        setRefreshing(true);
        onRefresh().finally(() => {
          setRefreshing(false);
          armedRef.current = false;
          rawPull.set(0);
        });
      } else {
        rawPull.set(0);
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [onRefresh, refreshing, rawPull]);

  return (
    <>
      <motion.div
        style={{ y: pull }}
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
      >
        <motion.div
          animate={
            refreshing
              ? { rotate: 360, opacity: 1 }
              : { rotate: 0, opacity: pull.get() > TRIGGER ? 1 : 0.6 }
          }
          transition={
            refreshing
              ? { repeat: Infinity, duration: 0.8, ease: 'linear' }
              : undefined
          }
          className="mt-[calc(12px+var(--safe-top))] h-7 w-7 rounded-full border-2 border-white/20 border-t-white"
        />
      </motion.div>
      <motion.div style={{ y: pull }}>{children}</motion.div>
    </>
  );
}
