import { motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { getTabs, tabIndexFromPath } from '../lib/tabs';
import { useTabFlow } from './TabFlow';
import { haptic } from '../lib/telegram';
import { useAppStore } from '../store/useAppStore';

export function BottomNav() {
  const location = useLocation();
  const flow = useTabFlow();
  const user = useAppStore((s) => s.user);
  const isAdmin = Boolean(user?.isAdmin);
  const tabs = getTabs(isAdmin);

  const trackRef = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState(0);

  const initialIndex = Math.max(0, tabIndexFromPath(location.pathname, isAdmin));
  const [active, setActive] = useState(initialIndex);
  const fallback = useMotionValue(initialIndex);
  const progress = flow?.progress ?? fallback;
  const drag = useRef({ active: false, startX: 0, startProgress: 0, moved: false });

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setSlot(el.clientWidth / tabs.length);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tabs.length]);

  useEffect(() => {
    const idx = tabIndexFromPath(location.pathname, isAdmin);
    if (idx >= 0) {
      setActive(idx);
    }
  }, [location.pathname, isAdmin]);

  useMotionValueEvent(progress, 'change', (val) => {
    setActive(Math.round(val));
  });

  const lensX = useTransform(progress, (v) => v * slot);

  const snapFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width - 1);
    const next = Math.min(tabs.length - 1, Math.max(0, Math.round((x / rect.width) * tabs.length - 0.0001)));
    flow?.goTo(next);
  };

  const handleTabClick = (index: number) => {
    if (drag.current.moved) return;
    haptic('light');
    flow?.goTo(index);
  };

  return (
    <motion.nav
      initial={{ y: 90, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-x-0 bottom-0 z-40 px-3 pointer-events-auto select-none"
      style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}
    >
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          drag.current = {
            active: true,
            startX: e.clientX,
            startProgress: progress.get(),
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          if (!drag.current.active || !slot) return;
          const delta = (e.clientX - drag.current.startX) / slot;
          if (Math.abs(e.clientX - drag.current.startX) > 5) {
            drag.current.moved = true;
          }
          progress.set(Math.min(tabs.length - 1, Math.max(0, drag.current.startProgress + delta)));
        }}
        onPointerUp={(e) => {
          if (!drag.current.active) return;
          drag.current.active = false;
          if (drag.current.moved) {
            snapFromClientX(e.clientX);
          }
        }}
        className="relative mx-auto flex h-[66px] max-w-md touch-none items-center justify-around rounded-[30px] border border-white/[0.12] bg-[#0c0c10]/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
      >
        {/* Restored Frosted Glass Active Bubble */}
        {slot > 0 && (
          <motion.div
            className="pointer-events-none absolute top-1.5 bottom-1.5 rounded-[24px] border border-white/25 bg-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-md"
            style={{ width: slot - 8, x: lensX, left: 4 }}
          />
        )}

        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = active === index;

          return (
            <button
              key={tab.path}
              onClick={() => handleTabClick(index)}
              className="relative z-10 flex flex-1 h-full flex-col items-center justify-center rounded-[24px] transition-transform active:scale-95"
            >
              <Icon
                size={20}
                strokeWidth={isActive ? 2.4 : 1.7}
                className={`transition-colors duration-200 ${
                  isActive ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'text-zinc-500'
                }`}
              />
              <span
                className={`mt-1 text-[10px] tracking-tight transition-colors duration-200 ${
                  isActive ? 'text-white font-bold' : 'text-zinc-500 font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
