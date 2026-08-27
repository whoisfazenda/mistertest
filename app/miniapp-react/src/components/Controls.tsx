import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { EASE } from '../lib/format';
import { haptic } from '../lib/telegram';

/** Count-up from 0 to `value` over 0.8s, formatted with `render`. */
export function CountUp({
  value,
  duration = 0.8,
  render,
}: {
  value: number;
  duration?: number;
  render: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      setDisplay(value);
      return;
    }
    startedRef.current = true;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{render(display)}</>;
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={() => {
        haptic('light');
        onChange(!checked);
      }}
      className={`flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] transition-colors ${
        checked ? 'bg-white' : 'bg-white/10'
      }`}
      aria-checked={checked}
      role="switch"
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 550, damping: 32 }}
        animate={{ x: checked ? 20 : 0 }}
        className={`h-[22px] w-[22px] rounded-full shadow-md ${checked ? 'bg-black' : 'bg-white'}`}
      />
    </motion.button>
  );
}

export function SkeletonRow({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-card border border-white/[0.06] bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center gap-4">
        <div className="skeleton h-14 w-14 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/5" />
          <div className="skeleton h-3 w-2/5" />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton mb-2 h-10 w-full" />
      ))}
    </div>
  );
}

/** Sliding pill indicator shared across tab/pill groups via layoutId namespace. */
export function Pill({
  active,
  onClick,
  children,
  layoutGroup,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  layoutGroup: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={() => {
        haptic('light');
        onClick();
      }}
      className={`relative shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
        active ? 'text-black font-semibold' : 'text-txt2'
      }`}
    >
      {active && (
        <motion.span
          layoutId={`pill-${layoutGroup}`}
          transition={{ duration: 0.35, ease: EASE }}
          className="absolute inset-0 rounded-full bg-white shadow-md"
        />
      )}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
